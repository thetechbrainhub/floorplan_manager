/**
 * NGIS Floorplan Editor - SVG Handler
 *
 * Copyright (c) 2025 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 */

function checkSVGJS() {
    if (typeof SVG === 'undefined') { console.error('SVG.js not loaded!'); return false; }
    return true;
}

class SVGHandler {
    constructor() {
        this.svg            = null;
        this.devices        = new Map();
        this.originalSVG    = null;
        this.scale          = 1;
        this.panX           = 0;
        this.panY           = 0;
        this.originalWidth  = 1200;
        this.originalHeight = 800;
        this.originalX      = 0;
        this.originalY      = 0;
    }

    // ─── Load / Parse ────────────────────────────────────────────────────────

    loadSVG(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = (e) => {
                try { this.originalSVG = e.target.result; this.parseSVG(e.target.result); resolve(this.devices); }
                catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }

    parseSVG(svgContent) {
        if (!checkSVGJS()) throw new Error('SVG.js not loaded. Please reload the page.');

        const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
        if (!doc.querySelector('svg')) throw new Error('Invalid SVG file');

        const canvas = document.getElementById('svg-canvas');
        canvas.innerHTML = '';

        this.svg = SVG().addTo('#svg-canvas').size('100%', '100%');
        this.svg.svg(svgContent);

        const bbox = this.svg.bbox();
        this.originalWidth  = bbox.width  || 1200;
        this.originalHeight = bbox.height || 800;
        this.originalX      = bbox.x      || 0;
        this.originalY      = bbox.y      || 0;

        this.svg.viewbox(this.originalX, this.originalY, this.originalWidth, this.originalHeight);
        this.setupPanning();
        this.extractDevices();
    }

    // ─── Panning / Zoom ──────────────────────────────────────────────────────

    setupPanning() {
        let isPanning = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;
        const canvas  = document.getElementById('svg-canvas');

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                e.preventDefault();
                isPanning = true;
                startX = e.clientX; startY = e.clientY;
                startPanX = this.panX; startPanY = this.panY;
                canvas.style.cursor = 'grabbing';
            }
        });
        canvas.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            const dx = (e.clientX - startX) * (this.originalWidth  / this.scale / canvas.clientWidth);
            const dy = (e.clientY - startY) * (this.originalHeight / this.scale / canvas.clientHeight);
            this.panX = startPanX - dx;
            this.panY = startPanY - dy;
            this.applyTransform();
        });
        canvas.addEventListener('mouseup',    () => { isPanning = false; canvas.style.cursor = ''; });
        canvas.addEventListener('mouseleave', () => { isPanning = false; canvas.style.cursor = ''; });
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.deltaY < 0 ? this.zoomIn() : this.zoomOut();
            window.dispatchEvent(new CustomEvent('zoomChanged'));
        });
    }

    zoomIn()  { this.scale = Math.min(this.scale * 1.2, 5);  this.applyTransform(); }
    zoomOut() { this.scale = Math.max(this.scale / 1.2, 0.2); this.applyTransform(); }

    resetView() {
        this.scale = 1; this.panX = 0; this.panY = 0;
        if (this.svg && this.originalWidth)
            this.svg.viewbox(this.originalX, this.originalY, this.originalWidth, this.originalHeight);
    }

    applyTransform() {
        if (!this.svg || !this.originalWidth) return;
        const nw = this.originalWidth  / this.scale;
        const nh = this.originalHeight / this.scale;
        const cx = this.originalX + this.originalWidth  / 2;
        const cy = this.originalY + this.originalHeight / 2;
        this.svg.viewbox(cx - nw / 2 + this.panX, cy - nh / 2 + this.panY, nw, nh);
    }

    // ─── Extract existing devices from loaded SVG ─────────────────────────────

    extractDevices() {
        this.devices.clear();
        this.svg.find('g[id^="device_"]').forEach(group => {
            const deviceId = this._extractDeviceId(group.attr('id'));
            if (!deviceId) return;

            let name = `Device ${deviceId}`;
            const title = group.findOne('title');
            if (title?.node?.textContent?.trim()) name = title.node.textContent.trim();

            const device = {
                id: deviceId, groupId: `device_${deviceId}`,
                element: group, name, scale: 1, x: 0, y: 0,
                indicators: this._extractIndicators(group, deviceId)
            };

            if (device.indicators.length > 0)
                device.scale = device.indicators[0].element.bbox().width / 30;

            const t = group.transform();
            device.x = t.translateX || 0;
            device.y = t.translateY || 0;

            this.devices.set(deviceId, device);
            this._makeDeviceDraggable(device);
        });
    }

    _extractDeviceId(groupId) {
        const m = groupId.match(/(?:device|dev)_(\d+)/);
        return m ? m[1] : null;
    }

    /** Extracts indicators in the order they appear visually (sorted by Y) */
    _extractIndicators(group, deviceId) {
        const found = [];
        for (let i = 1; i <= 8; i++) {
            const el = group.find(`#dev_${deviceId}_p${i}`)[0];
            if (!el) continue;
            const qa = el.attr('data-query');
            found.push({
                id: `dev_${deviceId}_p${i}`, index: i, element: el,
                color: el.attr('fill') || '#333333',
                query: (qa && qa !== '' && qa !== 'null') ? parseInt(qa) : null
            });
        }
        // Sort by actual Y position so visual order is respected after reload
        found.sort((a, b) => a.element.y() - b.element.y());
        return found;
    }

    // ─── Dragging & Resize ───────────────────────────────────────────────────

    _makeDeviceDraggable(device) {
        device.element.find('.resize-handle').forEach(h => h.remove());
        device.element.draggable();

        device.element.on('dragmove', () => {
            const t = device.element.transform();
            device.x = t.translateX; device.y = t.translateY;
        });
        device.element.on('dragend', () => {
            const t = device.element.transform();
            device.x = t.translateX; device.y = t.translateY;
            window.dispatchEvent(new CustomEvent('deviceMoved',
                { detail: { deviceId: device.id, x: device.x, y: device.y } }));
        });
        device.element.on('click', (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('deviceClicked',
                { detail: { deviceId: device.id } }));
        });

        this._addResizeHandle(device);
    }

    _addResizeHandle(device) {
        if (device.indicators.length === 0) return;
        const HS = 10; // handle size (always fixed px)

        const last = device.indicators[device.indicators.length - 1];
        const handle = device.element.rect(HS, HS)
            .fill('#10D1CD').stroke('#ffffff').stroke({ width: 2 }).radius(2)
            .move(last.element.x() + last.element.width() - HS,
                  last.element.y() + last.element.height() - HS)
            .css({ cursor: 'nwse-resize' }).addClass('resize-handle');
        handle.front();

        let isResizing = false, startScale = 1, startY = 0, snapX = 0, snapY = 0;

        handle.on('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            startScale = device.scale || 1;
            startY     = e.clientY;
            const bbox = device.element.bbox();
            snapX = bbox.x; snapY = bbox.y;
            device.x = snapX; device.y = snapY;
            device.element.draggable(false);
        });

        const onMove = (e) => {
            if (!isResizing) return;
            const ns = Math.max(0.5, Math.min(20, startScale + (e.clientY - startY) / 100));
            this._applyScale(device, ns, handle);
            device.element.move(snapX, snapY);
        };
        const onUp = () => {
            if (!isResizing) return;
            isResizing = false;
            device.element.move(snapX, snapY);
            device.x = snapX; device.y = snapY;
            device.element.draggable(true);
            window.dispatchEvent(new CustomEvent('deviceResized',
                { detail: { deviceId: device.id, scale: device.scale } }));
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    }

    /** Scale all indicators (in their current visual order) and reposition handle. */
    _applyScale(device, newScale, handle) {
        const HS = 10;
        device.scale = newScale;

        device.indicators.forEach((ind, arrayIdx) => {
            ind.element.size(30 * newScale, 30 * newScale)
                       .move(0, arrayIdx * 35 * newScale)
                       .radius(10 * newScale);
        });

        const h = handle || device.element.findOne('.resize-handle');
        if (h) {
            const n = device.indicators.length;
            h.move(30 * newScale - HS, n * 35 * newScale - 5 - HS);
            h.front();
        }
    }

    _updateHandlePosition(device) {
        const HS = 10;
        const h  = device.element.findOne('.resize-handle');
        if (!h || device.indicators.length === 0) return;
        const last = device.indicators[device.indicators.length - 1];
        h.move(last.element.x() + last.element.width()  - HS,
               last.element.y() + last.element.height() - HS);
        h.front();
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    createDevice(deviceId, name, x = 100, y = 100, numIndicators = 5) {
        if (this.devices.has(deviceId)) throw new Error('Device ID already exists');
        numIndicators = Math.max(1, Math.min(8, numIndicators));

        const group = this.svg.group().attr('id', `device_${deviceId}`);
        group.element('title').words(name);

        const indicators = [];
        for (let i = 1; i <= numIndicators; i++) {
            const el = group.rect(30, 30)
                .fill('#333333').stroke('#555555').stroke({ width: 2 }).radius(10)
                .move(0, (i - 1) * 35)
                .attr('id', `dev_${deviceId}_p${i}`)
                .attr('data-query', '');
            indicators.push({ id: `dev_${deviceId}_p${i}`, index: i, element: el,
                              color: '#333333', query: null });
        }

        group.transform({ translateX: x, translateY: y });
        const device = { id: deviceId, groupId: `device_${deviceId}`,
                         element: group, name, scale: 1, x, y, indicators };
        this.devices.set(deviceId, device);
        this._makeDeviceDraggable(device);
        return device;
    }

    deleteDevice(deviceId) {
        const d = this.devices.get(deviceId);
        if (!d) return false;
        d.element.remove();
        this.devices.delete(deviceId);
        return true;
    }

    // ─── Update helpers ───────────────────────────────────────────────────────

    updateDevicePosition(deviceId, x, y) {
        const d = this.devices.get(deviceId);
        if (!d) return;
        d.x = x; d.y = y;
        d.element.transform({ translateX: x, translateY: y });
    }

    updateDeviceScale(deviceId, scale) {
        const d = this.devices.get(deviceId);
        if (!d) return;
        const bbox = d.element.bbox();
        const ax = bbox.x, ay = bbox.y;
        this._applyScale(d, Math.max(0.5, Math.min(20, scale)));
        d.x = ax; d.y = ay;
        d.element.move(ax, ay);
    }

    updateDeviceName(deviceId, newName) {
        const d = this.devices.get(deviceId);
        if (!d) return;
        d.name = newName;
        const t = d.element.findOne('title');
        if (t) t.words(newName); else d.element.element('title').words(newName);
    }

    /** BUG FIX: uses ind.index (real P-number) not arrayIdx+1 */
    updateDeviceId(oldId, newId) {
        const d = this.devices.get(oldId);
        if (!d) return;
        d.id = newId; d.groupId = `device_${newId}`;
        d.element.attr('id', `device_${newId}`);
        d.indicators.forEach(ind => {
            const nid = `dev_${newId}_p${ind.index}`;   // ← FIXED
            ind.element.attr('id', nid);
            ind.id = nid;
        });
        this.devices.delete(oldId);
        this.devices.set(newId, d);
    }

    updateIndicatorColor(deviceId, indicatorIndex, color) {
        const d   = this.devices.get(deviceId);
        const ind = d?.indicators.find(i => i.index === indicatorIndex);
        if (!ind) return;
        ind.element.fill(color); ind.color = color;
    }

    updateIndicatorQuery(deviceId, indicatorIndex, queryNum) {
        const d   = this.devices.get(deviceId);
        const ind = d?.indicators.find(i => i.index === indicatorIndex);
        if (!ind) return;
        ind.query = queryNum;
        ind.element.attr('data-query', queryNum);
    }

    /**
     * Replace indicator set (from checkbox selection).
     * Preserves color/query for re-selected P-indices.
     */
    updateDeviceIndicators(deviceId, selectedIndices) {
        const d = this.devices.get(deviceId);
        if (!d) return;

        const bbox = d.element.bbox();
        const ax = bbox.x, ay = bbox.y;
        const sc = d.scale || 1;

        // Snapshot existing data
        const snap = {};
        d.indicators.forEach(ind => { snap[ind.index] = { color: ind.color, query: ind.query }; ind.element.remove(); });
        d.indicators = [];
        d.element.find('.resize-handle').forEach(h => h.remove());

        selectedIndices.forEach((pIndex, arrayIdx) => {
            const prev = snap[pIndex] || {};
            const id   = `dev_${deviceId}_p${pIndex}`;
            const el   = d.element.rect(30 * sc, 30 * sc)
                .fill(prev.color || '#333333')
                .stroke('#555555').stroke({ width: 2 })
                .radius(10 * sc).move(0, arrayIdx * 35 * sc)
                .attr('id', id)
                .attr('data-query', prev.query != null ? prev.query : '');
            d.indicators.push({ id, index: pIndex, element: el,
                                 color: prev.color || '#333333', query: prev.query ?? null });
        });

        d.x = ax; d.y = ay; d.element.move(ax, ay);
        this._addResizeHandle(d);
    }

    /**
     * Reorder indicators visually without changing P-numbers or data.
     * @param {string}   deviceId
     * @param {number[]} orderedIndices  e.g. [3, 1, 2] means P3 on top, then P1, then P2
     */
    reorderDeviceIndicators(deviceId, orderedIndices) {
        const d = this.devices.get(deviceId);
        if (!d) return;

        const bbox = d.element.bbox();
        const ax = bbox.x, ay = bbox.y;
        const sc = d.scale || 1;

        orderedIndices.forEach((pIndex, arrayIdx) => {
            const ind = d.indicators.find(i => i.index === pIndex);
            if (ind) ind.element.y(arrayIdx * 35 * sc);
        });

        // Re-sort internal array to match
        d.indicators = orderedIndices
            .map(p => d.indicators.find(i => i.index === p))
            .filter(Boolean);

        d.x = ax; d.y = ay; d.element.move(ax, ay);
        this._updateHandlePosition(d);
    }

    /** Add/remove indicators from the tail of the current ordered list. */
    updateDeviceIndicatorCount(deviceId, newCount) {
        const d = this.devices.get(deviceId);
        if (!d) return;
        newCount = Math.max(1, Math.min(8, newCount));
        if (newCount === d.indicators.length) return;

        const sc = d.scale || 1;

        if (newCount > d.indicators.length) {
            const used = new Set(d.indicators.map(i => i.index));
            for (let p = 1; p <= 8 && d.indicators.length < newCount; p++) {
                if (used.has(p)) continue;
                const arrayIdx = d.indicators.length;
                const id = `dev_${deviceId}_p${p}`;
                const el = d.element.rect(30 * sc, 30 * sc)
                    .fill('#333333').stroke('#555555').stroke({ width: 2 })
                    .radius(10 * sc).move(0, arrayIdx * 35 * sc)
                    .attr('id', id).attr('data-query', '');
                d.indicators.push({ id, index: p, element: el, color: '#333333', query: null });
                used.add(p);
            }
        } else {
            for (let i = d.indicators.length; i > newCount; i--)
                d.indicators[i - 1].element.remove();
            d.indicators = d.indicators.slice(0, newCount);
        }

        this._updateHandlePosition(d);
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    exportSVG() {
        if (!this.svg) return null;
        const clone = this.svg.node.cloneNode(true);
        clone.querySelectorAll('.resize-handle').forEach(h => h.remove());

        const bbox = this.svg.bbox();
        const p = 20;
        clone.setAttribute('viewBox', `${bbox.x - p} ${bbox.y - p} ${bbox.width + p*2} ${bbox.height + p*2}`);
        clone.setAttribute('width',  bbox.width  + p*2);
        clone.setAttribute('height', bbox.height + p*2);

        return new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    }

    // ─── Accessors ────────────────────────────────────────────────────────────

    getDevices() { return Array.from(this.devices.values()); }
    getDevice(id) { return this.devices.get(id); }
}
