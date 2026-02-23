# NGIS Floor Plan Editor

Professional browser-based editor for SVG floorplans with Grafana ACE.SVG integration.

---

## ⚖️ Copyright & License

**Copyright (c) 2025–2026 NGIS PTE LTD. All rights reserved.**

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
- **ON / OFF Colors** – set individual on-state and off-state colors per indicator
- **Blink** – enable blinking for any indicator when in ON state
- **Undo / Redo** – full history (50 steps), including scale and indicator order
- **Save SVG** – export the edited floorplan (resize handles stripped automatically)
- **Save JSON** – export a ready-to-import Grafana dashboard with Flux queries and ACE.SVG mappings
- **Reset** – clear the workspace and start fresh

---

## 🖱️ Using the Editor

### Loading a Floorplan

Click **📁 Load SVG** in the toolbar (or the large button in the empty canvas) and select your SVG file.
The floorplan is loaded and automatically fitted to the canvas. All existing devices embedded in the SVG are detected and listed in the left sidebar.

### Adding Devices

**Via the toolbar:**
Click **➕ Add** in the *Devices* section, enter a Device ID and a name when prompted.

**Via the left sidebar:**
Fill in *Device ID*, *Name*, and the desired *Number of Indicators* (1–8), then click **Create**.
The new device appears at position (100, 100) and can be dragged to its final position.

### Selecting & Moving Devices

- **Click** on any device tile in the canvas to select it — the right panel shows its properties.
- **Drag** the device to reposition it. The position is committed when you release the mouse button.
- Alternatively, edit **X** and **Y** directly in the properties panel and press Enter.

### Scaling Devices

- Drag the **teal square handle** at the bottom-right corner of a selected device up or down.
- Or edit the **Scale** field (0.5–20) in the properties panel and press Enter.

### Configuring Indicators

Each device has up to 8 indicator slots (P1–P8). In the properties panel:

| Control | Description |
|---------|-------------|
| **Number (target)** | How many indicators this device should have |
| **Checkboxes P1–P8** | Choose which P-numbers are active. Exactly *target* must be checked. |
| **ON color** (colored square) | Color shown when the indicator is in ON state |
| **OFF color** (dimmer square) | Color shown when the indicator is in OFF state |
| **↺** | Reset both ON and OFF colors to their preset defaults |
| **⚡ / ◼** | Toggle blink mode for this indicator (⚡ = blinking, ◼ = solid) |
| **▲ / ▼** | Move indicator one step up or down in visual order |
| **⠿ (drag handle)** | Drag an indicator row to reorder it freely |

> **Visual order vs. P-number:** The order of rows determines the top-to-bottom position of
> indicator dots on the canvas tile. The P-number (and its Grafana query reference) is
> independent — you can put P3 on top and P1 at the bottom if needed.

### Undo & Redo

Every action (move, scale, color change, reorder, add, delete) is recorded in the undo history.

| Action | Result |
|--------|--------|
| Undo | Reverts the last change (up to 50 steps) |
| Redo | Re-applies a reverted change |

History is cleared when a new SVG is loaded.

### Exporting

**SVG export (`💾 SVG`):**
Downloads the current floorplan as an SVG file. Resize handles are automatically removed.
The SVG contains all device groups with their indicator elements, ready for use in ACE.SVG panels.

**Grafana JSON export (`📤 JSON`):**
Before exporting, fill in **Bucket** and **Measurement** in the left sidebar (both required).
Click **📤 JSON** to download a complete Grafana dashboard JSON that includes:
- SVG source (handles stripped)
- ACE.SVG `svgMappings` for every indicator
- One Flux query per device (filtered to your exact P-indices)
- `eventSource` JavaScript for ON/OFF color mapping and blink animation

Import into Grafana via *Dashboards → Import → Upload JSON file*.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + Z` | Undo last action |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + Y` | Redo (alternative) |
| `Delete` | Delete selected device |
| `Escape` | Deselect current device |
| Mouse wheel | Zoom canvas in / out |

> Keyboard shortcuts are disabled while typing in any input field.

---

## 📋 Requirements

- Modern browser (Chrome, Firefox, Safari, Edge)
- Python 3 for local testing (pre-installed on macOS and most Linux)
- Internet connection (SVG.js loaded from CDN)

---

## 📝 Changelog

### v2.1 (February 2026)
- **Fix:** Position jump bug — after dragging and scaling, devices no longer snap back to their insert position. Root cause: SVG.js draggable v3 repositions child elements rather than the group transform; position is now consolidated in `dragend` by baking the child offset into the group transform and resetting children to local origin.
- **Fix:** ▲▼ indicator buttons no longer clipped in the properties panel (`overflow:hidden` → `overflow:visible` on indicator rows)
- **UI:** Properties panel widened and padding tuned for comfortable display of all indicator controls
- **UI:** Indicator row layout refined — all 9 controls (handle, color dots, P-label, ON/OFF pickers, reset, blink, ▲▼) fully visible without horizontal scrolling

### v2 (2025)
- **New:** Indicator reordering – drag rows or use ▲▼ to change the visual stack order per device, independent of P-number assignment
- **New:** OFF-state color picker per indicator
- **New:** Blink toggle per indicator (⚡ = blinking when ON, ◼ = solid)
- **New:** Indicator visual order saved and restored in Undo/Redo history
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

**NGIS PTE LTD** | Singapore | 2026
