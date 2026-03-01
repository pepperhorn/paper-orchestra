# Air/Paper Drum Machine — Claude Code Build Plan

## Project Overview

A browser-based, camera-controlled 16-step drum sequencer. No install. No backend.
The user prints an A3 template, places physical tokens on a grid, and the front-facing
camera reads token positions, velocities, and gesture zones to drive a full drum machine
with effects, modulation, and pattern chaining.

This document is the complete specification for Claude Code to build the application
from scratch. Follow phases in order. Each phase is independently testable.

---

## Stack

- **Vanilla JS + HTML5** — single file deliverable, no framework required
- **Web Audio API** — all synthesis and effects
- **Canvas 2D API** — camera feed processing and overlay rendering
- **OpenCV.js** (CDN) — ArUco marker detection and perspective correction
- **No build step** — must run by opening index.html in a browser
- **No backend** — all state in memory, all processing client-side

### File Structure

```
/
├── index.html          ← single entry point, loads everything
├── src/
│   ├── vision/
│   │   ├── calibration.js     ← ArUco detection, homography
│   │   ├── grid.js            ← cell extraction, velocity classification
│   │   ├── zones.js           ← control zone occlusion detection
│   │   ├── strip.js           ← modulation strip continuous tracking
│   │   └── chain.js           ← string/line connectivity detection
│   ├── audio/
│   │   ├── engine.js          ← Web Audio context, master chain
│   │   ├── kit.js             ← synth drum voices, sample loading
│   │   ├── sequencer.js       ← clock, step scheduling, chain logic
│   │   └── fx.js              ← 6 effect nodes
│   ├── state/
│   │   ├── store.js           ← single source of truth
│   │   ├── snapshots.js       ← 8-slot pattern memory
│   │   └── transport.js       ← play/rec/jam/chain button states
│   ├── ui/
│   │   ├── overlay.js         ← canvas overlay drawn over camera feed
│   │   └── debug.js           ← dev mode cell visualiser
│   └── template/
│       └── generator.js       ← SVG/PDF template output
├── assets/
│   └── aruco/                 ← ArUco marker PNGs for printing
└── TEMPLATE.svg               ← printable template
```

---

## Phase 1 — Camera Calibration & Template Registration

### Goal
Detect the four ArUco corner markers on the printed template and compute a homography
matrix that maps the camera image to a normalised template coordinate space.

### ArUco Markers
Use ArUco dictionary `DICT_4X4_50`. Place markers at the four corners of the template:
- Top-left: ID 0
- Top-right: ID 1
- Bottom-right: ID 2
- Bottom-left: ID 3

Load OpenCV.js from CDN:
```html
<script src="https://docs.opencv.org/4.8.0/opencv.js"></script>
```

### calibration.js

```javascript
// Exports:
// - startCalibration(videoElement) → Promise<HomographyMatrix>
// - applyHomography(point, matrix) → {x, y}
// - isCalibrated() → boolean

// Process:
// 1. Capture frame from videoElement into offscreen canvas
// 2. Convert to greyscale cv.Mat
// 3. Run cv.aruco.detectMarkers()
// 4. Identify markers by ID, extract corner points
// 5. Define destination points (template coordinate space, normalised 0–1)
// 6. cv.getPerspectiveTransform() → homography matrix
// 7. Store matrix, set isCalibrated = true
// 8. Re-run every 2 seconds to handle camera drift
```

### Calibration UX
On load, show a fullscreen camera view with an overlay message:
`"Point camera at the printed template. Hold steady."`
Once all 4 markers detected for 30 consecutive frames, flash green and proceed.
Show a subtle outline of the detected template boundary on the overlay.

### Testing Phase 1
- `debug.js` draws the detected marker corners as coloured dots
- Log homography matrix to console
- Draw a projected template outline on the overlay to confirm alignment

---

## Phase 2 — Grid Cell Detection & Velocity Classification

### Goal
Extract the 8×16 drum grid cells from the corrected frame and classify each cell
as empty or one of 6 velocity levels based on fill ratio.

