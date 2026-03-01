# Hybrid Paper Sequencer — Implementation Plan for Claude Code

## Project Overview

A browser-based instrument that turns a printed A3 fretboard grid into a 16-step guitar sequencer. The user places small circular tokens onto the grid. The token's **ArUco code** encodes the step number (1–16). The token's **position on the grid** encodes the pitch (string + fret = note). Multiple tokens with the same step code = a chord. No token on a step = rest.

The system reads the physical board continuously via webcam, decoupled from the sequencer clock so they never block each other. Pattern slots, JAM mode, and tap tempo round out the interaction model.

This must run entirely in the browser — no install, no server, no backend. Single HTML file for MVP, Vite project for full build.

---

## ArUco ID Allocation

Dictionary: **DICT_4X4_50** (via `js-aruco2`)

| ID Range | Purpose |
|---|---|
| 0–3 | Corner anchor markers — printed permanently on grid board |
| 4–6 | Edge reference markers — string axis calibration |
| 7–22 | Step tokens — steps 1–16 (ID = step + 6) |
| 23–30 | Slot position zones — 8 pattern slots printed on board |
| 31 | Slot selector token — user moves this between slot zones |
| 32 | PLAY zone |
| 33 | REC zone |
| 34 | JAM zone |
| 35–44 | BPM digit tokens — 0–9 |

---

## Grid Layout

```
Columns: 16  (col 0 = open string, cols 1–15 = frets)
Rows:     6  (row 0 = high E4, row 5 = low E2)

String tuning (standard EADGBE):
  Row 0: E4  — frets: E4 F4 F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5
  Row 1: B3  — frets: B3 C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5
  Row 2: G3  — frets: G3 G#3 A3 A#3 B3 C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4
  Row 3: D3  — frets: D3 D#3 E3 F3 F#3 G3 G#3 A3 A#3 B3 C4 C#4 D4 D#4 E4 F4
  Row 4: A2  — frets: A2 A#2 B2 C3 C#3 D3 D#3 E3 F3 F#3 G3 G#3 A3 A#3 B3 C4
  Row 5: E2  — frets: E2 F2 F#2 G2 G#2 A2 A#2 B2 C3 C#3 D3 D#3 E3 F3 F#3 G3

MIDI note formula:
  E4 = MIDI 64, B3 = 59, G3 = 55, D3 = 50, A2 = 45, E2 = 40
  note_midi = open_midi[string] + fret
```

---

## Core Architecture

### Two Decoupled Loops

```
┌─────────────────────────────────┐   shared    ┌──────────────────────────────┐
│       DETECTION LOOP            │  boardState │      SEQUENCER LOOP          │
│  ~30fps (webcam frame rate)     │ ──────────► │  Tone.js Transport (precise) │
│                                 │             │                              │
│  1. Grab frame                  │             │  On each step tick:          │
│  2. Detect ArUco markers        │             │  1. Read boardState[step]    │
│  3. Find corner anchors (0–3)   │             │  2. Merge with storedPattern │
│  4. Compute homography          │             │  3. Resolve notes            │
│  5. Map token centers → cells   │             │  4. Trigger audio            │
│  6. Update boardState           │             │  5. Advance step counter     │
└─────────────────────────────────┘             └──────────────────────────────┘
```

They communicate through `boardState` only. The sequencer never waits on detection.

### Data Structures

```javascript
// Live board — written by detection, read by sequencer
boardState = {
  // key = step number (1–16)
  // value = array of detected notes at that step
  1: [ { string: 0, fret: 0, note: 'E4', midi: 64 } ],
  7: [ { string: 2, fret: 2, note: 'A3', midi: 57 },
       { string: 1, fret: 2, note: 'C#4', midi: 61 } ],
  // absent key = rest
}

// Stored patterns (localStorage)
patterns = {
  slot1: {
    name: 'Pattern 1',
    bpm: 120,
    steps: {
      // same shape as boardState
    }
  },
  // slot2 … slot8
}

// App state
appState = {
  mode: 'play' | 'jam' | 'rec_armed',
  activeSlot: 1,         // 1–8
  bpm: 120,
  currentStep: 0,        // 0–15, driven by sequencer
  tapTimes: [],          // timestamps for tap tempo
  isPlaying: false,
}
```

