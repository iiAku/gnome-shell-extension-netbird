import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import St from "gi://St";
import Clutter from "gi://Clutter";

import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { PACKAGE_VERSION as ShellVersion } from "resource:///org/gnome/shell/misc/config.js";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { NetbirdClient } from "./netbird-client.js";
import { NetbirdState, type NetbirdStateValue } from "./netbird-state.js";
import { type NetbirdOptions } from "./netbird-args.js";
import { NetbirdError, NetbirdLoginRequiredError } from "./netbird-errors.js";
import { formatErrorReport, type ErrorContext } from "./error-report.js";
import { SettingsKeys } from "./settings.js";
import {
    Defaults,
    DotAssets,
    ExtensionLogPrefix,
    ExternalUrls,
    FileMonitorSignalChanged,
    IconAssets,
    IconSubdir,
    InterfaceEventDebounceMs,
    MenuOpenPollIntervalS,
    MenuSignalActivate,
    MenuSignalOpenStateChanged,
    PollMode,
    type PollModeValue,
    PanelIconSize,
    PanelMenuAlignment,
    PanelName,
    SettingsSignalPollChanged,
    StatusDotSize,
    StatusIconStyleClass,
    SwitchSignalToggled,
    SysNetPath,
    UiLabels,
} from "./constants.js";

const ICON_BY_STATE = {
    [NetbirdState.Connected]: IconAssets.Connected,
    [NetbirdState.Connecting]: IconAssets.Connecting,
    [NetbirdState.Disconnected]: IconAssets.Disconnected,
    [NetbirdState.NeedsLogin]: IconAssets.Connecting,
    [NetbirdState.Error]: IconAssets.Error,
    [NetbirdState.Unknown]: IconAssets.Disconnected,
} as const satisfies Record<NetbirdStateValue, string>;

const DOT_BY_STATE = {
    [NetbirdState.Connected]: DotAssets.Green,
    [NetbirdState.Connecting]: DotAssets.Yellow,
    [NetbirdState.Disconnected]: DotAssets.Gray,
    [NetbirdState.NeedsLogin]: DotAssets.Yellow,
    [NetbirdState.Error]: DotAssets.Red,
    [NetbirdState.Unknown]: DotAssets.Gray,
} as const satisfies Record<NetbirdStateValue, string>;

const LABEL_BY_STATE = {
    [NetbirdState.Connected]: UiLabels.Connected,
    [NetbirdState.Connecting]: UiLabels.Connecting,
    [NetbirdState.Disconnected]: UiLabels.Disconnected,
    [NetbirdState.NeedsLogin]: UiLabels.NeedsLogin,
    [NetbirdState.Error]: UiLabels.Error,
    [NetbirdState.Unknown]: UiLabels.Unknown,
} as const satisfies Record<NetbirdStateValue, string>;

class NetbirdIndicatorClass extends PanelMenu.Button {
    private readonly _extension: Extension;
    private readonly _settings: Gio.Settings;
    private readonly _client: NetbirdClient;
    private readonly _icon: St.Icon;
    private readonly _statusItem: PopupMenu.PopupBaseMenuItem;
    private readonly _statusDot: St.Icon;
    private readonly _statusLabel: St.Label;
    private readonly _connectItem: PopupMenu.PopupMenuItem;
    private readonly _disconnectItem: PopupMenu.PopupMenuItem;
    private readonly _daemonVersionItem: PopupMenu.PopupMenuItem;
    // Every boolean switch tracked via _addBoundSwitch registers its
    // `toggled` signal id and its `changed::<key>` settings signal id here
    // for cleanup in destroy(). Centralized so we never forget one.
    private readonly _switchBindings: Array<{
        readonly item: PopupMenu.PopupSwitchMenuItem;
        readonly toggledSignalId: number;
        readonly changedSignalId: number;
    }> = [];
    private _pollSourceId: number | null = null;
    private _pollMode: PollModeValue = PollMode.Idle;
    private _settingsChangedId: number | null = null;
    private _interfaceMonitor: Gio.FileMonitor | null = null;
    private _interfaceMonitorSignalId: number = 0;
    private _debounceSourceId: number | null = null;
    private _menuOpenSignalId: number = 0;
    private _busy: boolean = false;
    private _destroyed: boolean = false;
    private _aborted: boolean = false;
    private _restartPending: boolean = false;
    private _currentState: NetbirdStateValue = NetbirdState.Unknown;
    private _daemonVersion: string | null = null;

