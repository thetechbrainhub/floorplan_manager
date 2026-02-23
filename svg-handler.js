/**
 * NGIS Floorplan Editor - SVG Handler
 *
 * Copyright (c) 2025 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 */

/** Default OFF-state color (same for all indicators) */
const INDICATOR_PRESET_OFF_COLOR = '#333333';

/** Default ON-state colors per indicator index (P1–P8) */
const INDICATOR_PRESET_COLORS = {
    1: '#00ff00',
    2: '#ff8800',
    3: '#ff0000',
    4: '#0088ff',
    5: '#ffffff',
    6: '#ff00ff',
    7: '#00ffff',
    8: '#ffff00'
};

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
        const rootSvg = doc.querySelector('svg');
        if (!rootSvg) throw new Error('Invalid SVG file');

        // Read dimensions from the root SVG element BEFORE embedding.
        // Using bbox() after embedding misreads nested SVG files (e.g. files that
        // were saved multiple times), because bbox() measures the innermost layer
        // rather than the intended canvas. Reading from the root SVG attributes is
        // always correct regardless of nesting depth.
        const vb = rootSvg.getAttribute('viewBox');
        if (vb) {
            const parts = vb.trim().split(/[\s,]+/).map(Number);
            this.originalX      = parts[0] || 0;
            this.originalY      = parts[1] || 0;
            this.originalWidth  = parts[2] || 1200;
            this.originalHeight = parts[3] || 800;
        } else {
            this.originalWidth  = parseFloat(rootSvg.getAttribute('width'))  || 1200;
            this.originalHeight = parseFloat(rootSvg.getAttribute('height')) || 800;
            this.originalX = 0;
            this.originalY = 0;
        }

        const canvas = document.getElementById('svg-canvas');
        canvas.innerHTML = '';

        this.svg = SVG().addTo('#svg-canvas').size('100%', '100%');
        this.svg.svg(svgContent);

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
            // Scale deltaY to pixels regardless of deltaMode so the zoom amount
            // is proportional to actual scroll distance (smooth on trackpads,
            // one grid square ≈ one mouse-wheel notch at typical settings).
            let delta = e.deltaY;
            if (e.deltaMode === 1) delta *= 20;   // lines → pixels
            if (e.deltaMode === 2) delta *= 800;  // pages → pixels
            const factor = Math.exp(-delta * 0.003);
            this.scale = Math.max(0.2, Math.min(5, this.scale * factor));
            this.applyTransform();
            this._updateAllHandles();
            window.dispatchEvent(new CustomEvent('zoomChanged'));
        });
    }

    zoomIn()  { this.scale = Math.min(this.scale * 1.05, 5);  this.applyTransform(); this._updateAllHandles(); }
    zoomOut() { this.scale = Math.max(this.scale / 1.05, 0.2); this.applyTransform(); this._updateAllHandles(); }

    resetView() {
        this.scale = 1; this.panX = 0; this.panY = 0;
        if (!this.svg) return;

        const p  = 20;
        const bb = this._getVisibleBBox();

        if (bb && bb.width > 10 && bb.height > 10) {
            // Scale to fit the visible content (preserve original aspect ratio,
            // pick the tighter axis so nothing is clipped).
            this.scale = Math.min(
                this.originalWidth  / (bb.width  + p * 2),
                this.originalHeight / (bb.height + p * 2)
            );
            // Pan so the centre of visible content is centred in the view.
            // applyTransform() centres on (origCX + panX, origCY + panY).
            const origCX = this.originalX + this.originalWidth  / 2;
            const origCY = this.originalY + this.originalHeight / 2;
            this.panX = (bb.x + bb.width  / 2) - origCX;
            this.panY = (bb.y + bb.height / 2) - origCY;
        }

        // All view state is now in scale/panX/panY — applyTransform() is the
        // single source of truth, so panning after Fit no longer jumps back.
        this.applyTransform();
        this._updateAllHandles();
    }

    /**
     * Returns the union bounding box (in the loaded SVG's own coordinate system)
     * of every element that has a visible fill or stroke.
     * Elements with fill="none"/stroke="none" or that are hidden/transparent
     * are skipped — this avoids invisible background geometry (common in draw.io
     * exports) inflating the result.
     *
     * getCTM() on each shape element accumulates all parent <g> transforms and
     * maps local coordinates to the nearest ancestor <svg> viewport space
     * (= the loaded file's coordinate system, matching originalX/Y/Width/Height).
     */
    _getVisibleBBox() {
        const contentSvg = this.svg.node.querySelector('svg') || this.svg.node;
        const shapes = contentSvg.querySelectorAll(
            'rect,circle,ellipse,path,polygon,polyline,line,text,image,use'
        );

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;

        const isTransparent = c =>
            !c || c === 'none' || c === 'rgba(0, 0, 0, 0)' || /rgba\([^)]+,\s*0\)$/.test(c);

        shapes.forEach(el => {
            try {
                if (el.classList.contains('resize-handle')) return;

                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (parseFloat(cs.opacity) <= 0) return;

                const fill   = cs.fill   || '';
                const stroke = cs.stroke || '';
                const fo     = parseFloat(cs.fillOpacity   || 1);
                const so     = parseFloat(cs.strokeOpacity || 1);

                const hasFill   = !isTransparent(fill)   && fo > 0;
                const hasStroke = !isTransparent(stroke) && so > 0;
                if (!hasFill && !hasStroke) return;

                const bb = el.getBBox();
                if (bb.width <= 0 || bb.height <= 0) return;

                const ctm = el.getCTM();
                if (!ctm) return;

                [[bb.x, bb.y], [bb.x + bb.width, bb.y],
                 [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]
                ].forEach(([x, y]) => {
                    const tx = ctm.a * x + ctm.c * y + ctm.e;
                    const ty = ctm.b * x + ctm.d * y + ctm.f;
                    minX = Math.min(minX, tx); minY = Math.min(minY, ty);
                    maxX = Math.max(maxX, tx); maxY = Math.max(maxY, ty);
                });
                found = true;
            } catch (e) { /* skip inaccessible elements */ }
        });

        return found ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
    }

    /** Recalculate handle pixel size for all devices after a zoom change. */
    _updateAllHandles() {
        this.devices.forEach(device => this._updateHandlePosition(device));
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

            const m = group.node.transform.baseVal.consolidate()?.matrix;
            device.x = m ? m.e : 0;
            device.y = m ? m.f : 0;

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
            const qa  = el.attr('data-query');
            const oca = el.attr('data-off-color');
            const bla = el.attr('data-blink');
            found.push({
                id: `dev_${deviceId}_p${i}`, index: i, element: el,
                color:    el.attr('fill') || INDICATOR_PRESET_COLORS[i] || '#333333',
                offColor: (oca && oca !== '' && oca !== 'null') ? oca : INDICATOR_PRESET_OFF_COLOR,
                blink:    bla === 'true',
                query:    (qa  && qa  !== '' && qa  !== 'null') ? parseInt(qa) : null
            });
        }
        // Sort by actual Y position so visual order is respected after reload
        found.sort((a, b) => a.element.y() - b.element.y());
        return found;
    }

    // ─── Dragging & Resize ───────────────────────────────────────────────────

    /**
     * Read the element's actual SVG-space position from the DOM transform matrix.
     * SVG.js v3 `.transform()` returns a raw Matrix {a,b,c,d,e,f} whose `translateX/Y`
     * properties are undefined – use `.e` / `.f` (the true translation components)
     * via the browser's native SVGTransformList instead.
     */
    _syncPos(d) {
        const m = d.element.node.transform.baseVal.consolidate()?.matrix;
        if (m) { d.x = m.e; d.y = m.f; }
    }

    _makeDeviceDraggable(device) {
        device.element.find('.resize-handle').forEach(h => h.remove());
        device.element.draggable();

        // SVG.js draggable v3 calls el.move(x,y) which repositions the GROUP'S CHILDREN
        // (x/y attrs on <rect> nodes), NOT the group's own transform attribute.
        // Visual position = group_translate + child_offset (bbox.x/y in local space).

        device.element.on('dragmove', () => {
            // Keep device.x/y current for the real-time coordinate display
            const m = device.element.node.transform.baseVal.consolidate()?.matrix;
            device.x = (m?.e ?? device.x) + (device.element.x() || 0);
            device.y = (m?.f ?? device.y) + (device.element.y() || 0);
        });

        device.element.on('dragend', () => {
            // True visual position = group translate + current child offset
            const m  = device.element.node.transform.baseVal.consolidate()?.matrix;
            const vx = (m?.e ?? device.x) + (device.element.x() || 0);
            const vy = (m?.f ?? device.y) + (device.element.y() || 0);

            // Consolidate: bake the offset into the group transform, reset children to
            // local origin so that _syncPos (which reads m.e/m.f) is always accurate.
            device.element.transform({ translateX: vx, translateY: vy });
            const sc = device.scale || 1;
            device.indicators.forEach((ind, arrayIdx) => {
                ind.element.move(0, arrayIdx * 35 * sc);
            });
            this._updateHandlePosition(device);

            device.x = vx;
            device.y = vy;
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

    /**
     * Handle size in SVG units.
     * - 28/zoomScale targets a constant ~28px on screen at any zoom level.
     * - Capped at 30*deviceScale so the handle never exceeds the indicator tile.
     * Result: fixed screen size when device is large; shrinks with device when device is small.
     */
    _handleSize(device) {
        const zs = this.scale || 1;
        const sc = device.scale || 1;
        return Math.min(28 / zs, 30 * sc);
    }

    _addResizeHandle(device) {
        if (device.indicators.length === 0) return;
        const HS = this._handleSize(device);

        const last = device.indicators[device.indicators.length - 1];
        const handle = device.element.rect(HS, HS)
            .fill('#10D1CD').stroke('#ffffff').stroke({ width: 2 }).radius(2)
            .move(last.element.x() + last.element.width(),
                  last.element.y() + last.element.height())
            .css({ cursor: 'nwse-resize' }).addClass('resize-handle');
        handle.front();

        let isResizing = false, startScale = 1, startY = 0, snapX = 0, snapY = 0;

        // Declare handlers before mousedown so they can reference each other
        const onMove = (e) => {
            if (!isResizing) return;
            const ns = Math.max(0.5, Math.min(20, startScale + (e.clientY - startY) / 100));
            this._applyScale(device, ns, handle);
            device.element.transform({ translateX: snapX, translateY: snapY });
        };
        const onUp = () => {
            if (!isResizing) return;
            isResizing = false;
            device.element.transform({ translateX: snapX, translateY: snapY });
            device.x = snapX; device.y = snapY;
            device.element.draggable(true);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
            window.dispatchEvent(new CustomEvent('deviceResized',
                { detail: { deviceId: device.id, scale: device.scale } }));
        };

        // Add window listeners only for the duration of an active resize
        handle.on('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            startScale = device.scale || 1;
            startY     = e.clientY;
            this._syncPos(device);          // read actual position from DOM matrix
            snapX = device.x; snapY = device.y;
            device.element.draggable(false);
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup',   onUp);
        });
    }

    /** Scale all indicators (in their current visual order) and reposition handle. */
    _applyScale(device, newScale, handle) {
        device.scale = newScale;
        const HS = this._handleSize(device);

        device.indicators.forEach((ind, arrayIdx) => {
            ind.element.size(30 * newScale, 30 * newScale)
                       .move(0, arrayIdx * 35 * newScale)
                       .radius(10 * newScale);
        });

        const h = handle || device.element.findOne('.resize-handle');
        if (h) {
            const n = device.indicators.length;
            // place handle flush outside the tile's bottom-right corner
            h.size(HS, HS).move(30 * newScale, (35 * n - 5) * newScale).front();
        }
    }

    _updateHandlePosition(device) {
        const HS = this._handleSize(device);
        const h  = device.element.findOne('.resize-handle');
        if (!h || device.indicators.length === 0) return;
        const sc = device.scale || 1;
        const n  = device.indicators.length;
        h.size(HS, HS).move(30 * sc, (35 * n - 5) * sc).front();
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    createDevice(deviceId, name, x = 100, y = 100, numIndicators = 5) {
        if (this.devices.has(deviceId)) throw new Error('Device ID already exists');
        numIndicators = Math.max(1, Math.min(8, numIndicators));

        const group = this.svg.group().attr('id', `device_${deviceId}`);
        group.element('title').words(name);

        const indicators = [];
        for (let i = 1; i <= numIndicators; i++) {
            const presetColor = INDICATOR_PRESET_COLORS[i] || '#555555';
            const el = group.rect(30, 30)
                .fill(presetColor).stroke('#555555').stroke({ width: 2 }).radius(10)
                .move(0, (i - 1) * 35)
                .attr('id', `dev_${deviceId}_p${i}`)
                .attr('data-query', '')
                .attr('data-off-color', INDICATOR_PRESET_OFF_COLOR)
                .attr('data-blink', 'false');
            indicators.push({ id: `dev_${deviceId}_p${i}`, index: i, element: el,
                              color: presetColor, offColor: INDICATOR_PRESET_OFF_COLOR, blink: false, query: null });
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
        this._syncPos(d);                           // read actual position from DOM matrix
        this._applyScale(d, Math.max(0.5, Math.min(20, scale)));
        d.element.transform({ translateX: d.x, translateY: d.y });
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

    updateIndicatorBlink(deviceId, indicatorIndex, blink) {
        const d   = this.devices.get(deviceId);
        const ind = d?.indicators.find(i => i.index === indicatorIndex);
        if (!ind) return;
        ind.blink = blink;
        ind.element.attr('data-blink', String(blink));
    }

    updateIndicatorOffColor(deviceId, indicatorIndex, offColor) {
        const d   = this.devices.get(deviceId);
        const ind = d?.indicators.find(i => i.index === indicatorIndex);
        if (!ind) return;
        ind.offColor = offColor;
        ind.element.attr('data-off-color', offColor);
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

        this._syncPos(d);                           // read actual position from DOM matrix
        const sc = d.scale || 1;

        // Snapshot existing data
        const snap = {};
        d.indicators.forEach(ind => { snap[ind.index] = { color: ind.color, offColor: ind.offColor, blink: ind.blink, query: ind.query }; ind.element.remove(); });
        d.indicators = [];
        d.element.find('.resize-handle').forEach(h => h.remove());

        selectedIndices.forEach((pIndex, arrayIdx) => {
            const prev         = snap[pIndex] || {};
            const defaultColor = INDICATOR_PRESET_COLORS[pIndex] || '#555555';
            const color        = prev.color    || defaultColor;
            const offColor     = prev.offColor || INDICATOR_PRESET_OFF_COLOR;
            const blink        = prev.blink    || false;
            const id           = `dev_${deviceId}_p${pIndex}`;
            const el           = d.element.rect(30 * sc, 30 * sc)
                .fill(color)
                .stroke('#555555').stroke({ width: 2 })
                .radius(10 * sc).move(0, arrayIdx * 35 * sc)
                .attr('id', id)
                .attr('data-query',     prev.query != null ? prev.query : '')
                .attr('data-off-color', offColor)
                .attr('data-blink',     String(blink));
            d.indicators.push({ id, index: pIndex, element: el,
                                 color, offColor, blink, query: prev.query ?? null });
        });

        d.element.transform({ translateX: d.x, translateY: d.y });
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

        this._syncPos(d);                           // read actual position from DOM matrix
        const sc = d.scale || 1;

        orderedIndices.forEach((pIndex, arrayIdx) => {
            const ind = d.indicators.find(i => i.index === pIndex);
            if (ind) ind.element.y(arrayIdx * 35 * sc);
        });

        // Re-sort internal array to match
        d.indicators = orderedIndices
            .map(p => d.indicators.find(i => i.index === p))
            .filter(Boolean);

        d.element.transform({ translateX: d.x, translateY: d.y });
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

        // Export the INNER svg element (the loaded file content), not the SVG.js
        // container — otherwise each save wraps the content in another <svg> layer.
        const inner = this.svg.node.querySelector('svg') || this.svg.node;
        const clone = inner.cloneNode(true);
        clone.querySelectorAll('.resize-handle').forEach(h => h.remove());

        // Responsive sizing: width="100%" lets the container determine the size;
        // the viewBox defines the aspect ratio and coordinate system.
        const p = 20;
        clone.setAttribute('viewBox',
            `${this.originalX - p} ${this.originalY - p} ${this.originalWidth + p*2} ${this.originalHeight + p*2}`);
        clone.setAttribute('width',  '100%');
        clone.removeAttribute('height');

        return new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    }

    // ─── Accessors ────────────────────────────────────────────────────────────

    getDevices() { return Array.from(this.devices.values()); }
    getDevice(id) { return this.devices.get(id); }
}