### Merged Playback Logic

```javascript
function getStepNotes(stepNum) {
  // boardState always overrides stored when tokens are present
  if (boardState[stepNum] && boardState[stepNum].length > 0) {
    return boardState[stepNum];
  }
  // Fall back to stored pattern for this slot
  const stored = patterns[`slot${appState.activeSlot}`];
  if (stored && stored.steps[stepNum]) {
    return stored.steps[stepNum];
  }
  return []; // rest
}
```

---

## File Structure

```
/
├── index.html              Main page — camera feed + canvas overlay + controls UI
├── vite.config.js
├── package.json
└── src/
    ├── main.js             App init — wires modules together, starts both loops
    ├── camera.js           WebRTC getUserMedia, frame capture helper
    ├── detector.js         ArUco detection, homography, boardState population
    ├── grid.js             Coordinate math, cell assignment, note resolution
    ├── sequencer.js        Tone.js Transport, step playback, merge logic
    ├── audio.js            Sampler init, note triggering, voice management
    ├── patterns.js         localStorage read/write, slot management
    ├── controls.js         Control zone detection (PLAY/REC/JAM/slot selector)
    ├── tapTempo.js         Tap zone occlusion detection, BPM averaging
    ├── overlay.js          Canvas drawing — grid, tokens, step highlight, labels
    ├── tuning.js           String/fret → MIDI/frequency lookup table
    └── ui.js               DOM manipulation, status display, BPM readout
```

---

## Module Specifications

### `camera.js`

```javascript
// Responsibilities:
// - Request webcam access (preferably rear camera on mobile, front on desktop)
// - Expose getFrame() → ImageData for detector
// - Handle permission denied gracefully with user message

export async function initCamera(videoElement) { ... }
export function getFrame(videoElement, canvas) → ImageData { ... }
```

### `detector.js`

Core of the system. Runs on `requestAnimationFrame`.

```javascript
// Responsibilities:
// 1. Run js-aruco2 detector on each frame
// 2. Identify corner anchors (IDs 0–3) — if < 3 found, mark grid as "uncalibrated"
// 3. Compute homography from found anchors using SVD (or use 3-point fallback)
// 4. For each non-anchor marker detected:
//    a. Transform marker center through homography → template coordinates
//    b. Assign to grid cell (string, fret) via floor division
//    c. Resolve note via tuning.js
//    d. If ID 7–22: update boardState[id - 6]
//    e. If ID 23–30: update detected slot zone positions (for selector logic)
//    f. If ID 31: update appState.activeSlot based on nearest slot zone
//    g. If ID 32–34: debounced trigger for PLAY/REC/JAM
//    h. If ID 35–44: update BPM digit for appropriate column
// 5. Clear boardState entries for steps where no token is detected this frame
//    (use a "last seen" timestamp + 100ms grace period to avoid flicker)

export function startDetectionLoop(videoElement, overlayCanvas) { ... }
export let boardState = {};
```

**Homography notes:**
- Only needs recomputing when anchor positions change significantly (> 2px drift)
- Cache the matrix and reuse until drift threshold exceeded
- With only 3 anchors visible, use affine transform as fallback
- With < 3 anchors: freeze boardState, show calibration warning on overlay

### `grid.js`

```javascript
// Template coordinate space: normalized 0.0–1.0 in both axes
// Col 0 (open) occupies slightly wider visual space but equal column in math

const GRID_COLS = 16;  // cols 0–15
const GRID_ROWS = 6;   // rows 0–5

export function templateCoordsToCell(tx, ty) {
  // Returns { string: 0–5, fret: 0–15 } or null if out of bounds
}

export function cellToNote(string, fret) {
  // Returns { note: 'A3', midi: 57, frequency: 220.0 }
}
```