### grid.js

```javascript
// Exports:
// - extractGrid(frame, homographyMatrix) → GridState (8×16 array)
// - GridCell { row, col, velocity: null | 'pp'|'p'|'mp'|'mf'|'f'|'ff' }

// Cell coordinates in normalised template space (0–1):
// Defined as constants — the grid occupies a known region of the template
// Each cell bounding box is pre-computed from template layout constants

// Per-cell process:
// 1. Apply homography to cell bounding box corners → image pixel coords
// 2. Extract cell region from camera frame
// 3. Compute fill ratio: (dark pixels) / (total pixels) after adaptive threshold
// 4. Map fill ratio to velocity tier:
//    0.00–0.05 → null (empty)
//    0.06–0.20 → 'pp'
//    0.21–0.38 → 'p'
//    0.39–0.55 → 'mp'
//    0.56–0.72 → 'mf'
//    0.73–0.88 → 'f'
//    0.89–1.00 → 'ff'
// 5. Apply 80ms dwell debounce before emitting state change

// Adaptive thresholding:
// Threshold is calibrated per-session using the printed velocity legend zone
// (a reference strip printed on the template showing all 6 fill ratios)
// Session calibration: user places the legend in frame, system auto-fits thresholds
```

### Velocity Legend Reference Zone
Print a 6-cell reference strip on the template outside the playfield. During calibration,
the system reads these 6 reference cells and fits the threshold curve to actual lighting.
This is how the instrument works in candlelight or bright studio light equally.

### State Diffing
Only emit events for cells that have changed since the last frame.
`GridState` is an 8×16 array. On each frame, diff against previous state.
Emit `{ type: 'cell_change', row, col, velocity }` events to the sequencer.

### Testing Phase 2
- `debug.js` draws a coloured overlay on each cell:
  empty = transparent, pp = pale blue → ff = bright red
- Shows fill ratio value as text inside each cell
- Shows the raw adaptive threshold value

---

## Phase 3 — Synth Drum Engine & Default Kit

### Goal
A fully functional drum engine using Web Audio API. Zero external samples required.
Each of the 8 rows has a synthesised voice. Sample loading added later (Phase 9).

### engine.js

```javascript
// Web Audio context setup
// Master gain → Compressor → Destination
// FX chain (Phase 6) inserts between master gain and compressor
// exports: audioContext, masterGain, scheduleNote(row, velocity, time)
```

### kit.js — Default Synthesised Voices

Each voice is a pure Web Audio graph. Parameters are tuned for musical results.

```
Row 0: KICK
  — Oscillator (sine, 60Hz → 30Hz exponential decay over 0.4s)
  — Gain envelope (1.0 → 0 over 0.5s)

Row 1: SNARE
  — Oscillator (triangle, 200Hz, 0.1s decay) + noise buffer (0.2s decay)
  — High-pass filter on noise at 1000Hz

Row 2: CLOSED HI-HAT
  — Noise buffer + bandpass filter (8000Hz, Q=2) + very short decay (0.05s)

Row 3: OPEN HI-HAT
  — Same as CH but decay 0.4s, no immediate gate

Row 4: LOW TOM
  — Oscillator (sine, 100Hz → 55Hz, 0.3s decay)

Row 5: HIGH TOM
  — Oscillator (sine, 180Hz → 90Hz, 0.25s decay)

Row 6: SAMPLE 1
  — Silence until audio file loaded (Phase 9)

Row 7: SAMPLE 2
  — Silence until audio file loaded (Phase 9)
```

### Velocity Mapping

```javascript
// velocity string → gain + pitch nudge
const VELOCITY_MAP = {
  pp:  { gain: 0.14, detune: -8  },
  p:   { gain: 0.30, detune: -4  },
  mp:  { gain: 0.50, detune: 0   },
  mf:  { gain: 0.67, detune: +2  },
  f:   { gain: 0.82, detune: +4  },
  ff:  { gain: 1.00, detune: +7  },
}
```

