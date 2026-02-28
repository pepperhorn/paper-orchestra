# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Paper Piano (formerly Air Piano v3) is a browser-based musical instrument that uses MediaPipe hand tracking and ArUco marker detection on a printed physical template. The 2-octave keyboard uses DICT_4X4_1000 ArUco markers. Users place objects on printed ArUco markers to change modes (chords, arpeggios, octave, sustain) and play notes by tapping fingers over printed piano keys. No server backend — everything runs client-side.

## Commands

- `npm run dev` — Start Vite dev server on port 5173 (required for camera access via localhost secure context)
- `npm run build` — Production build
- `npm run preview` — Preview production build

No test framework is configured. Testing is done live in-browser with camera + printed template.

## Architecture

~800 lines of source across 3 files. Single-page React 18 app built with Vite.

### Source Files

- **`src/AirPiano.jsx`** (~630 lines) — Monolithic main component containing:
  - `AudioEngine` class: Web Audio API synth with oscillators, ADSR envelopes, reverb (procedural convolver impulse), and dynamics compression
  - `VelocityTracker` class: Circular buffer (6 samples) tracking finger Y-velocity for note dynamics
  - Marker-based key detection: `getKey()` compares finger pixel position to scanned ArUco marker positions (nearest-marker with upper-zone black key priority)
  - Ribbon detection: `getRibbon()` interpolates finger Y between ribbon marker positions
  - All React state, refs, the real-time detection loop, scan flow, ArUco tag processing, and UI rendering
- **`src/engines.js`** (~147 lines) — `CHORD_TYPES` (8 types: maj/min/maj7/dom7/hdim/dim/aug/pwr), `buildChordNotes()` voicing builder, and `ArpEngine` class (clock-compensated arpeggio sequencer with 5 patterns × 5 rates, 80ms lookahead)
- **`src/main.jsx`** — React entry point, renders `<AirPiano />`
- **`piano_template_v3.html`** — Printable A4 landscape template with ArUco markers (self-contained HTML with inline JS marker generation)

### External Libraries (CDN-loaded, not in package.json)

- **@mediapipe/hands** — 21-landmark hand tracking, up to 2 hands, lite model
- **@mediapipe/camera_utils** — Video stream management
- **js-aruco2 v1.0.4** — ArUco marker detection (DICT_4X4_1000, loaded via separate dictionary file). "Ghost marker" pattern: covered tag = activated mode

### ArUco Tag ID Map (v3.1 — 2-octave marker-based detection)

| Range | Count | Purpose | Detection Method |
|-------|-------|---------|-----------------|
| 0-6   | 7  | White key positions octave 1 (C D E F G A B) | Position reference |
| 8-12  | 5  | Black key positions octave 1 (C# D# F# G# A#) | Position reference |
| 13-22 | 10 | Ribbon strip segments (bottom=13 to top=22) | Position reference |
| 23-30 | 8  | Chord types | Ghost (cover to activate) |
| 31-35 | 5  | Arp patterns | Ghost (cover to activate) |
| 36-40 | 5  | Arp rates | Ghost (cover to activate) |
| 41-42 | 2  | Octave ± | Ghost (cover to activate) |
| 43    | 1  | Sustain | Ghost (cover to activate) |
| 44-45 | 2  | MOD / VOL mode | Ghost (cover to activate) |
| 46-52 | 7  | White key positions octave 2 (C D E F G A B) | Position reference |
| 53-57 | 5  | Black key positions octave 2 (C# D# F# G# A#) | Position reference |
| 58    | 1  | Top C (highest white key) | Position reference |

Total: 59 markers used out of 1000 (DICT_4X4_1000).

**Two marker categories:**
1. **Position markers** (0-6, 8-22, 46-58): Must stay visible during play. Define spatial layout. Excluded from ghost-marker logic via `POSITION_TAGS` set. (ID 7 unused.)
2. **Control markers** (23-45): Ghost-marker detection. Placed ABOVE keyboard on template so user's hands don't obstruct camera view. Cover with object to activate.

### Data Flow

1. App loads CDN libs → requests camera → inits MediaPipe + ArUco detector
2. Scan: user clicks Scan button → 2-second window learns all marker positions → saved to localStorage key `airpiano_v3_markers`
3. Per-frame loop: ArUco detection (which control markers are covered → mode changes) → per-hand/per-fingertip tracking → pixel-space key detection via nearest marker → velocity-based note triggering with optional chord voicing and arp scheduling → piano roll update

### Key Detection Algorithm

- Key markers (0-12) are printed ABOVE the piano keys on the template
- When a finger plays a key, it's BELOW the marker in camera view
- Key zone extends from marker row Y downward by `avgKeyWidth * 2.5` (proportional to piano key aspect ratio)
- Black keys only checked in upper 60% of key zone (matching real piano proportions)
- White keys: nearest horizontally within `avgKeyWidth * 0.6` threshold
- Black keys: nearest horizontally within `avgKeyWidth * 0.4` threshold (narrower)

### State

All state lives in the `AirPiano` component via `useState`/`useReducer`. Non-reactive state (AudioEngine, VelocityTracker, ArpEngine, ArUco detector, scanned markers, pressed keys) stored in refs.

## Key Constraints

- Port 5173 is hardcoded in vite.config.js — required for localhost camera access
- Camera preference order: environment → user → any (for mobile compatibility)
- MediaPipe hands config: model complexity 0, detection confidence 0.72, tracking confidence 0.55
- Octave shift has 1.5s debounce to prevent rapid triggering from object placement
- Arp scheduler uses ~20ms poll interval with 80ms Web Audio lookahead for timing accuracy
- Audio context requires user gesture — `ensureAudio()` called on first click via main div onClick
- Scan requires at least 8 markers detected to transition to 'ready' state
