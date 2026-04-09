import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { NetbirdIndicator, type NetbirdIndicatorInstance } from "./lib/indicator.js";
import { PanelMenuAlignment, PanelPosition } from "./lib/constants.js";

export default class NetbirdTrayExtension extends Extension {
    private _indicator: NetbirdIndicatorInstance | null = null;

    enable(): void {
        this._indicator = new NetbirdIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, PanelMenuAlignment, PanelPosition);
    }

    disable(): void {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