Higher velocity = fractionally higher pitch. Subtle but adds realism.

### Testing Phase 3
- Keyboard fallback: keys Q–I trigger row 0–7 at `mf` for testing before vision is integrated
- Click on debug cell overlay triggers the corresponding voice

---

## Phase 4 — Sequencer Clock & Transport

### goal
16-step sequencer running on a Web Audio clock. Transport state machine.
No camera integration yet — test with keyboard/click input.

### sequencer.js

```javascript
// Web Audio clock (not setTimeout — jitter-free)
// Uses lookahead scheduling pattern:
//   - setInterval every 25ms checks if next note needs scheduling
//   - Schedules notes 100ms ahead of current audioContext.currentTime
//   - This is the standard Web Audio drum machine pattern

// exports:
// play(), stop(), setBPM(bpm), getCurrentStep() → 0–15
// onStep(callback) — fires on each step for overlay updates

// Step scheduling:
// For each step 0–15:
//   For each row 0–7:
//     If grid[row][step].velocity !== null:
//       scheduleNote(row, velocity, stepTime)
```

### transport.js — Button State Machine

```javascript
// State:
// { play: bool, rec: bool, jam: bool, chain: bool }

// Rules:
// CHAIN ON  → jam is suspended (not cleared, just suspended)
// CHAIN OFF → jam restores to its pre-chain value
// JAM ON    → rec writes to working copy, not active snapshot
// REC ON    → arms recording, captures grid changes during playback
// PLAY OFF  → stop sequencer, preserve position (restart from step 0 on next play)
```

### TAP TEMPO

```javascript
// tapTempo():
//   Push current timestamp to taps array (max 8 taps kept)
//   If taps.length >= 2, compute average interval between last 4 taps
//   Convert to BPM, call setBPM()
//   Debounce: if > 2s since last tap, reset taps array
```

### Testing Phase 4
- Hard-code a simple pattern (kick on 1, 5, 9, 13; snare on 5, 13) to verify clock
- Tap tempo via keyboard T key
- Log step number to console each step

---

## Phase 5 — Control Zone Detection & Snapshot System

### Goal
Detect occlusion of all non-grid zones: transport buttons, snapshot slots,
mute/solo column, FX row, strip mode buttons.

### zones.js

```javascript
// Zone registry: array of named zones, each with normalised template coordinates
// {
//   id: 'play' | 'rec' | 'jam' | 'chain' | 'tap' |
//       'snap_1'...'snap_8' |
//       'mute_0'...'mute_7' | 'solo_0'...'solo_7' |
//       'fx_1'...'fx_6' |
//       'mode_mod' | 'mode_pitch' | 'mode_bpm' | 'mode_scratch',
//   bounds: { x, y, w, h },   ← normalised 0–1 template coords
//   type: 'toggle' | 'momentary' | 'hold',
//   dwellMs: number,           ← 0 for immediate, 1500 for hold-to-write
// }

// Per frame:
// For each zone:
//   Extract region from corrected frame
//   Compute mean pixel brightness
//   If brightness < occlusion_threshold → zone is covered
//   Apply dwell logic:
//     'momentary' zones: fire on cover, fire again on uncover
//     'toggle' zones: flip state on cover (with debounce)
//     'hold' zones: fire after dwellMs continuous coverage

// Emits: { type: 'zone_event', id, event: 'cover'|'uncover'|'hold' }
```

### snapshots.js

```javascript
// 8 snapshot slots, each storing a full GridState (8×16 velocity grid)
// Plus: per-row mute state, per-row solo state

// Operations:
// recall(slotIndex) → loads snapshot into working grid
// write(slotIndex, gridState) → saves to slot, flashes overlay
// isEmpty(slotIndex) → bool

// Zone event handlers:
// snap_N cover (< 1500ms) → recall(N)
// snap_N hold (>= 1500ms) → write(N, currentGrid)
// snap_N cover while JAM+REC → commit jammed state to slot N as new snapshot
```

### Mute / Solo Logic

