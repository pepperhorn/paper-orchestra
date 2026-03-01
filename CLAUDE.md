# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Paper Orchestra is a collection of browser-based musical instruments that use camera-based detection (MediaPipe hand tracking, ArUco markers, colour blob detection) on printed physical templates. Each instrument has its own printed template and detection logic. No server backend — everything runs client-side.

**Wave 1 instruments** (implemented): Paper Piano, Paper Drum, Paper Wind
**Wave 2 instruments** (stub): Paper Guitar, Paper Drum Machine, Paper Sequencer, Paper String

## Commands

- `pnpm dev` — Start Vite dev server on port 5173 (required for camera access via localhost secure context)
- `pnpm build` — Production build
- `pnpm preview` — Preview production build

No test framework is configured. Testing is done live in-browser with camera + printed template.

## Architecture

Modular React 18 app with React Router, built with Vite + Tailwind CSS v4. Audio via Tone.js (synth/sampler/effects) and raw Web Audio (mic/breath analysis).

### Source Structure

```
src/
├── shared/
│   ├── detection/     # camera, aruco, hands, face-mesh, scan, ghost, colour-blob, homography(stub)
│   ├── audio/         # manager (Tone.js singleton), synth, sampler, effects, transport, recorder, mic-analyser
│   ├── engine/        # velocity, chords, arp, key-detect, ribbon, gestures(stub)
│   ├── components/ui/ # instrument-shell, camera-overlay, scan-button, knob, meter-bar, piano-roll, transport-controls, settings-panel, status-indicator, pattern-slots(stub)
│   ├── hooks/         # use-camera, use-hand-tracking, use-scan, use-audio, use-transport
│   └── lib/           # utils.js (cn() helper)
├── instruments/
│   ├── piano/         # PaperPiano.jsx + piano-config.js + piano-engine.js
│   ├── drum/          # PaperDrum.jsx + drum-config.js + drum-engine.js
│   ├── wind/          # PaperWind.jsx + wind-config.js + wind-engine.js
│   ├── guitar/        # Wave 2 stub
│   ├── drum-machine/  # Wave 2 stub
│   ├── sequencer/     # Wave 2 stub
│   └── string/        # Wave 2 stub
├── pages/             # Launcher.jsx, InstrumentPage.jsx (lazy-loads instruments)
├── App.jsx            # React Router: / → Launcher, /instrument/:id → InstrumentPage
├── main.jsx           # Entry point with BrowserRouter
└── index.css          # Tailwind v4 + theme tokens
```

### Path Aliases

- `@shared` → `src/shared`
- `@instruments` → `src/instruments`

### External Libraries (CDN-loaded at runtime)

- **@mediapipe/hands** — 21-landmark hand tracking, up to 2 hands
- **@mediapipe/camera_utils** — Video stream management
- **@mediapipe/face_mesh** — Lip/face detection (wind instrument)
- **js-aruco2 v1.0.4** — ArUco marker detection (multiple dictionaries)

### Key Patterns

- **Audio**: `audioManager.ensure()` starts Tone.js context. `createSynthEngine()` wraps Tone.PolySynth with ID-based `noteOn(id, freq, vel, time)`/`noteOff(id, time)`. Wind instrument uses raw Web Audio oscillators via `audioManager.getContext()`.
- **Detection**: `loadArucoLibrary(dict)` + `createDetector(dict)` + `detectMarkers(detector, canvas)`. Camera init via `initCamera(videoEl)` with environment→user→any fallback.
- **Ghost markers**: `detectCoveredMarkers(knownMarkers, visibleSet, positionTagSet)` — known marker not visible = object covering it = activated.
- **Scan flow**: 2-second scan window → markers saved to localStorage → restored on reload.

### Piano ArUco Tag Map (DICT_4X4_1000)

| Range | Purpose | Detection |
|-------|---------|-----------|
| 0-6, 46-52, 58 | White key positions (2 octaves + top C) | Position reference |
| 8-12, 53-57 | Black key positions | Position reference |
| 13-22 | Ribbon strip segments | Position reference |
| 23-30 | Chord types (8) | Ghost (cover to activate) |
| 31-35 | Arp patterns (5) | Ghost |
| 36-40 | Arp rates (5) | Ghost |
| 41-42 | Octave ± | Ghost |
| 43 | Sustain | Ghost |
| 44-45 | MOD / VOL mode | Ghost |

### Drum Detection (DICT_6X6_250)

ArUco markers identify pad positions, then colour signature sampling + tracking detects strikes via occlusion state machine (PRESENT → OCCLUDED → COOLDOWN → PRESENT).

### Wind Detection

Blob topology detection (6 vertical blobs = whistle, 3 horizontal = trumpet). MediaPipe Hands Z-depth for whistle hole coverage. FaceMesh for lip aperture. Mic analyser for breath/voice. BreathFusion OR-gates all sources.

## Key Constraints

- Port 5173 hardcoded in vite.config.js
- Camera preference: environment → user → any
- MediaPipe hands: complexity 0, detection 0.72, tracking 0.55 (piano); complexity 1, detection 0.65, tracking 0.6 (wind)
- Piano octave shift: 1.5s debounce
- Arp scheduler: ~20ms poll, 80ms lookahead
- Audio context requires user gesture
- Piano scan: minimum 8 markers; drum scan: minimum 2 pads

## Legacy Files

`src/AirPiano.jsx` and `src/engines.js` are the original monolithic source. They remain in the repo for reference but are not imported by the new code.
