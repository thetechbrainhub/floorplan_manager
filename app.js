/**
 * NGIS Floorplan Editor - App Controller
 *
 * Copyright (c) 2025 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 */

class App {
    constructor() {
        this.editor = new Editor();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
        this.updateStatus('Ready – load an SVG file to start');
    }

    // ─── Event wiring ────────────────────────────────────────────────────────

    setupEventListeners() {
        document.getElementById('file-upload').addEventListener('change',      e => this.handleFileUpload(e));
        document.getElementById('file-upload-main').addEventListener('change', e => this.handleFileUpload(e));
        document.getElementById('btn-download').addEventListener('click',      () => this.handleDownload());
        document.getElementById('btn-save-json').addEventListener('click',     () => this.handleSaveJSON());
        document.getElementById('btn-zoom-in').addEventListener('click',       () => this.handleZoomIn());
        document.getElementById('btn-zoom-out').addEventListener('click',      () => this.handleZoomOut());
        document.getElementById('btn-reset-view').addEventListener('click',    () => this.handleResetView());
        document.getElementById('btn-toggle-grid').addEventListener('click',   () => this.handleToggleGrid());
        document.getElementById('btn-add-device').addEventListener('click',    () => this.handleAddDevice());
        document.getElementById('btn-delete-device').addEventListener('click', () => this.handleDeleteDevice());
        document.getElementById('btn-create-device').addEventListener('click', () => this.handleCreateDevice());
        document.getElementById('btn-undo').addEventListener('click',          () => this.handleUndo());
        document.getElementById('btn-redo').addEventListener('click',          () => this.handleRedo());
        document.getElementById('btn-reset').addEventListener('click',         () => this.handleReset());

        document.addEventListener('keydown', e => this.handleKeyboard(e));
        window.addEventListener('deviceMoved',   e => this.handleDeviceMoved(e));
        window.addEventListener('deviceClicked', e => this.handleDeviceClicked(e));
        window.addEventListener('deviceResized', e => this.handleDeviceResized(e));
        window.addEventListener('zoomChanged',   () => this.updateZoomLevel());

        document.getElementById('svg-canvas').addEventListener('mousemove', e => this.handleMouseMove(e));
    }