    constructor(extension: Extension) {
        super(PanelMenuAlignment, PanelName, false);

        this._extension = extension;
        this._settings = extension.getSettings();
        this._client = new NetbirdClient();

        this._icon = new St.Icon({
            gicon: this._loadIcon(ICON_BY_STATE[NetbirdState.Unknown]),
            style_class: StatusIconStyleClass,
            icon_size: PanelIconSize,
        });
        this.add_child(this._icon);

        const menu = this.menu as PopupMenu.PopupMenu;

        // Status row: colored dot + label (mirrors netbird-ui header).
        this._statusItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: "netbird-status-row",
        });
        this._statusDot = new St.Icon({
            gicon: this._loadIcon(DOT_BY_STATE[NetbirdState.Unknown]),
            icon_size: StatusDotSize,
            style_class: "netbird-status-dot",
        });
        this._statusLabel = new St.Label({
            text: UiLabels.Loading,
            style_class: "netbird-status-label",
            y_align: Clutter.ActorAlign.CENTER,
        });
        const statusBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            style_class: "netbird-status-box",
        });
        statusBox.add_child(this._statusDot);
        statusBox.add_child(this._statusLabel);
        this._statusItem.add_child(statusBox);
        menu.addMenuItem(this._statusItem);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Explicit Connect / Disconnect items — matches netbird-ui.
        // Sensitivity tracks current state; no re-entry risk.
        this._connectItem = new PopupMenu.PopupMenuItem(UiLabels.Connect);
        this._connectItem.connect(MenuSignalActivate, () => {
            void this._handleConnect();
        });
        menu.addMenuItem(this._connectItem);

        this._disconnectItem = new PopupMenu.PopupMenuItem(UiLabels.Disconnect);
        this._disconnectItem.connect(MenuSignalActivate, () => {
            void this._handleDisconnect();
        });
        menu.addMenuItem(this._disconnectItem);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings submenu (Connect on Startup / Notifications / Advanced…)
        const settingsSubmenu = new PopupMenu.PopupSubMenuMenuItem(UiLabels.Settings);

        this._addBoundSwitch(
            settingsSubmenu,
            UiLabels.ConnectOnStartup,
            SettingsKeys.ConnectOnStartup,
        );

        this._addBoundSwitch(
            settingsSubmenu,
            UiLabels.NotificationsSetting,
            SettingsKeys.ShowNotifications,
        );

        settingsSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // `netbird up` feature flags. Toggling any of these while connected
        // triggers an automatic reconnect (down → up) so the new flag value
        // takes effect immediately.
        this._addBoundSwitch(settingsSubmenu, UiLabels.AllowSsh, SettingsKeys.AllowSsh, {
            reconnectOnChange: true,
        });
        this._addBoundSwitch(
            settingsSubmenu,
            UiLabels.EnableRosenpass,
            SettingsKeys.EnableRosenpass,
            { reconnectOnChange: true },
        );
        this._addBoundSwitch(
            settingsSubmenu,
            UiLabels.EnableLazyConnection,
            SettingsKeys.EnableLazyConnection,
            { reconnectOnChange: true },
        );
        this._addBoundSwitch(settingsSubmenu, UiLabels.BlockInbound, SettingsKeys.BlockInbound, {
            reconnectOnChange: true,
        });

        settingsSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const debugBundleItem = new PopupMenu.PopupMenuItem(UiLabels.CreateDebugBundle);
        debugBundleItem.connect(MenuSignalActivate, () => {
            void this._handleDebugBundle();
        });
        settingsSubmenu.menu.addMenuItem(debugBundleItem);

        const advancedItem = new PopupMenu.PopupMenuItem(UiLabels.AdvancedSettings);
        advancedItem.connect(MenuSignalActivate, () => {
            this._extension.openPreferences();
        });
        settingsSubmenu.menu.addMenuItem(advancedItem);

        menu.addMenuItem(settingsSubmenu);

        // About submenu (versions + external links)
        const aboutSubmenu = new PopupMenu.PopupSubMenuMenuItem(UiLabels.About);

        const guiVersionItem = new PopupMenu.PopupMenuItem(
            UiLabels.AboutGuiVersion(this._extensionVersion()),
        );
        guiVersionItem.setSensitive(false);
        aboutSubmenu.menu.addMenuItem(guiVersionItem);

        this._daemonVersionItem = new PopupMenu.PopupMenuItem(UiLabels.AboutVersionUnknown);
        this._daemonVersionItem.setSensitive(false);
        aboutSubmenu.menu.addMenuItem(this._daemonVersionItem);

        aboutSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const githubItem = new PopupMenu.PopupMenuItem(UiLabels.AboutGithub);
        githubItem.connect(MenuSignalActivate, () => {
            this._openUrl(ExternalUrls.GithubRepo);
        });
        aboutSubmenu.menu.addMenuItem(githubItem);

        const downloadItem = new PopupMenu.PopupMenuItem(UiLabels.AboutDownloadLatest);
        downloadItem.connect(MenuSignalActivate, () => {
            this._openUrl(ExternalUrls.LatestRelease);
        });
        aboutSubmenu.menu.addMenuItem(downloadItem);

        menu.addMenuItem(aboutSubmenu);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem(UiLabels.RefreshNow);
        refreshItem.connect(MenuSignalActivate, () => {
            void this._refresh();
        });
        menu.addMenuItem(refreshItem);

        const quitItem = new PopupMenu.PopupMenuItem(UiLabels.Quit);
        quitItem.connect(MenuSignalActivate, () => {
            void this._handleQuit();
        });
        menu.addMenuItem(quitItem);

        this._settingsChangedId = this._settings.connect(SettingsSignalPollChanged, () => {
            this._restartPolling();
        });

        // React instantly to WireGuard interface changes (inotify on sysfs).
        // This is the push-style path — no periodic subprocess needed to
        // notice netbird going up or down.
        this._startInterfaceMonitor();

        // Refresh the moment the user opens the menu, and fast-poll while the
        // menu is visible so transitional states (Connecting → Connected) feel
        // instant. Revert to safety-net cadence on close.
        this._menuOpenSignalId = (this.menu as PopupMenu.PopupMenu).connect(
            MenuSignalOpenStateChanged,
            (_menu, open: boolean) => {
                if (open) {
                    void this._refresh();
                    this._setPollMode(PollMode.MenuOpen);
                } else {
                    this._setPollMode(PollMode.Idle);
                }
                return false;
            },
        );

        // Initial sensitivity — disable both until first refresh resolves.
        this._applyState(NetbirdState.Unknown, null);

        this._startPolling();
        void this._initialize();
        void this._refreshDaemonVersion();
    }

    private _startInterfaceMonitor(): void {
        try {
            const sysNet = Gio.File.new_for_path(SysNetPath);
            this._interfaceMonitor = sysNet.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._interfaceMonitorSignalId = this._interfaceMonitor.connect(
                FileMonitorSignalChanged,
                () => {
                    this._scheduleDebouncedRefresh();
                },
            );
        } catch (e) {
            // BOUNDARY: sysfs inotify is best-effort. If it fails (unusual
            // kernel, container without /sys/class/net, etc.), fall back to
            // periodic polling only.
            const msg = e instanceof Error ? e.message : String(e);
            console.debug(`${ExtensionLogPrefix} interface monitor unavailable: ${msg}`);
        }
    }

    private _scheduleDebouncedRefresh(): void {
        if (this._destroyed) return;
        if (this._debounceSourceId !== null) {
            GLib.Source.remove(this._debounceSourceId);
        }
        this._debounceSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            InterfaceEventDebounceMs,
            () => {
                this._debounceSourceId = null;
                if (!this._destroyed) void this._refresh();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    private _setPollMode(mode: PollModeValue): void {
        if (this._pollMode === mode) return;
        this._pollMode = mode;
        this._restartPolling();
    }

    // First refresh + optional auto-connect. Runs sequentially so auto-connect
    // only fires once we know the current state and won't fight an already-up
    // session.
    private async _initialize(): Promise<void> {
        await this._refresh();
        if (this._destroyed) return;
        if (!this._settings.get_boolean(SettingsKeys.ConnectOnStartup)) return;
        if (this._currentState === NetbirdState.Connected) return;
        if (this._currentState === NetbirdState.Connecting) return;
        await this._handleConnect();
    }

    private _loadIcon(name: string): Gio.Icon {
        const file = Gio.File.new_for_path(this._extension.path)
            .get_child(IconSubdir)
            .get_child(name);
        return Gio.FileIcon.new(file);
    }

    private _extensionVersion(): string {
        const raw = this._extension.metadata["version"];
        if (typeof raw === "number") return raw.toString();
        if (typeof raw === "string") return raw;
        return "?";
    }

    private _options(): NetbirdOptions {
        return {
            url: this._settings.get_string(SettingsKeys.NetbirdUrl) || Defaults.NetbirdUrl,
            daemonAddr: this._settings.get_string(SettingsKeys.DaemonAddr) || Defaults.DaemonAddr,
            allowServerSsh: this._settings.get_boolean(SettingsKeys.AllowSsh),
            enableRosenpass: this._settings.get_boolean(SettingsKeys.EnableRosenpass),
            enableLazyConnection: this._settings.get_boolean(SettingsKeys.EnableLazyConnection),
            blockInbound: this._settings.get_boolean(SettingsKeys.BlockInbound),
        };
    }

    private _startPolling(): void {
        const raw = this._settings.get_uint(SettingsKeys.PollInterval);
        const interval =
            this._pollMode === PollMode.MenuOpen
                ? MenuOpenPollIntervalS
                : Math.max(3, Math.min(raw, 300));
        this._pollSourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            void this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    private _stopPolling(): void {
        if (this._pollSourceId !== null) {
            GLib.Source.remove(this._pollSourceId);
            this._pollSourceId = null;
        }
    }

    private _restartPolling(): void {
        this._stopPolling();
        this._startPolling();
    }

    private async _refresh(): Promise<void> {
        if (this._busy || this._destroyed) return;
        try {
            const status = await this._client.status(this._options());
            if (this._destroyed) return;
            this._applyState(status.state, status.fqdn ?? status.ip ?? null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`${ExtensionLogPrefix} refresh failed: ${msg}`);
            this._copyErrorReport(e);
            this._applyState(NetbirdState.Error, null);
        }
    }

    private async _refreshDaemonVersion(): Promise<void> {
        try {
            const result = await this._client.version(this._options());
            if (this._destroyed) return;
            if (result.version) {
                this._daemonVersion = result.version;
                this._daemonVersionItem.label.text = UiLabels.AboutDaemonVersion(result.version);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.debug(`${ExtensionLogPrefix} version lookup failed: ${msg}`);
        }
    }

    private _applyState(state: NetbirdStateValue, detail: string | null): void {
        if (state !== this._currentState) {
            console.debug(
                `${ExtensionLogPrefix} ${this._currentState} → ${state}${detail ? ` (${detail})` : ""}`,
            );
        }
        this._currentState = state;
        this._icon.gicon = this._loadIcon(ICON_BY_STATE[state]);
        this._statusDot.gicon = this._loadIcon(DOT_BY_STATE[state]);
        const label = LABEL_BY_STATE[state];
        this._statusLabel.text = detail ? `${label} — ${detail}` : label;

        // Connect label also acts as the cancel/retry affordance during an
        // in-flight SSO attempt — re-clicking it aborts the running `up` and
        // queues a fresh one (reopens the browser if the daemon closed it).
        if (state === NetbirdState.Connecting) {
            this._connectItem.label.text = UiLabels.ConnectConnecting;
            this._connectItem.setSensitive(true);
            this._disconnectItem.setSensitive(false);
            return;
        }

        this._connectItem.label.text = UiLabels.Connect;
        const connected = state === NetbirdState.Connected;
        this._connectItem.setSensitive(!connected);
        this._disconnectItem.setSensitive(connected);
    }

    private async _handleConnect(): Promise<void> {
        if (this._currentState === NetbirdState.Connected) return;

        // Re-click during an in-flight attempt: abort the running `up` and
        // queue a fresh one. The currently-running `_handleConnect` will see
        // `_restartPending` in its finally block and re-enter.
        if (this._busy) {
            this._restartPending = true;
            this._aborted = true;
            this._client.abort();
            return;
        }

        this._busy = true;
        this._aborted = false;
        this._applyState(NetbirdState.Connecting, null);
        try {
            await this._client.up(this._options());
        } catch (e) {
            if (this._aborted) {
                // Aborted by the user (re-click) — swallow; the restart path
                // will run a fresh attempt.
                console.debug(`${ExtensionLogPrefix} connect aborted by user`);
            } else {
                this._handleToggleError(e, true);
            }
        }
        this._busy = false;
        this._aborted = false;

        if (this._restartPending && !this._destroyed) {
            this._restartPending = false;
            // Fire the next attempt without awaiting — lets this handler
            // return promptly and avoids a growing await chain.
            void this._handleConnect();
            return;
        }
        await this._refresh();
    }

    private async _handleDisconnect(): Promise<void> {
        // Disconnect is only meaningful from a Connected state. During a
        // Connecting attempt, the cancel path is re-clicking Connect.
        if (this._busy) return;
        if (this._currentState !== NetbirdState.Connected) return;
        this._busy = true;
        this._applyState(NetbirdState.Connecting, null);
        try {
            await this._client.down(this._options());
        } catch (e) {
            this._handleToggleError(e, false);
        } finally {
            this._busy = false;
            await this._refresh();
        }
    }

    // Transparent reconnect: cycle down → up so that `netbird up` flags
    // (--allow-server-ssh, --enable-rosenpass, etc.) take effect immediately
    // without requiring the user to manually disconnect and reconnect.
    // If `up` fails after `down`, we retry once — losing the connection
    // silently would be worse than a brief extra attempt.
    private async _handleReconnect(): Promise<void> {
        if (this._busy) return;
        if (this._currentState !== NetbirdState.Connected) return;
        this._busy = true;
        this._applyState(NetbirdState.Connecting, null);
        try {
            await this._client.down(this._options());
            try {
                await this._client.up(this._options());
            } catch {
                console.debug(`${ExtensionLogPrefix} reconnect: up failed, retrying once`);
                await this._client.up(this._options());
            }
        } catch (e) {
            this._handleToggleError(e, true);
        } finally {
            this._busy = false;
            await this._refresh();
        }
    }

    private _handleToggleError(e: unknown, connecting: boolean): void {
        if (e instanceof NetbirdLoginRequiredError) {
            this._notifyLogin(e.loginUrl);
            return;
        }
        const fallback = connecting
            ? UiLabels.NotificationFailedConnect
            : UiLabels.NotificationFailedDisconnect;
        const msg = e instanceof NetbirdError ? e.message : fallback;
        this._copyErrorReport(e);
        this._notifyError(UiLabels.NotificationTitle, UiLabels.NotificationErrorCopied(msg));
        console.error(`${ExtensionLogPrefix} ${connecting ? "up" : "down"} failed: ${msg}`);
    }

    private _copyErrorReport(error: unknown): void {
        try {
            const report = formatErrorReport(error, this._errorContext());
            this._copyToClipboard(report);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.debug(`${ExtensionLogPrefix} failed to copy error report: ${msg}`);
        }
    }

    private _notifyLogin(url: string): void {
        this._notify(UiLabels.NotificationLoginRequired, UiLabels.NotificationOpeningBrowser(url));
        this._openUrl(url);
    }

    private _openUrl(url: string): void {
        // CRITICAL: launch_default_for_uri (sync) can block the JS main loop
        // on xdg-desktop-portal D-Bus calls, freezing the shell. Use the async
        // variant — it returns immediately and calls back on completion.
        Gio.AppInfo.launch_default_for_uri_async(url, null, null, (_src, res) => {
            try {
                Gio.AppInfo.launch_default_for_uri_finish(res);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`${ExtensionLogPrefix} browser launch failed: ${msg}`);
                this._notifyError(
                    UiLabels.NotificationTitle,
                    UiLabels.NotificationFailedBrowser(msg),
                );
            }
        });
    }

    // Adds a switch row bound to a gsetting. Two-way sync:
    //   - User toggles the switch → writes the gsetting.
    //   - Anything else changes the gsetting (prefs window, `gsettings set`,
    //     another shell session) → updates the switch state, with the
    //     `toggled` handler blocked to avoid feedback loops.
    // When `reconnectOnChange` is set and the user toggles while connected,
    // we transparently reconnect (down → up) so the flag applies immediately.
    private _addBoundSwitch(
        submenu: PopupMenu.PopupSubMenuMenuItem,
        label: string,
        key: string,
        opts: { readonly reconnectOnChange?: boolean } = {},
    ): PopupMenu.PopupSwitchMenuItem {
        const item = new PopupMenu.PopupSwitchMenuItem(label, this._settings.get_boolean(key));

        const toggledSignalId = item.connect(SwitchSignalToggled, (_item, on: boolean) => {
            this._settings.set_boolean(key, on);
            if (opts.reconnectOnChange && this._currentState === NetbirdState.Connected) {
                void this._handleReconnect();
            }
        });

        const changedSignalId = this._settings.connect(`changed::${key}`, () => {
            const next = this._settings.get_boolean(key);
            if (item.state === next) return;
            GObject.signal_handler_block(item, toggledSignalId);
            item.setToggleState(next);
            GObject.signal_handler_unblock(item, toggledSignalId);
        });

        this._switchBindings.push({ item, toggledSignalId, changedSignalId });
        submenu.menu.addMenuItem(item);
        return item;
    }

    private async _handleDebugBundle(): Promise<void> {
        try {
            const result = await this._client.debugBundle(this._options());
            this._notify(UiLabels.NotificationTitle, UiLabels.DebugBundleCreated(result.rawOutput));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`${ExtensionLogPrefix} debug bundle failed: ${msg}`);
            this._notifyError(UiLabels.NotificationTitle, UiLabels.DebugBundleFailed(msg));
        }
    }

    // User clicked Quit: gracefully disconnect netbird, then disable the
    // extension so the tray icon goes away. The extension's own disable()
    // lifecycle hook stays neutral — it must NOT touch netbird, because it
    // also fires on logout / Extensions-app toggle / crash recovery.
    private async _handleQuit(): Promise<void> {
        // Abort any in-flight `up` so the SSO subprocess doesn't linger.
        if (this._busy) {
            this._aborted = true;
            this._client.abort();
        }
        if (this._currentState === NetbirdState.Connected) {
            try {
                await this._client.down(this._options());
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.debug(`${ExtensionLogPrefix} quit: down failed: ${msg}`);
            }
        }
        if (this._destroyed) return;
        // Defer the disable call so we don't tear down the caller's own stack.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try {
                Main.extensionManager.disableExtension(this._extension.uuid);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`${ExtensionLogPrefix} quit: disable failed: ${msg}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    private _errorContext(): ErrorContext {
        return {
            extensionVersion: this._extensionVersion(),
            daemonVersion: this._daemonVersion,
            shellVersion: ShellVersion,
            sessionType: GLib.getenv("XDG_SESSION_TYPE") ?? "unknown",
            desktop: GLib.getenv("XDG_CURRENT_DESKTOP") ?? "unknown",
            os: GLib.get_os_info("PRETTY_NAME") ?? "unknown",
            state: this._currentState,
        };
    }

    private _copyToClipboard(text: string): void {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    }

    private _notificationsEnabled(): boolean {
        return this._settings.get_boolean(SettingsKeys.ShowNotifications);
    }

    private _notify(title: string, body: string): void {
        if (!this._notificationsEnabled()) return;
        Main.notify(title, body);
    }

    private _notifyError(title: string, body: string): void {
        if (!this._notificationsEnabled()) return;
        Main.notifyError(title, body);
    }

    override destroy(): void {
        this._destroyed = true;
        this._stopPolling();
        if (this._debounceSourceId !== null) {
            GLib.Source.remove(this._debounceSourceId);
            this._debounceSourceId = null;
        }
        if (this._interfaceMonitor && this._interfaceMonitorSignalId !== 0) {
            this._interfaceMonitor.disconnect(this._interfaceMonitorSignalId);
            this._interfaceMonitorSignalId = 0;
        }
        if (this._interfaceMonitor) {
            this._interfaceMonitor.cancel();
            this._interfaceMonitor = null;
        }
        if (this._menuOpenSignalId !== 0) {
            (this.menu as PopupMenu.PopupMenu).disconnect(this._menuOpenSignalId);
            this._menuOpenSignalId = 0;
        }
        if (this._settingsChangedId !== null) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        for (const binding of this._switchBindings) {
            binding.item.disconnect(binding.toggledSignalId);
            this._settings.disconnect(binding.changedSignalId);
        }
        this._switchBindings.length = 0;
        super.destroy();
    }
}

export const NetbirdIndicator = GObject.registerClass(NetbirdIndicatorClass);
export type NetbirdIndicatorInstance = InstanceType<typeof NetbirdIndicator>;
