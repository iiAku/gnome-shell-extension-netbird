import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { SettingsKeys } from "./lib/settings.js";

export default class NetbirdTrayPreferences extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: "NetBird",
            iconName: "network-workgroup-symbolic",
        });

        const connGroup = new Adw.PreferencesGroup({
            title: "Connection",
            description: "Configure how the extension talks to NetBird",
        });

        const urlRow = new Adw.EntryRow({ title: "NetBird URL" });
        urlRow.set_show_apply_button(true);
        settings.bind(SettingsKeys.NetbirdUrl, urlRow, "text", Gio.SettingsBindFlags.DEFAULT);
        connGroup.add(urlRow);

        const daemonRow = new Adw.EntryRow({ title: "Daemon address" });
        daemonRow.set_show_apply_button(true);
        settings.bind(SettingsKeys.DaemonAddr, daemonRow, "text", Gio.SettingsBindFlags.DEFAULT);
        connGroup.add(daemonRow);

        page.add(connGroup);

        const behaviorGroup = new Adw.PreferencesGroup({ title: "Behavior" });

        const pollAdjustment = new Gtk.Adjustment({
            lower: 3,
            upper: 300,
            stepIncrement: 1,
            pageIncrement: 10,
            value: settings.get_uint(SettingsKeys.PollInterval),
        });

        const pollRow = new Adw.SpinRow({
            title: "Poll interval",
            subtitle: "Seconds between status refreshes",
            adjustment: pollAdjustment,
        });
        settings.bind(
            SettingsKeys.PollInterval,
            pollAdjustment,
            "value",
            Gio.SettingsBindFlags.DEFAULT,
        );
        behaviorGroup.add(pollRow);

        const startupRow = new Adw.SwitchRow({
            title: "Connect on startup",
            subtitle: "Run `netbird up` automatically when the extension loads",
        });
        settings.bind(
            SettingsKeys.ConnectOnStartup,
            startupRow,
            "active",
            Gio.SettingsBindFlags.DEFAULT,
        );
        behaviorGroup.add(startupRow);

        const notificationsRow = new Adw.SwitchRow({
            title: "Show notifications",
            subtitle: "Desktop notifications for errors and SSO login prompts",
        });
        settings.bind(
            SettingsKeys.ShowNotifications,
            notificationsRow,
            "active",
            Gio.SettingsBindFlags.DEFAULT,
        );
        behaviorGroup.add(notificationsRow);

        page.add(behaviorGroup);

        window.add(page);
        return Promise.resolve();
    }
}
