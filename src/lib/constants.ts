// Single source of truth for all hardcoded strings / numbers used across the extension.
// Defaults are duplicated in schemas/org.gnome.shell.extensions.netbird-status.gschema.xml —
// if you change them here, update the gschema too.

export const Defaults = {
    NetbirdUrl: "https://api.netbird.io:443",
    DaemonAddr: "unix:///var/run/netbird.sock",
} as const;

export const TimeoutsMs = {
    Default: 15_000,
    // Safety net only — the UI lets the user abort a stuck SSO via
    // Disconnect, so this just bounds truly orphaned subprocesses.
    Up: 120_000,
    // Debug bundles zip logs, config, and state — can be slow on large installs.
    DebugBundle: 60_000,
    LoginSuppress: 10_000,
} as const;

// Debounce window for sysfs interface-monitor events. Several inotify events
// typically fire in quick succession when an interface comes up or down
// (add, set MAC, set flags, rename, etc.); we collapse them into one refresh.
export const InterfaceEventDebounceMs = 300 as const;

// Sysfs directory — each network interface is a child of this directory,
// including the WireGuard interface netbird brings up (`wt0` by default).
// Inotify on sysfs is reliable for directory-level CREATE/DELETE events.
export const SysNetPath = "/sys/class/net";

// Fast poll cadence while the menu is open — the user is actively looking at
// the UI, so we want near-realtime updates for transitional states.
export const MenuOpenPollIntervalS = 2 as const;

// Adaptive polling modes. "Idle" uses the gsetting interval (safety net);
// "MenuOpen" switches to MenuOpenPollIntervalS for instant feedback.
export const PollMode = {
    Idle: "idle",
    MenuOpen: "menuOpen",
} as const;
export type PollModeValue = (typeof PollMode)[keyof typeof PollMode];

// Signal names for PopupMenu open-state-changed + Gio.FileMonitor changed.
export const MenuSignalOpenStateChanged = "open-state-changed" as const;
export const FileMonitorSignalChanged = "changed" as const;

export const Binary = "netbird" as const;

export const CliVerbs = {
    Status: "status",
    Up: "up",
    Down: "down",
    Version: "version",
} as const;

export const CliFlags = {
    DaemonAddr: "--daemon-addr",
    ManagementUrl: "--management-url",
    AdminUrl: "--admin-url",
    AllowServerSsh: "--allow-server-ssh",
    EnableRosenpass: "--enable-rosenpass",
    // Note: singular `--enable-lazy-connection`, not plural.
    EnableLazyConnection: "--enable-lazy-connection",
    BlockInbound: "--block-inbound",
} as const;

// `netbird debug bundle` — produces a support zip with logs, config, and state.
export const DebugSubcommand = "debug" as const;
export const DebugBundleAction = "bundle" as const;

// Tokens we look for in raw `netbird status` output.
// Matched case-insensitively — keep lower-case.
export const NetbirdStatusTokens = {
    // Field prefixes for header-style parsing (e.g. `Management: Connected`)
    ManagementField: "management",
    DaemonField: "daemon status",
    FqdnField: "fqdn",
    NetbirdIpField: "netbird ip",

    // Daemon / management field values
    ValueConnected: "connected",
    ValueConnecting: "connecting",
    ValueDisconnected: "disconnected",
    ValueIdle: "idle",

    // Free-text phrases appearing in error / login-required output
    NeedsLoginPhrase: "needs login",
    NoSessionPhrase: "no session",
    DisconnectedPhrase: "disconnected",
    ErrorPhrase: "error",
    FailPhrase: "fail",
} as const;

export const IconAssets = {
    Connected: "netbird-connected.svg",
    Connecting: "netbird-connecting.svg",
    Disconnected: "netbird-disconnected.svg",
    Error: "netbird-error.svg",
} as const;

// Small colored dots shown next to the status label in the menu header,
// mirroring the netbird-ui design (macOS app).
export const DotAssets = {
    Green: "dot-green.svg",
    Gray: "dot-gray.svg",
    Yellow: "dot-yellow.svg",
    Red: "dot-red.svg",
} as const;

export const StatusDotSize = 10 as const;

export const PanelIconSize = 16 as const;

// `PanelMenu.Button` uses 0..1 for menu alignment (0 = left, 1 = right).
export const PanelMenuAlignment = 0 as const;

export const PanelPosition = "right" as const;

export const ExtensionLogPrefix = "[netbird-status]" as const;

export const PanelName = "NetBird Status" as const;

export const UiLabels = {
    // Menu items
    Loading: "Loading…",
    Connect: "Connect",
    ConnectConnecting: "Connecting… (click to retry)",
    Disconnect: "Disconnect",
    Quit: "Quit",
    RefreshNow: "Refresh now",
    Settings: "Settings",
    About: "About",
    AdvancedSettings: "Advanced Settings…",
    ConnectOnStartup: "Connect on Startup",
    NotificationsSetting: "Notifications",
    AllowSsh: "Allow SSH",
    EnableRosenpass: "Enable Quantum-Resistance",
    EnableLazyConnection: "Enable Lazy Connections",
    BlockInbound: "Block Inbound Connections",
    CreateDebugBundle: "Create Debug Bundle",
    DebugBundleCreated: (out: string) => `Debug bundle created:\n${out}`,
    DebugBundleFailed: (msg: string) => `Debug bundle failed: ${msg}`,
    AboutGithub: "GitHub",
    AboutDownloadLatest: "Download latest version",
    AboutGuiVersion: (v: string) => `GUI: v${v}`,
    AboutDaemonVersion: (v: string) => `Daemon: v${v}`,
    AboutVersionUnknown: "version: unknown",

    // Status line labels by state — bound at consumer side via UI_LABEL_BY_STATE
    Connected: "Connected",
    Connecting: "Connecting…",
    Disconnected: "Disconnected",
    NeedsLogin: "Login required",
    Error: "Error",
    Unknown: "Unknown",

    // Notifications
    NotificationTitle: "NetBird",
    NotificationLoginRequired: "NetBird login required",
    NotificationFailedConnect: "Failed to connect",
    NotificationFailedDisconnect: "Failed to disconnect",
    NotificationErrorCopied: (msg: string) => `${msg}\n\nError details copied to clipboard.`,
    NotificationOpeningBrowser: (url: string) => `Opening browser: ${url}`,
    NotificationFailedBrowser: (msg: string) => `Failed to open browser: ${msg}`,
} as const;

export const ExternalUrls = {
    GithubRepo: "https://github.com/netbirdio/netbird",
    LatestRelease: "https://github.com/netbirdio/netbird/releases/latest",
} as const;

export const StatusIconStyleClass = "system-status-icon" as const;
export const IconSubdir = "icons" as const;

export const SettingsSignalPollChanged = "changed::poll-interval" as const;
export const SwitchSignalToggled = "toggled" as const;
export const MenuSignalActivate = "activate" as const;

// URL regex shared by `netbird up` SSO login detection.
export const UrlRegex = /https?:\/\/[^\s]+/;

// Phrases in `netbird up` output that indicate an SSO browser login is needed.
// Matched case-insensitively against combined stdout+stderr. Keep lower-case.
export const LoginRequiredPhrases = [
    "please do the sso login",
    "open the following url",
    "use the following url",
    "browser to continue",
    "needs login",
    "authentication required",
] as const;
