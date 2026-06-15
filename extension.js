/*
    Unpanel - Optimized
    GNOME Shell 48 - 50 extension
    No copyright - FREE FOR ALL
*/

import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
const PANEL_FADE_DURATION = 333;
const DEBOUNCE_DELAY = 150;
const WINDOW_CHECK_THROTTLE = 100;
export default class PanelFreeExtension {
    constructor() {
        this._debounceTimer = null;
        this._throttleTimer = null;
        this._trackedWindows = new Set();
        this._panelHeight = 0;
        this._lastPanelState = null; // Cache to avoid redundant updates
    }
    _hasMaximizedWindow() {
        try {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            if (!activeWorkspace) return false;
            
            const windowsList = activeWorkspace.list_windows();
            return windowsList.some(window => window.maximized_vertically);
        } catch (e) {
            console.error('Unpanel: Error checking maximized window:', e);
            return false;
        }
    }
    _hasMinimizedWindow() {
        try {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            if (!activeWorkspace) return false;
            
            const windowsList = activeWorkspace.list_windows();
            return windowsList.some(window => window.minimized);
        } catch (e) {
            console.error('Unpanel: Error checking minimized window:', e);
            return false;
        }
    }
    _isHotCornerEnabled() {
        try {
            const settings = new Gio.Settings({schema_id: 'org.gnome.shell'});
            return settings.get_boolean('enable-hot-corners');
        } catch (e) {
            return false;
        }
    }
    _hasVisibleWindow() {
        try {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            if (!activeWorkspace) return false;
            
            const windowsList = activeWorkspace.list_windows();
            return windowsList.some(window => !window.is_hidden());
        } catch (e) {
            console.error('Unpanel: Error checking visible window:', e);
            return false;
        }
    }
    _showPanel() {
        if (this._lastPanelState === 'shown') return;
        this._lastPanelState = 'shown';
        Main.panel.height = this._panelHeight;
        for (let box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox]) {
            box.show();
            box.ease({
                opacity: 255,
                duration: PANEL_FADE_DURATION,
            });
        }
    }
    _hidePanel() {
        if (this._lastPanelState === 'hidden') return;
        this._lastPanelState = 'hidden';
        Main.panel.height = 1;
        for (let box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox]) {
            box.ease({
                opacity: 0,
                duration: PANEL_FADE_DURATION,
                onComplete: () => box.hide()
            });
        }
    }
    _trackMaximizedWindow(window) {
        if (!window || this._trackedWindows.has(window)) return;
        this._trackedWindows.add(window);
        window.connectObject(
            'notify::maximized-vertically', this._triggerPanel.bind(this),
            'notify::minimized', this._triggerPanel.bind(this),
            'unmanaging', () => {
                this._trackedWindows.delete(window);
                this._triggerPanel();
            },
            GObject.ConnectFlags.AFTER,
            this
        );
        this._triggerPanel();
    }
    _debouncedTriggerPanel() {
        if (this._debounceTimer) {
            GLib.source_remove(this._debounceTimer);
        }
        this._debounceTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_DELAY, () => {
            this._debounceTimer = null;
            this._triggerPanel();
            return GLib.SOURCE_REMOVE;
        });
    }
    _triggerPanel() {
        if (this._hasMaximizedWindow() && !this._hasMinimizedWindow()) {
            this._hidePanel();
        } else {
            this._showPanel();
        }
    }
    _onWorkspaceChanged() {
        if (!Main.overview.visible) {
            this._debouncedTriggerPanel();
        }
    }
    _onShowDesktopChanged() {
        if (this._hasVisibleWindow()) {
            this._showPanel();
        } else {
            this._debouncedTriggerPanel();
        }
    }
    enable() {
        try {
            this._panelHeight = Main.panel.height;
            this._lastPanelState = 'shown';
            global.display.connectObject(
                'window-created', (display, window) => this._trackMaximizedWindow(window),
                this
            );
            global.workspace_manager.connectObject(
                'active-workspace-changed', this._onWorkspaceChanged.bind(this),
                'showing-desktop-changed', this._onShowDesktopChanged.bind(this),
                this
            );
            Main.overview.connectObject(
                'showing', this._showPanel.bind(this),
                'hiding', () => {
                    this._triggerPanel();
                    if (this._isHotCornerEnabled()) {
                        Main.overview.toggle();
                    }
                },
                this
            );
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            if (activeWorkspace) {
                activeWorkspace.list_windows().forEach(
                    window => this._trackMaximizedWindow(window)
                );
            }
        } catch (e) {
            console.error('Unpanel: Error enabling extension:', e);
        }
    }
    disable() {
        try {
            if (this._debounceTimer) {
                GLib.source_remove(this._debounceTimer);
                this._debounceTimer = null;
            }
            if (this._throttleTimer) {
                GLib.source_remove(this._throttleTimer);
                this._throttleTimer = null;
            }
            global.display.disconnectObject(this);
            global.workspace_manager.disconnectObject(this);
            Main.overview.disconnectObject(this);
            this._trackedWindows.clear();
            this._showPanel();
            this._panelHeight = 0;
            this._lastPanelState = null;
        } catch (e) {
            console.error('Unpanel: Error disabling extension:', e);
        }
    }
}