### `tuning.js`

```javascript
// Standard EADGBE tuning
// Open MIDI notes per string:
const OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2

export function getMidi(string, fret) {
  return OPEN_MIDI[string] + fret;
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  // Returns e.g. 'C#4', 'G3'
}
```

### `audio.js`

```javascript
// Guitar samples: use Tone.js Sampler with freely-licensed guitar samples
// Recommended source: https://gleitz.github.io/midi-js-soundfonts/
// (acoustic_guitar_nylon or acoustic_guitar_steel — hosted on GitHub Pages, CORS-friendly)
//
// Voice management:
// - Each string has its own channel (6 voices)
// - New note on a string cuts the previous note (monophonic per string — like real guitar)
// - Release time: ~1.5s natural decay

export async function initAudio() { ... }

export function triggerNote(string, midi, velocity = 0.8) {
  // Stops existing note on that string channel
  // Triggers new note
}

export function releaseAll() { ... }
```

### `sequencer.js`

```javascript
// Tone.js Transport drives timing
// 16th note subdivision at current BPM
// Steps are 0-indexed internally (0–15), displayed as 1–16

export function startSequencer() {
  Tone.Transport.scheduleRepeat(onStep, '16n');
  Tone.Transport.start();
}

function onStep(time) {
  const step = currentStep + 1; // 1–16
  const notes = getStepNotes(step); // merge logic
  notes.forEach(({ string, midi }) => {
    audio.triggerNote(string, midi, 0.8);
  });
  currentStep = (currentStep + 1) % 16;
  // Update UI via event or shared state
}

export function setTempo(bpm) {
  Tone.Transport.bpm.value = bpm;
}
```

### `tapTempo.js`

```javascript
// Tap zone is a printed rectangle in the control strip
// Detection: monitor the brightness of that region in template space each frame
// If average brightness drops below threshold → hand is covering it → "tap event"
// Debounce: ignore events within 100ms of each other

const MAX_TAP_HISTORY = 8;
const TAP_TIMEOUT_MS = 2000; // reset if gap > 2 seconds

export function processTapZone(templateBrightness) {
  // Call each frame with the average brightness of the tap zone region
  // Returns updated BPM or null if not enough taps yet
}

// After 4+ taps: BPM = 60000 / average(intervals)
// Clamp result to 40–240 BPM
```

### `patterns.js`

```javascript
// localStorage key: 'hybrid-sequencer-patterns'
// Stores all 8 slots as JSON

export function savePattern(slot, stepsSnapshot, bpm, name) { ... }
export function loadPattern(slot) → { steps, bpm, name } | null { ... }
export function loadAllPatterns() → { slot1: ..., slot8: ... } { ... }
export function clearSlot(slot) { ... }
```

### `controls.js`

```javascript
// Watches for control zone activations from detector.js
// Debounced: minimum 500ms between activations of same control

// PLAY: toggle sequencer start/stop
// REC: if playing in JAM mode → arm for save to active slot
//      on next step-1 arrival → snapshot merged pattern → save → disarm
// JAM: toggle JAM mode
//      in JAM mode: board always overrides stored
//      not in JAM mode: board only plays, stored pattern fills gaps

export function handleControlEvent(controlId) { ... }
```

### `overlay.js`

Canvas drawn on top of the video feed, same dimensions.

```javascript
// Draw order each frame:
// 1. Grid lines (faint, projected onto camera view using homography inverse)
// 2. Note name labels in each cell (very small, greyed out)
// 3. Detected tokens — coloured circles with step number and note name
// 4. Current step highlight — column highlight animates with sequencer
// 5. Calibration status — green border when anchors locked, red when lost
// 6. Slot strip — highlight active slot
// 7. Status bar — mode, BPM, active slot name

// Colour coding for token circles:
// Steps 1–4:   blue
// Steps 5–8:   green
// Steps 9–12:  orange
// Steps 13–16: purple
```