    // ─── File ────────────────────────────────────────────────────────────────

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            this.updateStatus('Loading SVG…');
            await this.editor.loadFile(file);
            this.updateStatus(`Loaded: ${file.name}`);
            this.updateDeviceList();
            this.updateUI();
            const ph = document.querySelector('.canvas-placeholder');
            if (ph) ph.style.display = 'none';
        } catch (err) {
            this.updateStatus(`Error: ${err.message}`, 'error');
            alert(`Error loading SVG: ${err.message}`);
        }
    }

    handleDownload() {
        try {
            const blob = this.editor.exportSVG();
            if (!blob) { alert('No SVG to export'); return; }
            this._triggerDownload(blob, `floorplan_${Date.now()}.svg`);
            this.updateStatus('SVG exported');
        } catch (err) { this.updateStatus(`Export error: ${err.message}`, 'error'); }
    }

    // ─── JSON Export ─────────────────────────────────────────────────────────

    handleSaveJSON() {
        try {
            const bucket      = document.getElementById('grafana-bucket').value.trim();
            const measurement = document.getElementById('grafana-measurement').value.trim();

            if (!bucket || !measurement) {
                alert('⚠️ Grafana Settings incomplete!\n\nBucket and Measurement are required fields.');
                return;
            }

            const devices = this.editor.getDevices();
            if (devices.length === 0) { alert('No devices to export.'); return; }

            for (const d of devices) {
                if (!d.indicators?.length) {
                    alert(`⚠️ Device "${d.name}" (ID: ${d.id}) has no indicators.`);
                    return;
                }
            }

            // SVG – strip resize handles
            const svgClone = this.editor.svgHandler.svg.node.cloneNode(true);
            svgClone.querySelectorAll('.resize-handle').forEach(h => h.remove());
            const svgContent = new XMLSerializer().serializeToString(svgClone);

            // svgMappings
            const svgMappings = [];
            devices.forEach(d => {
                d.indicators.forEach(ind => {
                    svgMappings.push({
                        mappedName: `dev_${d.id}_p${ind.index}`,
                        svgId:      `dev_${d.id}_p${ind.index}`
                    });
                });
            });

            // Collect all unique P-indices across all devices for the field filter
            const allPIndices = [...new Set(
                devices.flatMap(d => d.indicators.map(i => i.index))
            )].sort((a, b) => a - b);
            const pFieldPattern = allPIndices.map(i => `P${i}`).join('|');

            // Device lookup array for eventSource JS
            const deviceArray = devices.map((d, idx) => ({ query: idx, id: d.id }));

            // Grafana query targets
            const REFS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const targets = devices.map((d, idx) => {
                const query = `device_times = from(bucket: "${bucket}")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "from")
  |> filter(fn: (r) => r._value == ${d.id})
  |> keep(columns: ["_time"])

all_params = from(bucket: "${bucket}")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field =~ /^(${pFieldPattern})$/)

join(tables: {params: all_params, device: device_times}, on: ["_time"])
  |> group(columns: ["_field"])
  |> last()
  |> group()
  |> pivot(rowKey: [], columnKey: ["_field"], valueColumn: "_value")
  |> drop(columns: ["_time", "_start", "_stop"])`;

                if (idx === 0) return { query, refId: REFS[idx] };

                return {
                    datasource: { type: 'influxdb', uid: 'bel3jiqj11lhcf' },
                    hide: false, query, refId: REFS[idx]
                };
            });

            // eventSource JS – preset colors as defaults, overridden by user-defined indicator colors
            const colorMap = {};
            for (let i = 1; i <= 8; i++)
                colorMap[`P${i}`] = { ON: INDICATOR_PRESET_COLORS[i] || '#555555', OFF: INDICATOR_PRESET_OFF_COLOR };
            devices.forEach(d => {
                d.indicators.forEach(ind => {
                    const key       = `P${ind.index}`;
                    const presetOn  = INDICATOR_PRESET_COLORS[ind.index] || '#555555';
                    const presetOff = INDICATOR_PRESET_OFF_COLOR;
                    const onChanged  = ind.color    && ind.color    !== presetOn;
                    const offChanged = ind.offColor && ind.offColor !== presetOff;
                    if (onChanged || offChanged)
                        colorMap[key] = { ON: ind.color || presetOn, OFF: ind.offColor || presetOff };
                });
            });
            const colorMapEntries = Object.entries(colorMap)
                .map(([k, v]) => `  '${k}': { 'ON': '${v.ON}', 'OFF': '${v.OFF}' }`)
                .join(',\n');
            const colorMapJS = `const colorMapping = {\n${colorMapEntries}\n};`;

            // Build blinkConfig: svgId → true for indicators with blink enabled
            const blinkConfig = {};
            devices.forEach(d => {
                d.indicators.forEach(ind => {
                    if (ind.blink) blinkConfig[`dev_${d.id}_p${ind.index}`] = true;
                });
            });

            // Build svgOffColors: svgId → offColor (used to initialize all indicators as OFF)
            const svgOffColors = {};
            devices.forEach(d => {
                d.indicators.forEach(ind => {
                    svgOffColors[`dev_${d.id}_p${ind.index}`] = ind.offColor || INDICATOR_PRESET_OFF_COLOR;
                });
            });

            const eventSource = `// =========================================
// ACE.SVG RENDER CODE – Generated by NGIS Floorplan Editor
// Bucket: ${bucket} | Measurement: ${measurement}
// =========================================

${colorMapJS}

const blinkConfig = ${JSON.stringify(blinkConfig)};
if (!window._blinkTimers) window._blinkTimers = {};
const blinkTimers = window._blinkTimers;

// Initialize all indicators to OFF state (before data arrives)
const svgOffColors = ${JSON.stringify(svgOffColors)};
Object.entries(svgOffColors).forEach(([svgId, color]) => {
  if (blinkTimers[svgId]) { clearInterval(blinkTimers[svgId]); delete blinkTimers[svgId]; }
  if (svgmap[svgId]) { svgmap[svgId].node.style.fill = color; svgmap[svgId].fill(color); }
});

const devices = ${JSON.stringify(deviceArray, null, 2)};

devices.forEach(device => {
  try {
    if (!data.series || !data.series[device.query]) return;
    const series = data.series[device.query];
    const fields = series.fields;
    const params = [${allPIndices.map(i => `'P${i}'`).join(', ')}];

    params.forEach((param, index) => {
      const field = fields.find(f => f.name === param);
      if (!field || !field.values || field.values.length === 0) return;

      const value    = field.values[field.values.length - 1];
      const onColor  = colorMapping[param]?.['ON']  || '#333333';
      const offColor = colorMapping[param]?.['OFF'] || '#333333';
      const svgId    = \`dev_\${device.id}_p\${param.slice(1)}\`;

      if (!svgmap[svgId]) return;

      // Clear any existing blink timer for this element
      if (blinkTimers[svgId]) { clearInterval(blinkTimers[svgId]); delete blinkTimers[svgId]; }

      if (value === 'ON' && blinkConfig[svgId]) {
        let state = true;
        blinkTimers[svgId] = setInterval(() => {
          const c = state ? onColor : offColor;
          if (svgmap[svgId]) { svgmap[svgId].node.style.fill = c; svgmap[svgId].fill(c); }
          state = !state;
        }, 800);
      } else {
        const color = value === 'ON' ? onColor : offColor;
        svgmap[svgId].node.style.fill = color;
        svgmap[svgId].fill(color);
      }
    });
  } catch (error) {
    console.error(\`Error processing device \${device.id}:\`, error);
  }
});`;

            const grafanaJSON = {
                annotations: { list: [{
                    builtIn: 1,
                    datasource: { type: 'grafana', uid: '-- Grafana --' },
                    enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)',
                    name: 'Annotations & Alerts', type: 'dashboard'
                }]},
                editable: true, fiscalYearStartMonth: 0, graphTooltip: 0,
                id: null, links: [],
                panels: [{
                    datasource: { type: 'influxdb', uid: 'bel3jiqj11lhcf' },
                    fieldConfig: {
                        defaults: {
                            color: { mode: 'thresholds' }, mappings: [],
                            thresholds: { mode: 'absolute', steps: [
                                { color: 'green' }, { color: 'red', value: 80 }
                            ]}
                        },
                        overrides: []
                    },
                    gridPos: { h: 18, w: 18, x: 0, y: 0 },
                    id: 14,
                    options: {
                        addAllIDs: false, captureMappings: false,
                        eventSource, initSource: "console.log('NGIS Floorplan Editor – Dashboard loaded');",
                        svgMappings, svgSource: svgContent
                    },
                    pluginVersion: '0.1.5',
                    targets,
                    title: 'NGIS Floorplan',
                    transparent: true,
                    type: 'aceiot-svg-panel'
                }],
                schemaVersion: 41,
                tags: ['ngis', 'floorplan'],
                templating: { list: [] },
                time: { from: 'now-6h', to: 'now' },
                timepicker: {}, timezone: 'browser',
                title: 'NGIS Floorplan – Generated',
                uid: null, version: 1
            };

            this._triggerDownload(
                new Blob([JSON.stringify(grafanaJSON, null, 2)], { type: 'application/json' }),
                `grafana_floorplan_${Date.now()}.json`
            );
            this.updateStatus(`JSON exported: ${devices.length} devices, ${targets.length} queries`);
            alert(`✓ Grafana JSON exported!\n\n${devices.length} devices · ${targets.length} queries · ${svgMappings.length} indicators\nBucket: ${bucket} · Measurement: ${measurement}`);
        } catch (err) {
            this.updateStatus(`JSON export error: ${err.message}`, 'error');
            alert(`Error exporting JSON: ${err.message}`);
        }
    }

    _triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    // ─── View ────────────────────────────────────────────────────────────────

    handleZoomIn()    { this.editor.zoomIn();    this.updateZoomLevel(); }
    handleZoomOut()   { this.editor.zoomOut();   this.updateZoomLevel(); }
    handleResetView() { this.editor.resetView(); this.updateZoomLevel(); this.updateStatus('View reset'); }
    handleToggleGrid(){ this.editor.toggleGrid(); }

    updateZoomLevel() {
        const s = this.editor.svgHandler.scale;
        document.getElementById('zoom-level').textContent = `Zoom: ${Math.round(s * 100)}%`;
    }

    // ─── Devices ─────────────────────────────────────────────────────────────

    handleAddDevice() {
        const deviceId = prompt('Enter Device ID (e.g. 3665154952):');
        if (!deviceId) return;
        const name = prompt('Enter Device Name:', `Device ${deviceId}`);
        if (!name) return;
        try {
            this.editor.createDevice(deviceId, name, 100, 100);
            this.updateDeviceList(); this.updateUI();
            this.updateStatus(`Device ${deviceId} created`);
        } catch (err) { alert(`Error: ${err.message}`); }
    }

    handleCreateDevice() {
        const deviceId      = document.getElementById('new-device-id').value.trim();
        const deviceName    = document.getElementById('new-device-name').value.trim();
        const numIndicators = parseInt(document.getElementById('new-device-indicators').value) || 5;

        if (!deviceId) { alert('Please enter Device ID'); return; }
        if (numIndicators < 1 || numIndicators > 8) { alert('Number of indicators must be 1–8'); return; }

        try {
            this.editor.createDevice(deviceId, deviceName || `Device ${deviceId}`, 100, 100, numIndicators);
            this.updateDeviceList(); this.updateUI();
            this.updateStatus(`Device ${deviceId} created (${numIndicators} indicators)`);
            document.getElementById('new-device-id').value = '';
            document.getElementById('new-device-name').value = '';
            document.getElementById('new-device-indicators').value = '5';
        } catch (err) { alert(`Error: ${err.message}`); }
    }

    handleDeleteDevice() {
        const d = this.editor.getSelectedDevice();
        if (!d) { alert('Please select a device first'); return; }
        if (confirm(`Really delete device "${d.name}" (ID: ${d.id})?`)) {
            this.editor.deleteDevice(d.id);
            this.updateDeviceList(); this.updatePropertiesPanel(); this.updateUI();
            this.updateStatus(`Device ${d.id} deleted`);
        }
    }

    // ─── Undo / Redo ─────────────────────────────────────────────────────────

    handleUndo() {
        if (this.editor.undo()) { this.updateDeviceList(); this.updatePropertiesPanel(); this.updateUI(); this.updateStatus('Undo'); }
    }
    handleRedo() {
        if (this.editor.redo()) { this.updateDeviceList(); this.updatePropertiesPanel(); this.updateUI(); this.updateStatus('Redo'); }
    }
    handleReset() {
        if (confirm('Reset editor? All unsaved changes will be lost.')) location.reload();
    }

    // ─── Keyboard ────────────────────────────────────────────────────────────

    handleKeyboard(e) {
        // Skip if user is typing in an input field
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (e.ctrlKey && e.key === 'z' && !e.shiftKey)
            { e.preventDefault(); this.handleUndo(); }
        else if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y'))
            { e.preventDefault(); this.handleRedo(); }
        else if (e.key === 'Delete')
            this.handleDeleteDevice();
        else if (e.key === 'Escape')
            { this.editor.deselectDevice(); this.updatePropertiesPanel(); this.updateDeviceList(); }
    }

    // ─── Canvas events ───────────────────────────────────────────────────────

    handleDeviceMoved(e) {
        const { deviceId, x, y } = e.detail;
        this.updateStatus(`Device ${deviceId} → (${Math.round(x)}, ${Math.round(y)})`);
        this.updatePropertiesPanel();
    }

    handleDeviceResized(e) {
        this.updatePropertiesPanel();
        this.updateStatus(`Device ${e.detail.deviceId} scale: ${e.detail.scale.toFixed(2)}`);
    }

    handleDeviceClicked(e) {
        this.editor.selectDevice(e.detail.deviceId);
        this.updateDeviceList();
        this.updatePropertiesPanel();
    }

    handleMouseMove(e) {
        const r = e.currentTarget.getBoundingClientRect();
        document.getElementById('cursor-pos').textContent =
            `X: ${Math.round(e.clientX - r.left)}, Y: ${Math.round(e.clientY - r.top)}`;
    }

    // ─── Device List (left sidebar) ──────────────────────────────────────────

    updateDeviceList() {
        const devices = this.editor.getDevices();
        const list    = document.getElementById('device-list');

        if (!devices.length) {
            list.innerHTML = '<p class="placeholder">No devices available</p>';
            return;
        }

        list.innerHTML = devices.map(d => {
            const sel      = this.editor.selectedDevice === d.id;
            const safeName = this._escapeHtml(d.name);
            const safeId   = this._escapeHtml(d.id);
            return `
            <div class="device-item ${sel ? 'selected' : ''}" data-device-id="${safeId}">
                <div class="device-item-header">
                    <span class="device-name">${safeName}</span>
                </div>
                <div class="device-id">ID: ${safeId}</div>
                <div class="device-status" style="margin-top:4px;">
                    ${d.indicators.map(i =>
                        `<div class="status-dot" title="P${i.index}" style="background:${this._escapeHtml(i.color)}"></div>`
                    ).join('')}
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => {
                this.editor.selectDevice(item.dataset.deviceId);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });
    }

    // ─── Properties Panel (right sidebar) ────────────────────────────────────

    updatePropertiesPanel() {
        const device = this.editor.getSelectedDevice();
        const panel  = document.getElementById('properties-content');

        if (!device) {
            panel.innerHTML = '<p class="placeholder">Select a device to view properties</p>';
            return;
        }

        const sortedIndicators = [...device.indicators]; // already in visual order
        const selectedIndices  = sortedIndicators.map(i => i.index);
        const numIndicators    = device.indicators.length;

        const safeName = this._escapeHtml(device.name);
        const safeId   = this._escapeHtml(device.id);

        panel.innerHTML = `
        <!-- Device Info -->
        <div class="property-group">
            <h4>Device Information</h4>
            <div class="property-row">
                <span class="property-label">Name</span>
                <input type="text" id="prop-name" value="${safeName}">
            </div>
            <div class="property-row">
                <span class="property-label">ID</span>
                <input type="text" id="prop-id" value="${safeId}">
            </div>
        </div>

        <!-- Position -->
        <div class="property-group">
            <h4>Position & Scale</h4>
            <div class="property-row">
                <span class="property-label">X</span>
                <input type="number" id="prop-x" value="${Math.round(device.x)}">
            </div>
            <div class="property-row">
                <span class="property-label">Y</span>
                <input type="number" id="prop-y" value="${Math.round(device.y)}">
            </div>
            <div class="property-row">
                <span class="property-label">Scale (0.5 – 20)</span>
                <input type="number" id="prop-scale" value="${(device.scale || 1).toFixed(2)}" step="0.1" min="0.5" max="20">
            </div>
        </div>

        <!-- Status Indicators -->
        <div class="property-group">
            <h4>Status Indicators</h4>

            <!-- Number & Checkbox selection -->
            <div class="property-row">
                <span class="property-label">Number (target)</span>
                <select id="prop-num-indicators">
                    ${[1,2,3,4,5,6,7,8].map(n =>
                        `<option value="${n}" ${n === numIndicators ? 'selected' : ''}>${n}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="property-row" style="margin-top:0.75rem;">
                <span class="property-label">Active indicators:</span>
            </div>
            <div id="indicator-checkboxes" style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem;margin-top:0.35rem;">
                ${[1,2,3,4,5,6,7,8].map(n => `
                    <label style="display:flex;align-items:center;gap:0.25rem;cursor:pointer;">
                        <input type="checkbox" class="indicator-checkbox" data-indicator="${n}"
                               ${selectedIndices.includes(n) ? 'checked' : ''}>
                        <span style="font-size:0.875rem;">P${n}</span>
                    </label>`).join('')}
            </div>
            <div style="margin-top:0.4rem;font-size:0.8rem;color:#888;">
                Selected: <span id="indicator-count">${selectedIndices.length}</span>/${numIndicators}
                <span id="indicator-warning" style="margin-left:0.4rem;"></span>
            </div>

            <!-- ─── Reorder Section ─── -->
            <div style="margin-top:1rem;border-top:1px solid #444;padding-top:0.75rem;">
                <div style="font-size:0.75rem;color:#aaa;text-transform:uppercase;margin-bottom:0.25rem;">
                    Order &amp; Configuration
                </div>
                <div style="font-size:0.7rem;color:#555;font-style:italic;margin-bottom:0.5rem;">drag ⠿ to reorder</div>
                <div id="indicator-order-list">
                    ${sortedIndicators.map((ind, arrayIdx) => `
                    <div class="indicator-row" data-pindex="${ind.index}" draggable="true"
                         style="display:flex;align-items:center;gap:0.25rem;
                                background:#2a2a2a;border:1px solid #444;border-radius:4px;
                                padding:0.28rem 0.3rem;margin-bottom:0.28rem;cursor:grab;
                                box-sizing:border-box;overflow:visible;">
                        <!-- Drag handle -->
                        <span class="drag-handle" title="Drag to reorder"
                              style="flex-shrink:0;color:#555;font-size:0.95rem;cursor:grab;user-select:none;">⠿</span>
                        <!-- ON / OFF state dots -->
                        <div style="flex-shrink:0;display:flex;flex-direction:column;gap:2px;"
                             title="ON: ${ind.color} · OFF: ${ind.offColor || '#333333'}">
                            <div style="width:13px;height:6px;border-radius:1px;background:${ind.color};" title="ON"></div>
                            <div style="width:13px;height:6px;border-radius:1px;background:${ind.offColor || '#333333'};border:1px solid #555;" title="OFF"></div>
                        </div>
                        <!-- P-label -->
                        <span style="flex-shrink:0;font-size:0.78rem;font-weight:bold;color:#ddd;width:20px;">P${ind.index}</span>
                        <!-- Color picker ON state -->
                        <input type="color" id="prop-color-${ind.index}" class="ind-color-input"
                               value="${ind.color}" data-indicator="${ind.index}"
                               title="ON color"
                               style="flex-shrink:0;width:20px;height:20px;padding:0;border:none;
                                      border-radius:3px;cursor:pointer;background:none;">
                        <!-- Color picker OFF state -->
                        <input type="color" id="prop-off-color-${ind.index}" class="ind-off-color-input"
                               value="${ind.offColor || '#333333'}" data-indicator="${ind.index}"
                               title="OFF color"
                               style="flex-shrink:0;width:20px;height:20px;padding:0;border:none;
                                      border-radius:3px;cursor:pointer;background:none;opacity:0.7;">
                        <!-- Reset both colors to preset -->
                        <button class="btn ind-reset-color" data-pindex="${ind.index}"
                                title="Reset ON + OFF to preset"
                                style="flex-shrink:0;padding:0.08rem 0.3rem;font-size:0.75rem;line-height:1;opacity:0.6;">↺</button>
                        <!-- Blink toggle -->
                        <button class="btn ind-blink-toggle" data-pindex="${ind.index}"
                                title="${ind.blink ? 'Blinking – click for solid' : 'Solid – click to enable blink'}"
                                style="flex-shrink:0;padding:0.08rem 0.3rem;font-size:0.8rem;line-height:1;
                                       color:${ind.blink ? '#10D1CD' : '#555'};
                                       border:1px solid ${ind.blink ? '#10D1CD' : 'transparent'};">
                            ${ind.blink ? '⚡' : '◼'}</button>
                        <!-- Move up / down -->
                        <button class="btn ind-up" data-pindex="${ind.index}" title="Move up"
                                ${arrayIdx === 0 ? 'disabled' : ''}
                                style="flex-shrink:0;padding:0.05rem 0.2rem;font-size:0.7rem;line-height:1;
                                       opacity:${arrayIdx === 0 ? '0.25' : '0.65'};">▲</button>
                        <button class="btn ind-down" data-pindex="${ind.index}" title="Move down"
                                ${arrayIdx === sortedIndicators.length - 1 ? 'disabled' : ''}
                                style="flex-shrink:0;padding:0.05rem 0.2rem;font-size:0.7rem;line-height:1;
                                       opacity:${arrayIdx === sortedIndicators.length - 1 ? '0.25' : '0.65'};">▼</button>
                    </div>`).join('')}
                </div>
            </div>
        </div>
        `;

        this._bindPropertyEvents(device, sortedIndicators, selectedIndices, numIndicators);
    }

    /** Bind all event listeners in the properties panel */
    _bindPropertyEvents(device, sortedIndicators, selectedIndices, numIndicators) {

        // ── Basic properties ──────────────────────────────────────────────────

        document.getElementById('prop-name')?.addEventListener('change', e => {
            this.editor.updateDeviceName(device.id, e.target.value);
            this.updateDeviceList();
        });

        document.getElementById('prop-id')?.addEventListener('change', e => {
            const newId = e.target.value.trim();
            if (newId && newId !== device.id) {
                this.editor.updateDeviceId(device.id, newId);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            }
        });

        document.getElementById('prop-x')?.addEventListener('change', e => {
            this.editor.updateDevicePosition(device.id, parseInt(e.target.value), device.y);
        });
        document.getElementById('prop-y')?.addEventListener('change', e => {
            this.editor.updateDevicePosition(device.id, device.x, parseInt(e.target.value));
        });
        document.getElementById('prop-scale')?.addEventListener('change', e => {
            this.editor.updateDeviceScale(device.id, parseFloat(e.target.value));
        });

        // ── Number dropdown ───────────────────────────────────────────────────

        document.getElementById('prop-num-indicators')?.addEventListener('change', e => {
            this._validateIndicatorCheckboxes(parseInt(e.target.value));
        });

        // ── Checkboxes ────────────────────────────────────────────────────────

        document.querySelectorAll('.indicator-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const target    = parseInt(document.getElementById('prop-num-indicators').value);
                const checked   = [...document.querySelectorAll('.indicator-checkbox:checked')];
                const count     = checked.length;
                document.getElementById('indicator-count').textContent = count;
                const warn = document.getElementById('indicator-warning');

                if (count !== target) {
                    warn.textContent = `⚠️ Select exactly ${target}`;
                    warn.style.color = '#ff4444';
                } else {
                    warn.textContent = '✓';
                    warn.style.color = '#00cc66';
                    // Get current visual order, filter to checked only (keep existing order)
                    const currentOrder = [...document.querySelectorAll('.indicator-row')]
                        .map(r => parseInt(r.dataset.pindex));
                    const newOrder = [
                        ...currentOrder.filter(p => checked.map(c => parseInt(c.dataset.indicator)).includes(p)),
                        ...checked.map(c => parseInt(c.dataset.indicator))
                              .filter(p => !currentOrder.includes(p))
                    ].filter((p, i, arr) => arr.indexOf(p) === i); // deduplicate

                    this.editor.updateDeviceIndicators(device.id, newOrder);
                    this.updatePropertiesPanel();
                    this.updateDeviceList();
                }
            });
        });

        // ── Reset color buttons (resets ON + OFF to preset) ──────────────────

        document.querySelectorAll('.ind-reset-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const pIndex   = parseInt(btn.dataset.pindex);
                const presetOn = INDICATOR_PRESET_COLORS[pIndex] || '#555555';
                this.editor.updateIndicatorColor(device.id, pIndex, presetOn);
                this.editor.updateIndicatorOffColor(device.id, pIndex, INDICATOR_PRESET_OFF_COLOR);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        // ── ON color pickers ──────────────────────────────────────────────────

        document.querySelectorAll('.ind-color-input').forEach(input => {
            input.addEventListener('change', e => {
                const pIndex = parseInt(e.target.dataset.indicator);
                this.editor.updateIndicatorColor(device.id, pIndex, e.target.value);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        // ── OFF color pickers ─────────────────────────────────────────────────

        document.querySelectorAll('.ind-off-color-input').forEach(input => {
            input.addEventListener('change', e => {
                const pIndex = parseInt(e.target.dataset.indicator);
                this.editor.updateIndicatorOffColor(device.id, pIndex, e.target.value);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        // ── Blink toggle ──────────────────────────────────────────────────────

        document.querySelectorAll('.ind-blink-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const pIndex    = parseInt(btn.dataset.pindex);
                const device_   = this.editor.getSelectedDevice();
                const ind       = device_?.indicators.find(i => i.index === pIndex);
                const newBlink  = !(ind?.blink || false);
                this.editor.updateIndicatorBlink(device.id, pIndex, newBlink);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        // ── Up / Down buttons ─────────────────────────────────────────────────

        document.querySelectorAll('.ind-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const pIndex = parseInt(btn.dataset.pindex);
                const order  = this._getCurrentIndicatorOrder();
                const idx    = order.indexOf(pIndex);
                if (idx <= 0) return;
                [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                this.editor.reorderDeviceIndicators(device.id, order);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        document.querySelectorAll('.ind-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const pIndex = parseInt(btn.dataset.pindex);
                const order  = this._getCurrentIndicatorOrder();
                const idx    = order.indexOf(pIndex);
                if (idx < 0 || idx >= order.length - 1) return;
                [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
                this.editor.reorderDeviceIndicators(device.id, order);
                this.updateDeviceList();
                this.updatePropertiesPanel();
            });
        });

        // ── HTML5 Drag-to-reorder ─────────────────────────────────────────────

        this._setupIndicatorDragReorder(device);
    }

    /** Read current P-index order from DOM rows */
    _getCurrentIndicatorOrder() {
        return [...document.querySelectorAll('.indicator-row')]
            .map(r => parseInt(r.dataset.pindex));
    }

    _validateIndicatorCheckboxes(target) {
        const checked = document.querySelectorAll('.indicator-checkbox:checked').length;
        const warn    = document.getElementById('indicator-warning');
        document.getElementById('indicator-count').textContent = checked;
        if (checked !== target) {
            warn.textContent = `⚠️ Select exactly ${target}`;
            warn.style.color = '#ff4444';
        } else {
            warn.textContent = '✓'; warn.style.color = '#00cc66';
        }
    }

    /** HTML5 drag-and-drop reorder for indicator rows */
    _setupIndicatorDragReorder(device) {
        const container = document.getElementById('indicator-order-list');
        if (!container) return;

        let dragSrc = null;

        container.querySelectorAll('.indicator-row').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                dragSrc = row;
                row.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });

            row.addEventListener('dragend', () => {
                row.style.opacity = '';
                container.querySelectorAll('.indicator-row').forEach(r => {
                    r.classList.remove('drag-over');
                    r.style.borderColor = '#444';
                });
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (row === dragSrc) return;
                e.dataTransfer.dropEffect = 'move';
                row.style.borderColor = '#10D1CD';
            });

            row.addEventListener('dragleave', () => {
                row.style.borderColor = '#444';
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (row === dragSrc) return;

                // Swap in DOM
                const rows = [...container.querySelectorAll('.indicator-row')];
                const srcIdx = rows.indexOf(dragSrc);
                const tgtIdx = rows.indexOf(row);

                if (srcIdx < tgtIdx) container.insertBefore(dragSrc, row.nextSibling);
                else                  container.insertBefore(dragSrc, row);

                row.style.borderColor = '#444';

                // Apply new order
                const newOrder = [...container.querySelectorAll('.indicator-row')]
                    .map(r => parseInt(r.dataset.pindex));

                this.editor.reorderDeviceIndicators(device.id, newOrder);
                this.updateDeviceList();

                // Refresh panel to update ▲▼ button disabled state
                setTimeout(() => this.updatePropertiesPanel(), 50);
            });
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── UI state ─────────────────────────────────────────────────────────────

    updateUI() {
        const hasDevices   = this.editor.getDevices().length > 0;
        const hasSelection = !!this.editor.getSelectedDevice();
        document.getElementById('btn-download').disabled     = !hasDevices;
        document.getElementById('btn-save-json').disabled   = !hasDevices;
        document.getElementById('btn-delete-device').disabled = !hasSelection;
        document.getElementById('btn-undo').disabled         = !this.editor.canUndo();
        document.getElementById('btn-redo').disabled         = !this.editor.canRedo();
    }

    updateStatus(msg, type = 'info') {
        const el = document.getElementById('status-text');
        el.textContent = msg;
        el.style.color = type === 'error' ? '#ff6a00' : '#888';
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
