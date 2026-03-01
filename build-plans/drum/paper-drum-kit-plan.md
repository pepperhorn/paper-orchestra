# Paper Drum Kit — Claude Code Development Plan

## Project Summary

A browser-based drum kit that uses a front-facing camera to detect printed paper pads (ArUco markers + colour rings). Users print A5+ templates, place them anywhere in the camera field, assign samples via a web UI, and trigger them by tapping with hands, feet, or sticks.

---

## Repository Structure

```
paper-drum-kit/
├── index.html                  # Entry point
├── src/
│   ├── main.js                 # App bootstrap
│   ├── detection/
│   │   ├── camera.js           # Camera init, frame loop
│   │   ├── aruco.js            # ArUco marker detection (js-aruco2)
│   │   ├── colourTracker.js    # Colour blob tracking (runtime strike detection)
│   │   └── strikeDetector.js   # Occlusion logic → strike events
│   ├── audio/
│   │   ├── engine.js           # Web Audio API context, sample loading
│   │   ├── sampler.js          # Pad → sample mapping, trigger, velocity
│   │   └── defaultSamples.js   # Bundled fallback samples (base64 or CDN URLs)
│   ├── ui/
│   │   ├── App.jsx             # Root React component
│   │   ├── PadManager.jsx      # Pad list, sample assignment per pad
│   │   ├── CameraView.jsx      # Live feed + overlay canvas
│   │   ├── ScanButton.jsx      # Trigger ArUco scan / re-scan
│   │   └── Settings.jsx        # Sensitivity, camera select, colour calibration
│   └── utils/
│       ├── colourUtils.js      # HSV conversion, dominant colour extraction
│       └── storage.js          # localStorage: save/restore pad-sample assignments
├── templates/
│   ├── generate_pads.py        # Python: generate A5 SVG/PDF pad sheets
│   └── pads_sheet.svg          # Pre-generated 8-pad printable template
├── samples/
│   └── (bundled drum samples: kick, snare, hihat, etc.)
├── public/
│   └── favicon, manifest
├── package.json
└── vite.config.js
```

---

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Bundler | Vite | Fast dev server, ES module native |
| UI | React (JSX) | Component model suits pad manager |
| Styling | Tailwind CSS | Utility-first, consistent with other project UIs |
| ArUco detection | `js-aruco2` | Proven in air piano/guitar projects |
| Colour tracking | Custom canvas HSV | Lightweight, no extra deps |
| Audio | Web Audio API | Low-latency sample playback |
| Template generation | Python + `opencv-python` + `cairosvg` | Consistent with prior projects |

---

## Phase 1 — Core Detection Engine

### 1.1 Camera Module (`camera.js`)
- Request `{ video: { facingMode: 'user' }, audio: false }`
- Enumerate cameras; allow switching if multiple available
- Draw each frame to a hidden `<canvas>` at 640×480
- Export `onFrame(callback)` loop using `requestAnimationFrame`

### 1.2 ArUco Scanner (`aruco.js`)
- Load `js-aruco2` with `DICT_6X6_250`
- `scanFrame(imageData)` → returns array of `{ id, corners }`
- Compute pad centre from corner mean
- Export `registerPads(detectedMarkers)` → builds pad registry: `{ [id]: { centre, colourHint, lastSeen } }`

### 1.3 Colour Tracker (`colourTracker.js`)
- On pad registration, sample a ring region around each pad centre
- Extract dominant HSV range (±20 hue, ±30 sat) as pad's colour signature
- `trackPads(imageData, padRegistry)` → for each registered pad, sample pixels in a bounding box; return presence ratio 0–1
- Runs every frame during performance mode (ArUco not needed after registration)

### 1.4 Strike Detector (`strikeDetector.js`)
- Wraps colour tracker output
- State machine per pad: `PRESENT → OCCLUDED → COOLDOWN → PRESENT`
- Occlusion threshold: presence ratio drops below 0.5
- Strike fires on `PRESENT → OCCLUDED` transition
- Cooldown: 150ms (configurable) prevents re-trigger
- Emits `CustomEvent('padstrike', { detail: { padId, velocity } })` on window
- Velocity: estimated from occlusion speed (delta between frames)

---

## Phase 2 — Audio Engine

### 2.1 Engine (`engine.js`)
- Singleton `AudioContext`, resumed on first user gesture
- `loadSample(url)` → fetch, decode, cache as `AudioBuffer`
- `playSample(buffer, velocity)` → `BufferSourceNode` → `GainNode` → destination

### 2.2 Sampler (`sampler.js`)
- Map: `{ [padId]: { buffer, name, url } }`
- Listen for `padstrike` events → look up pad → trigger engine
- `assignSample(padId, url)` → load + cache + store
- `getPadMap()` / `setPadMap()` for UI binding

### 2.3 Default Samples (`defaultSamples.js`)
- 8 bundled GM-style samples: kick, snare, closed hat, open hat, clap, tom-hi, tom-lo, rimshot
- Hosted as static assets in `/samples/`; loaded lazily on first assignment

---

## Phase 3 — Web UI

### 3.1 Layout