### `ui.js`

```javascript
// DOM elements:
// - BPM display (updates from tap or digit tokens)
// - Mode indicator (PLAY / JAM / REC ARMED)
// - Active slot name + number
// - Calibration status badge
// - "No camera" fallback message with instructions

// Also: on-screen PLAY/JAM/REC buttons as fallback for users
// who prefer not to use the printed control zones
```

---

## Implementation Phases

### Phase 1 — Camera + Detection Foundation
1. Vite project setup, `js-aruco2` installed
2. Webcam feed in `<video>`, canvas overlay on top
3. ArUco detection running on every frame
4. Corner anchors (0–3) detected and highlighted
5. Homography computed and logged to console
6. Any token placed → console logs `{ id, templateX, templateY }`

**Exit criteria:** Can place a token anywhere and see its correct template coordinates.

---

### Phase 2 — Grid Mapping + boardState
1. `grid.js` coordinate→cell math implemented and unit-tested
2. `tuning.js` complete with all 96 note lookups
3. Token detection populates `boardState` correctly
4. Overlay draws grid lines projected onto camera view
5. Detected tokens show step number + note name as overlay labels
6. Multi-token (chord) detection working — multiple tokens same step code

**Exit criteria:** Place 3 tokens with same step code → overlay shows a chord. Move a token → note updates.

---

### Phase 3 — Sequencer + Audio
1. Tone.js Transport running at 120 BPM
2. Step ticker advancing 0–15 and back
3. Current step column highlighted in overlay
4. `audio.js` init with Tone.js Sampler + guitar samples loaded from CDN
5. Each step tick reads `boardState`, triggers notes
6. Per-string voice management (new note cuts old on same string)

**Exit criteria:** Place tokens → hear them play in rhythm. Multiple tokens same step → chord plays.

---

### Phase 4 — Patterns + JAM Mode
1. `patterns.js` localStorage CRUD
2. Slot selector token (ID 31) moves between slot zones, updates `appState.activeSlot`
3. PLAY control zone starts/stops sequencer
4. JAM mode implemented — board overrides stored
5. REC arming — JAM + REC → writes merged pattern to active slot on bar completion
6. Pattern playback — stored pattern plays when no board token at that step

**Exit criteria:** Build a pattern with tokens → save it → clear tokens → pattern still plays. Place a token over step 7 → step 7 overrides. Remove it → stored step 7 returns.

---

### Phase 5 — Tempo Controls + Polish
1. Tap tempo zone brightness detection
2. BPM digit token detection (IDs 35–44) in the three BPM slots
3. Both tempo methods update Tone.js Transport BPM in real-time
4. Calibration warning when < 3 corner anchors visible
5. "Last seen" token persistence (100ms grace period to prevent flicker)
6. Graceful degradation: hidden control buttons as fallback for all ArUco controls
7. Mobile-friendly layout (camera fills viewport, controls accessible)

**Exit criteria:** Tap tempo 4× → BPM updates. Place digit tokens 1,2,0 → BPM becomes 120.

---

### Phase 6 — Robustness + UX
1. Edge cases: token partially off grid, two tokens too close, homography too distorted
2. Confidence scoring — low confidence detections shown as dimmed, not triggering notes
3. Pattern naming (simple prompt dialog)
4. Visual step counter on overlay matching audio
5. Loading state while audio samples load
6. Error boundary: camera denied, no HTTPS, unsupported browser messages

---

## Dependencies

```json
{
  "dependencies": {
    "tone": "^14.x",
    "js-aruco2": "^1.x"
  },
  "devDependencies": {
    "vite": "^5.x"
  }
}
```

**Audio samples:** Load at runtime from:
```
https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_guitar_nylon-mp3/
```
Tone.js Sampler accepts a note-map directly from this URL pattern.

**js-aruco2:** Pure JavaScript, no WASM, works in all modern browsers. Import from npm or CDN.

---

