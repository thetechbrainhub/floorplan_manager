# NGIS Floor Plan Editor

Professional browser-based editor for SVG floorplans with Grafana ACE.SVG integration.

---

## ⚖️ Copyright & License

**Copyright (c) 2025 NGIS PTE LTD. All rights reserved.**

**Author:** Christian Zeh  
**Contact:** info@ng-is.com

### PROPRIETARY SOFTWARE – ALL RIGHTS RESERVED

This software is proprietary and confidential. Unauthorized copying, modification,
distribution, or use of this software, via any medium, is strictly prohibited
without express written permission from NGIS PTE LTD.

See LICENSE.txt for full legal terms.

---

## 🚀 Quick Start (Local Testing)

No installation required. Just a terminal and a modern browser.

### 1. Extract the ZIP

Unzip the archive anywhere on your machine.

### 2. Start a local web server

Open a terminal, navigate to the folder containing `index.html`, then run:

```bash
cd /path/to/ngis-floorplan-editor
python3 -m http.server 8000
```

**Mac tip:** In Finder, right-click the folder → *Services → New Terminal at Folder*,
then just type `python3 -m http.server 8000`.

### 3. Open in browser

```
http://localhost:8000
```

### 4. Stop the server

Press `Ctrl + C` in the terminal.

> **Why a web server?** Browsers block local file access (`file://`) for security reasons.
> A local server sidesteps this without any installation needed.

---

## ✨ Features

- **Load SVG** – import existing floorplans, auto-fitted to screen
- **Add Devices** – create andon status indicator groups (P1–P8)
- **Drag & Drop** – position devices visually on the canvas
- **Resize** – drag the teal handle (bottom-right of device) or enter scale manually (0.5–20)
- **Indicator Reordering** – drag rows or use ▲▼ to change the visual stack order of P-indicators independently from their P-number/query assignment
- **Undo / Redo** – full history (50 steps), including scale and indicator order
- **Save SVG** – export the edited floorplan (resize handles stripped automatically)
- **Save JSON** – export a ready-to-import Grafana dashboard with Flux queries and ACE.SVG mappings
- **Reset** – clear the workspace and start fresh

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` | Delete selected device |
| `Escape` | Deselect |
| `Shift + Drag` / Middle mouse | Pan canvas |
| Mouse wheel | Zoom in / out |

---

## 🎯 Workflow

### Load & Edit
1. Click **Load SVG** and select your floorplan file
2. Add devices via the left sidebar or **➕ Add** in the toolbar
3. Drag devices to position them on the floorplan
4. Select a device to edit properties in the right panel

### Configure Indicators
- **Number (target):** how many indicators this device has
- **Active indicators:** tick exactly N checkboxes to choose which P-numbers are active
- **Order & Configuration:** drag rows or use ▲▼ to set the visual top-to-bottom order on the canvas. The P-number (and its Grafana query reference) stays fixed — only the physical position changes.
- Set a **Q#** (query number) and **color** per indicator

### Grafana Export
1. Fill in **Bucket** and **Measurement** in the left sidebar (required)
2. Click **📤 JSON** — downloads a complete Grafana dashboard JSON
3. Import into Grafana via *Dashboards → Import*

The exported JSON includes:
- SVG source (resize handles removed)
- ACE.SVG `svgMappings` for every indicator
- One Flux query per device (filtered to your exact P-indices)
- `eventSource` JavaScript for color-mapping ON/OFF states

---

## 📋 Requirements

- Modern browser (Chrome, Firefox, Safari, Edge)
- Python 3 for local testing (pre-installed on macOS and most Linux)
- Internet connection (SVG.js loaded from CDN)

---

## 📝 Changelog

### v2 (2025)
- **New:** Indicator reordering – drag rows or use ▲▼ to change the visual stack order per device, independent of P-number assignment
- **New:** Indicator visual order is saved and restored in Undo/Redo history
- **Fix:** `updateDeviceId` now uses the real P-number (not array index) when renaming indicator IDs — previously caused wrong IDs after checkbox-based selection
- **Fix:** `captureState` / `restoreState` now saves and restores device scale — scale was silently lost on Undo/Redo
- **Fix:** Grafana JSON Flux query field filter was hardcoded to `P[1-5]`; now dynamically built from the actual P-indices in use (e.g. `P1|P3|P7`)
- **Fix:** Delete key no longer fires while typing in input fields
- **UI:** Indicator rows in properties panel no longer overflow/overlap in narrow sidebar
- **UI:** "Drag or use ▲▼" hint moved to its own line below the section header

### v1 (2025)
- Initial release: SVG load, device create/delete, drag & drop, scale, P1–P8 indicators with checkbox selection, color picker, query assignment, Undo/Redo, SVG + Grafana JSON export

---

## 🔒 Legal Notice

This software is protected by copyright law and international treaties.
Unauthorized reproduction or distribution may result in severe civil and criminal
penalties and will be prosecuted to the maximum extent possible under the law.

For licensing inquiries: info@ng-is.com

---

**NGIS PTE LTD** | Singapore | 2025