```
┌────────────────────────────────────────┐
│  📷 Camera View + Overlay              │
│  (pad outlines drawn when detected)    │
├────────────────────────────────────────┤
│  [SCAN PADS]  [RE-SCAN]  [SETTINGS]    │
├──────────┬─────────────────────────────┤
│  Pad #   │  Sample Name      [Change]  │
│  Pad 1   │  Kick Drum        [▶ test]  │
│  Pad 2   │  Snare            [▶ test]  │
│  …       │  …                          │
└──────────┴─────────────────────────────┘
```

### 3.2 `CameraView.jsx`
- `<video>` (hidden) + `<canvas>` (visible) overlay
- Overlay draws: detected pad outlines (green when present, yellow when struck)
- Shows pad ID number in corner of each detected pad
- Warning banner if fewer than 2 pads detected

### 3.3 `PadManager.jsx`
- List of up to 8 pads (only shows detected pads)
- Each row: pad number, colour swatch (from tracker), assigned sample name, [Change] button, [▶] test button
- [Change] opens sample picker: browser default samples + [Upload custom] file input
- Unassigned pads shown in muted style

### 3.4 `Settings.jsx`
- Strike sensitivity slider (occlusion threshold 0.3–0.7)
- Cooldown duration slider (50ms–500ms)
- Camera selector dropdown
- Colour calibration button: re-samples all pad colour signatures
- "Foot mode" toggle: relaxes occlusion threshold + increases cooldown (optimised for sock/foot coverage)

---

## Phase 4 — Printable Templates

### 4.1 Python Generator (`generate_pads.py`)

```
python generate_pads.py --pads 8 --dict DICT_6X6_250 --start-id 0
```

Outputs:
- `pads_individual/pad_0.svg` through `pad_7.svg` — single A5 pads
- `pads_sheet_a4.pdf` — 2-up A4 sheet (2 pads per page, 4 pages)
- `pads_sheet_a3.pdf` — 4-up A3 sheet for foot pads

### 4.2 Pad Design

Each pad contains:
- ArUco marker centred (65% of pad width)
- Bold colour ring border (20px stroke, in one of 4 high-contrast colours: orange, cyan, magenta, lime)
- Pad number in corner
- "DRUM PAD" label for orientation
- Optional: dashed cut guide

Colours are assigned in sequence across IDs so adjacent pad IDs get distinct colours — helps visual tracking and distinguishes foot pads.

### 4.3 Size Guidance (printed on each sheet)
- **Hand pads:** A5 minimum (148×210mm)
- **Foot pads:** A4 minimum (210×297mm), A3 recommended
- Print at 100% scale, no fit-to-page scaling

---

## Phase 5 — Workflow Integration

### Scan → Play Flow

```
App starts
    │
    ▼
Camera initialises
    │
    ▼
[SCAN PADS] pressed
    │
    ├─ ArUco scan runs for 3 seconds
    ├─ Detected pads registered with position + colour sample
    └─ Unassigned pads auto-assigned default samples in sequence
    │
    ▼
Performance mode
    ├─ Colour tracker runs every frame
    ├─ Strike events fire → audio engine triggered
    └─ Overlay shows live pad state
    │
    ▼
[RE-SCAN] resets registry (keeps sample assignments)
```

### Persistence
- `localStorage` stores: pad-to-sample assignments, sensitivity settings
- On next visit, assignments restored; user just needs to scan pads again

---

## Phase 6 — Accessibility Considerations

- All UI controls keyboard-navigable
- Camera permission error states handled gracefully with plain-English instructions
- Works on mobile (portrait or landscape) — camera view scales
- "Foot mode" prominently accessible (not buried in settings)
- Template print instructions embedded in UI (no external docs needed)
- Pad overlay labels large enough to read at arm's length on screen

---

## Build & Dev Commands

```bash
# Install
npm install

# Dev server (localhost:5173)
npm run dev

# Generate pad templates
pip install opencv-python cairosvg numpy
python templates/generate_pads.py

# Production build
npm run build
```

---

## Milestones

| # | Milestone | Deliverable |
|---|---|---|
| 1 | Camera + ArUco working | Detects and labels pads on screen |
| 2 | Colour tracker + strike events | Console logs on tap |
| 3 | Audio engine + default samples | Audible output on tap |
| 4 | Basic UI (pad list + sample assign) | Usable end-to-end |
| 5 | Pad template generator | Printable A5/A4/A3 PDFs |
| 6 | Settings + foot mode | Robust with feet/socks |
| 7 | Polish + mobile testing | Ready for user testing |

---

## Open Questions / Future Expansions

- **Velocity sensitivity:** Camera at 30fps may not capture fast strikes; investigate frame interpolation or audio transient shaping as proxy
- **Multi-camera support:** Two cameras (one floor-facing for foot pads, one front-facing for hand pads)
- **MIDI output:** Emit Web MIDI events so the kit can drive a DAW
- **Sequence recording:** Record pad strikes with timestamps, loop playback
- **Custom sample packs:** Drag-and-drop zip import
- **Integration with air piano/guitar:** Unified "accessible instruments" launcher app