## index.html Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>Hybrid Sequencer</title>
  <style>
    /* Full-viewport camera feed, canvas overlay absolute on top */
    /* Control bar pinned to bottom on mobile */
    /* Dark theme — easier to see overlay on camera feed */
  </style>
</head>
<body>
  <div id="app">
    <div id="camera-container">
      <video id="feed" autoplay playsinline muted></video>
      <canvas id="overlay"></canvas>
    </div>

    <div id="status-bar">
      <span id="mode-indicator">STOPPED</span>
      <span id="bpm-display">120 BPM</span>
      <span id="slot-display">SLOT 1</span>
      <span id="calibration-badge">⚠ NO GRID</span>
    </div>

    <div id="fallback-controls">
      <!-- On-screen buttons as fallback for all ArUco control zones -->
      <button id="btn-play">PLAY</button>
      <button id="btn-rec">REC</button>
      <button id="btn-jam">JAM</button>
      <div id="slot-buttons">
        <!-- Slot 1–8 buttons -->
      </div>
      <input type="range" id="bpm-slider" min="40" max="240" value="120">
    </div>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## Key Implementation Notes

**Homography stability:** Recompute only when anchor drift > 2px. Cache the matrix. On first detection, animate a "grid locked" visual confirmation so the user knows the camera sees the board.

**Token flicker prevention:** Each step's boardState entry stores a `lastSeen` timestamp. In the sequencer's merge function, only clear a step's live tokens if they haven't been seen for > 100ms. This smooths over single dropped frames without adding latency.

**Chord detection order:** When multiple tokens share a step code, sort them by string number before triggering so bass notes always fire before treble. This affects how Tone.js Sampler handles simultaneous scheduling.

**Mobile camera orientation:** On phones, `getUserMedia` with `facingMode: 'environment'` uses the rear camera. The printed template should be placed flat on a table with the phone held above. Consider a note in the UI suggesting optimal camera distance (~40–60cm).

**Audio context unlock:** Browsers require a user gesture before AudioContext can start. Gate `Tone.start()` behind the PLAY button press (either on-screen or ArUco zone detection). Show a "Tap PLAY to begin" message until this happens.

**HTTPS requirement:** `getUserMedia` only works on HTTPS or localhost. When deployed, must be served over HTTPS. Document this clearly — Vite dev server on localhost is fine for development.

**js-aruco2 dictionary config:** Initialise with `AR.Dictionary.DICT_4X4_50` for maximum detection reliability at small sizes. This dictionary has the lowest error rate for markers under 30mm on screen.

---

## Template Reference

Two printable PDFs accompany this plan:

**`grid_board.pdf`** — Print A3 landscape
- 6×16 fretboard grid with note names in cells
- Corner anchor ArUcos (IDs 0–3) at grid corners
- Edge reference markers (IDs 4–6) on left edge
- 8 pattern slot zones (IDs 23–30) across top
- Control strip at bottom: TAP zone, BPM digit slots, PLAY/REC/JAM zones

**`token_sheet.pdf`** — Print A4 portrait on card stock
- 64 step tokens: steps 1–16, 4 copies each (IDs 7–22)
- Control tokens: SELECT (31), PLAY (32), REC (33), JAM (34)
- BPM digit tokens: 0–9 (IDs 35–44)
- 26mm diameter — readable at 40–60cm camera distance
- Cut along dashed circles. Laminate for durability.

---

## Stretch Goals (Post-MVP)

- **Velocity sensitivity** — token placement confidence score maps to note velocity
- **Scale filter mode** — grey out cells that aren't in the selected key/scale
- **Chord token set** — pre-defined chord voicing tokens for fast chord placement  
- **Export pattern** — download current slot as MIDI file
- **Ensemble mode** — WebSocket sync to a teacher conductor station (multiple devices, shared clock)
- **Alternate tunings** — config token that shifts the note lookup table (drop D, DADGAD, etc.)
- **Visual metronome** — overlay flashes on beat 1 of each bar