```javascript
// Per row:
// mute_N toggled → row N excluded from sequencer output
// solo_N toggled → all other rows muted, only soloed rows play
// Multiple solos additive: solo_2 + solo_5 → only rows 2 and 5 play
// mute_N + solo_N simultaneously → isolate: mute all OTHERS
```

### Testing Phase 5
- Debug overlay draws coloured borders on all zones
- Green = uncovered, amber = covered, red = held
- Log all zone events to console
- Test snapshot recall/write with click on debug overlay

---

## Phase 6 — FX Row & Effects Chain

### Goal
6 hold-to-activate effects on the master output. Each is a Web Audio subgraph.
Active while FX zone is covered. Smooth wet/dry crossfade on cover/uncover.

### fx.js

```javascript
// Master insert chain:
// masterGain → [FX1..FX6 in parallel, each with dry/wet crossfade] → compressor

// Each FX:
// {
//   id: 'reverb'|'delay'|'bitcrush'|'filter'|'overdrive'|'pitch',
//   input: GainNode,
//   output: GainNode,
//   wetGain: GainNode,    ← ramped 0→1 on activate
//   dryGain: GainNode,    ← ramped 1→0 on activate
//   activate(rampMs),     ← default 80ms ramp
//   deactivate(rampMs),
//   setDepth(0–1),        ← controlled by MOD strip
// }

// FX1: Dub Reverb
//   ConvolverNode with generated impulse (exponential decay, 3s, stereo)
//   Pre-delay via DelayNode (60ms)
//   Output gain sidechain duck on beat 1 (GainNode ramped down on beat 1 trigger)

// FX2: Tape Delay
//   DelayNode (dotted-eighth: 60/(bpm) * 0.75 * 1000 ms)
//   Feedback loop with LowpassFilter (cutoff 3000Hz) + GainNode (feedback = 0.55)
//   BPM-synced: delay time updated on each BPM change

// FX3: Bit Crush
//   ScriptProcessorNode (or AudioWorklet if available):
//   Quantise sample to Math.round(sample * 64) / 64  (6-bit)
//   Downsample by factor 4 (hold each sample 4 times)

// FX4: Resonant Filter
//   BiquadFilterNode (lowpass, initial cutoff 200Hz, Q=8)
//   On activate: start AudioParam ramp cutoff 200Hz → 8000Hz over hold duration
//   Rate of sweep proportional to how long zone is held

// FX5: Overdrive
//   WaveShaperNode with soft-clip curve:
//   curve[i] = (3/2) * x * (1 - x*x/3) for x in [-1, 1]
//   Post-gain boost +6dB
//   BiquadFilter (highshelf, 3000Hz, +4dB) for presence

// FX6: Pitch Drop
//   ScriptProcessorNode granular pitch shift
//   Default: -1 semitone while held (tape-stop feel)
//   Depth set by MOD strip position (full left = -12 semitones, full right = +12)

// Combo gestures — detected in zones.js event handler:
// FX1 + FX2 active → route FX1 output into FX2 input (series chain)
// FX3 + FX5 active → same: FX3 feeds FX5
// FX4 + FX6 active → same: FX4 feeds FX6
```

### Testing Phase 6
- Keyboard 1–6 to toggle FX zones during testing
- Overlay shows FX zone glow when active

---

## Phase 7 — Modulation Strip

### Goal
Continuous position tracking of a token or hand edge along the horizontal strip.
Four assignable modes with consistent latch/release grammar.

### strip.js

