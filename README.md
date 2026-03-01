# Paper Orchestra

Camera-based musical instruments played on printed paper templates. No hardware needed — just a printer, a webcam, and your hands.

## What is this?

Paper Orchestra turns printed sheets of paper into playable instruments. Point your webcam at a printed template, and the app uses computer vision (ArUco markers + MediaPipe hand tracking) to detect what you're doing — tapping piano keys, covering whistle holes, pressing trumpet valves, or striking drum pads. Audio synthesis happens entirely in the browser.

The project started as Paper Piano (a 2-octave keyboard with chord and arpeggio modes) and is expanding into a unified suite of instruments that share a common detection and audio layer.

## Instruments

### Wave 1 (implemented)

- **Paper Piano** — 2-octave marker-based keyboard with chord voicing (8 types), arpeggiator (5 patterns x 5 rates), ribbon controller, sustain, 8 recording slots, and tap-tempo metronome. Uses ArUco DICT_4X4_1000 markers printed above each key for spatial detection, plus "ghost marker" control buttons (cover a marker with any object to activate a mode).

- **Paper Drum** — Colour-ring pad kit. Print ArUco markers with coloured borders, place them anywhere in camera view. The app scans pad positions, samples their colour signatures, then tracks colour presence per-frame. A strike is detected when a hand occludes a pad (colour disappears then strike event then sample trigger).

- **Paper Wind** — Whistle and trumpet modes, auto-detected from printed template topology (6 vertical blobs = whistle, 3 horizontal = trumpet). Whistle uses MediaPipe hand z-depth to detect finger coverage over holes. Trumpet uses fingertip-to-MCP depth for valve presses. Sound is gated by breath detection — a fusion of microphone spectral analysis (breath vs. voice via HNR autocorrelation), FaceMesh lip aperture tracking, and keyboard spacebar fallback.

### Wave 2 (stubs — coming later)

Paper Guitar, Paper Drum Machine, Paper Sequencer, Paper String

## Tech stack

- **React 18** + **Vite** — single-page app, no server backend
- **Tone.js** — synthesis, sampling (MusyngKite GM soundfonts), effects
- **Raw Web Audio** — mic/breath analysis, wind instrument oscillator stacks
- **MediaPipe Hands** — 21-landmark hand tracking (CDN)
- **MediaPipe FaceMesh** — lip aperture for breath gating (CDN)
- **js-aruco2** — ArUco marker detection, multiple dictionaries (CDN)
- **Tailwind CSS v4** + **Radix UI** — component styling
- **React Router v6** — launcher + per-instrument routes

Everything runs client-side. Camera, hand tracking, marker detection, and audio all happen in the browser.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Print a template from `templates/` at 100% scale (A4 landscape, no fit-to-page). Point your camera at it. Click Scan. Play.

## Project structure

```
src/
├── shared/
│   ├── detection/    # camera, ArUco, MediaPipe, scan, ghost markers, colour blobs
│   ├── audio/        # Tone.js manager, synth, sampler, effects, recorder, mic analyser
│   ├── engine/       # velocity tracker, chords, arp, key detection, ribbon, gestures
│   ├── components/   # instrument shell, camera overlay, knobs, meters, piano roll
│   └── hooks/        # useCamera, useHandTracking, useScan, useAudio, useTransport
├── instruments/
│   ├── piano/        # PaperPiano + config + engine
│   ├── drum/         # PaperDrum + config + engine
│   ├── wind/         # PaperWind + config + engine
│   └── .../          # Wave 2 stubs
├── pages/            # Launcher + InstrumentPage (lazy routing)
└── App.jsx           # React Router
```

## PepperHorn x Creative Ranges Foundation
