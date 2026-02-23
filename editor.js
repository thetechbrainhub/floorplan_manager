/**
 * NGIS Floorplan Editor - Editor Logic
 *
 * Copyright (c) 2025 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 */

class Editor {
    constructor() {
        this.svgHandler      = new SVGHandler();
        this.selectedDevice  = null;
        this.undoStack       = [];
        this.redoStack       = [];
        this.maxUndoSteps    = 50;
        this.gridVisible     = true;
    }

    // ─── File ────────────────────────────────────────────────────────────────

    async loadFile(file) {
        try {
            await this.svgHandler.loadSVG(file);
            this.clearHistory();
            this.selectedDevice = null;
            return true;
        } catch (err) {
            console.error('Load error:', err);
            throw err;
        }
    }

    // ─── Selection ───────────────────────────────────────────────────────────

    getDevices()    { return this.svgHandler.getDevices(); }

    selectDevice(deviceId) {
        if (this.selectedDevice) {
            const prev = this.svgHandler.getDevice(this.selectedDevice);
            if (prev) prev.element.removeClass('selected');
        }
        this.selectedDevice = deviceId;
        const d = this.svgHandler.getDevice(deviceId);
        if (d) d.element.addClass('selected');
        return d;
    }

    deselectDevice() {
        if (this.selectedDevice) {
            const d = this.svgHandler.getDevice(this.selectedDevice);
            if (d) d.element.removeClass('selected');
            this.selectedDevice = null;
        }
    }

    getSelectedDevice() {
        if (!this.selectedDevice) return null;
        return this.svgHandler.getDevice(this.selectedDevice);
    }

    // ─── Device actions ──────────────────────────────────────────────────────

    createDevice(deviceId, name, x, y, numIndicators = 5) {
        this.saveState();
        try {
            const d = this.svgHandler.createDevice(deviceId, name, x, y, numIndicators);
            this.selectDevice(deviceId);
            return d;
        } catch (err) {
            this.undoStack.pop();
            throw err;
        }
    }

    deleteDevice(deviceId) {
        this.saveState();
        const ok = this.svgHandler.deleteDevice(deviceId);
        if (ok && this.selectedDevice === deviceId) this.selectedDevice = null;
        return ok;
    }

    updateDevicePosition(deviceId, x, y)       { this.saveState(); this.svgHandler.updateDevicePosition(deviceId, x, y); }
    updateDeviceScale(deviceId, scale)           { this.saveState(); this.svgHandler.updateDeviceScale(deviceId, scale); }
    updateDeviceName(deviceId, newName)          { this.saveState(); this.svgHandler.updateDeviceName(deviceId, newName); }
    updateIndicatorColor(deviceId, idx, color)      { this.saveState(); this.svgHandler.updateIndicatorColor(deviceId, idx, color); }
    updateIndicatorOffColor(deviceId, idx, offColor){ this.saveState(); this.svgHandler.updateIndicatorOffColor(deviceId, idx, offColor); }
    updateIndicatorBlink(deviceId, idx, blink)      { this.saveState(); this.svgHandler.updateIndicatorBlink(deviceId, idx, blink); }
    updateIndicatorQuery(deviceId, idx, queryNum)   { this.saveState(); this.svgHandler.updateIndicatorQuery(deviceId, idx, queryNum); }
    updateDeviceIndicatorCount(deviceId, count)  { this.saveState(); this.svgHandler.updateDeviceIndicatorCount(deviceId, count); }
    updateDeviceIndicators(deviceId, indices)    { this.saveState(); this.svgHandler.updateDeviceIndicators(deviceId, indices); }
    reorderDeviceIndicators(deviceId, order)     { this.saveState(); this.svgHandler.reorderDeviceIndicators(deviceId, order); }

    updateDeviceId(oldId, newId) {
        this.saveState();
        this.svgHandler.updateDeviceId(oldId, newId);
        if (this.selectedDevice === oldId) this.selectedDevice = newId;
    }

    // ─── View ────────────────────────────────────────────────────────────────

    zoomIn()    { this.svgHandler.zoomIn(); }
    zoomOut()   { this.svgHandler.zoomOut(); }
    resetView() { this.svgHandler.resetView(); }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        document.getElementById('svg-canvas').classList.toggle('grid-hidden', !this.gridVisible);
    }

    // ─── Undo / Redo ─────────────────────────────────────────────────────────

    saveState() {
        this.undoStack.push(this.captureState());
        if (this.undoStack.length > this.maxUndoSteps) this.undoStack.shift();
        this.redoStack = [];
    }

    /** BUG FIX: captures scale and visual indicator order */
    captureState() {
        return {
            selectedDevice: this.selectedDevice,
            devices: this.svgHandler.getDevices().map(d => ({
                id:    d.id,
                name:  d.name,
                x:     d.x,
                y:     d.y,
                scale: d.scale || 1,                        // ← FIXED: was missing
                // indicators in current visual order (array order = visual order)
                indicators: d.indicators.map(i => ({
                    index:    i.index,
                    color:    i.color,
                    offColor: i.offColor || '#333333',
                    blink:    i.blink   || false,
                    query:    i.query
                }))
            }))
        };
    }

    restoreState(state) {
        this.svgHandler.getDevices().forEach(d => this.svgHandler.deleteDevice(d.id));

        state.devices.forEach(dd => {
            this.svgHandler.createDevice(dd.id, dd.name, dd.x, dd.y, 0);

            // Rebuild indicators in saved order
            const orderedIndices = dd.indicators.map(i => i.index);
            this.svgHandler.updateDeviceIndicators(dd.id, orderedIndices);

            // Restore colors, blink and queries
            dd.indicators.forEach(i => {
                this.svgHandler.updateIndicatorColor(dd.id, i.index, i.color);
                if (i.offColor) this.svgHandler.updateIndicatorOffColor(dd.id, i.index, i.offColor);
                if (i.blink)    this.svgHandler.updateIndicatorBlink(dd.id, i.index, i.blink);
                if (i.query != null) this.svgHandler.updateIndicatorQuery(dd.id, i.index, i.query);
            });

            // Restore scale
            if (dd.scale && dd.scale !== 1)
                this.svgHandler.updateDeviceScale(dd.id, dd.scale);  // ← FIXED: scale restored
        });

        if (state.selectedDevice) this.selectDevice(state.selectedDevice);
        else                       this.deselectDevice();
    }

    undo() {
        if (!this.undoStack.length) return false;
        this.redoStack.push(this.captureState());
        this.restoreState(this.undoStack.pop());
        return true;
    }

    redo() {
        if (!this.redoStack.length) return false;
        this.undoStack.push(this.captureState());
        this.restoreState(this.redoStack.pop());
        return true;
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    clearHistory() { this.undoStack = []; this.redoStack = []; }

    // ─── Export ──────────────────────────────────────────────────────────────

    exportSVG() { return this.svgHandler.exportSVG(); }
}