```javascript
// Strip zone: normalised template region, full width, one row tall
// Position reading: 0.0 (left) → 1.0 (right)

// Per frame:
// 1. Extract strip region from corrected frame
// 2. Apply adaptive threshold
// 3. Find centroid of largest dark blob → position
//    If no blob: check for leading edge of large occluding mass (hand sweep)
//    Edge = leftmost column where pixel density exceeds threshold
// 4. Emit { type: 'strip_move', position: 0–1, velocity: delta/frame }

// Mode management:
// activeMode: 'mod' | 'pitch' | 'bpm' | 'scratch' | null
// Only one mode active at a time (last covered mode button wins)

// State per mode:
// {
//   baseValue: number,       ← value when finger landed
//   fingerDown: bool,
//   modeTokenDown: bool,
// }

// On finger land (position appears):
//   fingerDown = true
//   baseValue = current parameter value (not strip position)

// On finger lift (position disappears):
//   if modeTokenDown: revert to baseValue (snap back)
//   fingerDown = false

// On mode token lift (modeTokenDown → false) while fingerDown:
//   commit current parameter value as new base/tap tempo
//   baseValue = current value
//   modeTokenDown = false
//   finger still controls until lifted

// MOD mode:
//   position 0.5 = no change from baseValue
//   Linear map: position → ±100% of parameter range
//   Target: active FX wet/dry depth, or general CC value

// PITCH mode:
//   position 0.0 = -12 semitones, 0.5 = 0, 1.0 = +12 semitones
//   Applies to master pitch shift node (ScriptProcessor or AudioWorklet)
//   On commit: new pitch becomes session root

// BPM mode — turntable model:
//   position 0.5 = current tap tempo (no change)
//   position 0.0 = tapTempo * 0.70   (−30%)
//   position 1.0 = tapTempo * 1.30   (+30%)
//   Smooth ramp: AudioParam linearRampToValueAtTime over 50ms
//   On finger lift (mode token still down): snap back to tapTempo
//   On mode token lift (finger still down): commit → new tapTempo = current BPM

// SCRATCH mode:
//   Read strip velocity (position delta per frame) instead of position
//   Map velocity → playback scrub rate:
//     positive delta (right) = forward scrub
//     negative delta (left) = backward scrub / stutter
//   On finger lift: snap back to normal forward playback
//   No latch for scratch — always transient
```

### Testing Phase 7
- Debug overlay: strip region highlighted, current position shown as a vertical line
- Mode buttons shown as coloured tabs above strip
- Console logs position and active mode on each frame

---

## Phase 8 — Chain System

### Goal
Two-slot 32-step pattern chaining. String/line connectivity detection between slot zones.
CHAIN button integrates with transport state machine.

### chain.js

```javascript
// Chain detection:
// On CHAIN button cover event:
//   Scan the snapshot slot row for a continuous dark pixel path
//   connecting any two slot bounding boxes
//   Algorithm: dilate slot bounding boxes slightly, run connected component analysis
//   If two slots share a connected component: chain = [selectedSlot, connectedSlot]
//   If no connection found: chain = null, CHAIN stays amber (waiting)
//   If connection appears later while CHAIN armed: lock in that pair

// Chain playback (in sequencer.js):
// if chain active:
//   step 0–15 → play from chain[0] grid
//   step 16–31 → play from chain[1] grid
//   overlay shows 32-step playhead

// REC in chain mode:
//   steps 0–15 → write changes to chain[0]
//   steps 16–31 → write changes to chain[1]
//   REC indicator follows playhead slot

// String removal mid-performance:
//   chain.js polls for connection every 4 frames while CHAIN is active
//   If connection lost: finish current 32-step cycle, then fall back to loop chain[0]
//   Do not interrupt mid-bar

// CHAIN + JAM interaction:
//   On CHAIN cover: store current jam state, set jam = suspended
//   On CHAIN uncover: restore jam state
```

### Overlay for Chain
- Amber arc connecting the two chained slot zones
- 32-step progress bar spanning both slots
- Step counter shows "1/32" through "32/32"

### Testing Phase 8
- Simulate chain connection by keyboard shortcut (no camera needed for logic test)
- Log chain state changes to console
- Test REC split: verify different data written to each slot

---

## Phase 9 — Sample Loading & Per-Row Assignment

### Goal
Rows S1 and S2 (and optionally all rows) can load user audio files.
Drag-and-drop or file picker. Sample replaces synth voice for that row.

```javascript
// In kit.js:
// loadSample(row, audioBuffer):
//   Store AudioBuffer in row slot
//   On scheduleNote: use AudioBufferSourceNode instead of synth graph
//   Velocity applies gain + detune as per VELOCITY_MAP

// UI: drag audio file onto the row label zone (detected in overlay)
//   Or: file input shown in sidebar (fallback)

// Supported formats: WAV, MP3, OGG (Web Audio decodeAudioData)
// Sample is normalised on load: peak normalise to -1dBFS
```

---

## Phase 10 — Template Generator

### Goal
Generate the printable A3 template as SVG. The template is the physical instrument.
It must be precise, printable, and visually clear at arm's length.

### generator.js → TEMPLATE.svg

```
Template regions (all coordinates normalised, scaled to A3 at 150dpi):

1. Four ArUco corner markers (40mm × 40mm, 10mm from corners)
2. Snapshot slot row (8 slots, evenly spaced, with node dots between each pair)
3. Transport row (TAP, PLAY, REC, JAM, CHAIN — bold labelled rectangles)
4. Drum grid (8 rows × 16 columns, grouped 4+4+4+4 with heavier bar lines)
   - Row labels with icon (left side)
   - Mute [M] and Solo [S] cells to left of each label
5. Modulation strip (full width, labelled with ◁ and ▷ arrows)
   - Mode buttons above left end: [MOD] [PITCH] [BPM] [SCRATCH]
6. FX row (6 equal zones, labelled with effect name and icon)
7. Velocity legend (reference strip, 6 cells showing pp through ff fill patterns)
8. Registration marks and print guides
9. Instrument name and brief usage note in footer
```

Deliver as both `TEMPLATE.svg` and `TEMPLATE.pdf`.

---

## Phase 11 — Mobile Optimisation & Robustness

- Front-facing camera: request `{ video: { facingMode: 'user', width: 1280, height: 720 } }`
- Process every other frame on low-end devices (detect via frame timing)
- Orientation lock: landscape preferred, warn if portrait
- Low-light mode: boost contrast in pre-processing when mean frame brightness < 80
- Jitter smoothing: exponential moving average on strip position (α = 0.3)
- Re-calibration button always visible — tap to re-run ArUco detection
- Touch fallback: tap on debug overlay cells to toggle tokens (no camera required)

---

## Phase 12 — Overlay UI

The camera feed fills the screen. The overlay is a canvas drawn on top at full resolution.
Nothing else. No HTML UI controls — all feedback is drawn on the canvas.

### overlay.js — Draw list per frame

```
1. Camera feed (drawImage)
2. Template outline (thin white border at detected homography boundary)
3. Grid cells: coloured fill per velocity (transparent → bright per level)
4. Playhead: bright column highlight on current step
5. Active snapshot slot: glowing border, slot number large
6. Chained slots: amber arc between them, 32-step progress bar
7. Transport buttons: PLAY=green, REC=red, JAM=blue, CHAIN=amber when active
8. Mute/solo indicators: M=red fill, S=yellow fill when active
9. Strip: mode buttons highlighted, position indicator line, current value readout
10. FX zones: glow when active, dim when inactive
11. BPM readout: large number, top right corner
12. Combo FX indicator: shows which effects are chained
13. Debug layer (toggled via long-press on corner): cell boundaries, fill ratios, zone IDs
```

---

## State Architecture

### store.js — Single Source of Truth

```javascript
const state = {
  // Vision
  calibrated: false,
  homography: null,

  // Grid (working copy, live)
  grid: Array(8).fill(null).map(() => Array(16).fill(null)),
  // null = empty, 'pp'|'p'|'mp'|'mf'|'f'|'ff' = velocity

  // Snapshots
  snapshots: Array(8).fill(null),  // each is a grid copy or null
  activeSlot: 0,

  // Mute / Solo
  mute: Array(8).fill(false),
  solo: Array(8).fill(false),

  // Transport
  playing: false,
  recording: false,
  jam: false,
  chain: false,
  jamSuspended: false,
  jamPreChainState: false,

  // Chain
  chainSlots: null,   // [slotA, slotB] or null
  chainConnected: false,

  // Clock
  bpm: 120,
  tapTempo: 120,
  currentStep: 0,

  // Strip
  stripMode: null,   // 'mod'|'pitch'|'bpm'|'scratch'|null
  stripPosition: 0.5,
  pitchRoot: 0,      // semitones from original, committed value
  stripFingerDown: false,
  stripModeTokenDown: false,

  // FX
  fx: Array(6).fill({ active: false, depth: 1.0 }),
}
```

All modules import `store` and dispatch events to it.
Store emits change events that the sequencer, audio engine, and overlay subscribe to.
No direct cross-module calls — everything goes through the store.

---

## Event Types

```javascript
// Vision → Store
GRID_CELL_CHANGE    { row, col, velocity }
ZONE_COVER          { id }
ZONE_UNCOVER        { id }
ZONE_HOLD           { id }
STRIP_MOVE          { position, velocity }
CHAIN_CONNECT       { slotA, slotB }
CHAIN_DISCONNECT    {}

// Store → Audio
PLAY_START          {}
PLAY_STOP           {}
BPM_CHANGE          { bpm }
PITCH_CHANGE        { semitones }
FX_ACTIVATE         { index }
FX_DEACTIVATE       { index }
FX_DEPTH            { index, depth }
NOTE_SCHEDULE       { row, velocity, time }

// Store → Overlay
STATE_CHANGE        { ...fullState }   ← overlay always re-renders from full state
```

---

## Testing Strategy

Each phase ships with a self-test mode activated by adding `?test=N` to the URL.

| `?test=` | Mode |
|----------|------|
| `1` | Camera feed + ArUco detection only, no audio |
| `2` | Grid cell overlay with fill ratios, no audio |
| `3` | Audio engine only, keyboard input (Q–I rows, 1–8 steps) |
| `4` | Full sequencer, no camera (hard-coded test pattern) |
| `5` | Zone detection overlay, all zones visualised |
| `6` | FX chain, keyboard 1–6 to toggle, strips to slider |
| `7` | Strip tracking only, position visualiser |
| `8` | Chain logic, simulated slot connections |
| `debug` | All overlays visible simultaneously |

---

## Known Technical Constraints

1. **ScriptProcessorNode deprecation** — use AudioWorklet where available, fall back to
   ScriptProcessorNode for bit crush and pitch shift. Feature-detect at startup.

2. **OpenCV.js size** — 8MB. Load asynchronously, show loading indicator.
   Consider a lighter ArUco-only implementation as fallback.

3. **Camera permissions** — request on first user interaction (button tap), not on load.
   Handle denial gracefully: show touch-input fallback mode.

4. **iOS Safari** — Web Audio context must be resumed in a user gesture handler.
   AudioContext.resume() on first tap. Test on Safari specifically.

5. **Perspective correction performance** — don't run full homography every frame.
   Re-compute every 60 frames (2 seconds at 30fps) or when markers drift > 5px.

6. **Bit crush AudioWorklet** — worklet must be registered before AudioContext starts.
   Load worklet processor as a Blob URL to avoid needing a server for CORS.

---

## Deliverables

- `index.html` — opens in any modern browser, no server required
- `TEMPLATE.svg` — print on A3, landscape
- `TEMPLATE.pdf` — direct print version
- `TOKEN_SHEET.pdf` — perforated velocity token sheet, one A4 page
- `README.md` — setup, calibration, and usage guide

---

## Notes for Claude Code

- Build and test each phase before moving to the next
- The audio engine (Phase 3–4) can be developed and tested entirely without camera
- Use `?test=N` URLs throughout development to isolate modules
- The store is the integration point — get that right before wiring modules together
- The template SVG coordinates and the zone registry in zones.js must share the same
  normalised coordinate system — define `TEMPLATE_LAYOUT` as a shared constants file
  imported by both generator.js and zones.js
- Prioritise audio clock accuracy above all else — jitter is the worst user experience
  in a drum machine. Use the lookahead Web Audio scheduling pattern, never setTimeout alone
