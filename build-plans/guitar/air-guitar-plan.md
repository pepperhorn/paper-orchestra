# Air Guitar — Implementation Plan
> Accessible instrument using a laser-engraved MDF fretboard template + phone front camera

---

## Project Context

This is part of a family of accessible instruments (alongside "Air Piano") built on the **airico** framework. Instruments require only a printed/engraved template and a device with a front-facing camera. No specialist hardware.

**Air Guitar uses:**
- An MDF fretboard template with ArUco codes laser-engraved at each string/fret position
- MediaPipe Hands for real-time fingertip tracking
- A **strum strip** — a physical zone on the template where strumming/picking is detected
- Web Audio API / Tone.js for guitar sample playback

---

## Physical Template Spec

### Dimensions
- Board: **600mm × 120mm** (portrait, phone held above)
- 6 strings × 12 frets + 6 open string positions = **78 ArUco codes**
- Standard EADGBE tuning

### Zones
```
┌─────────────────────────────────────────────────────────────────┐
│  HEADSTOCK   │  FRETS 1–12 (shrinking spacing, real guitar ratio) │
│  (nut/open)  │                                                    │
│  6 codes     │  72 codes in a 6×12 grid                          │
├──────────────┴────────────────────────────────────────────────────┤
│                     STRUM STRIP                                    │
│         (physical zone, ~40mm tall, full width)                   │
└───────────────────────────────────────────────────────────────────┘
```

### ArUco Layout
- Dictionary: `DICT_6X6_250` (generous headroom for 78 IDs)
- Code IDs assigned as: `string_index * 13 + fret_index` (fret 0 = open string)
- Minimum code size at fret 12: 12mm × 12mm
- Engraved into MDF; white chalk paint fill for contrast

### Strum Strip
- A separate hatched/ruled zone at the bottom of the board
- No codes in this zone — it is a **plain visual area**
- Detected via hand landmark crossing the zone boundary (see detection logic)

---

## Detection Architecture

### Phase 1 — Startup Calibration
1. Camera feed begins
2. OpenCV.js scans for ArUco codes in the frame
3. Detected codes build a **homography matrix** (perspective transform from camera view to template coordinates)
4. The app confirms calibration when ≥8 codes are detected across the board
5. A virtual grid is constructed — every string/fret position is now a known 2D point in camera space

### Phase 2 — Runtime Play Detection

**Hand tracking:** MediaPipe Hands (supports up to 2 hands)

```
Camera frame
    ↓
MediaPipe Hands → landmark positions (21 per hand)
    ↓
Apply homography → map landmarks to template coordinates
    ↓
Fretting Hand:   fingertip positions → nearest fret grid position
Strumming Hand:  wrist/palm crossing strum strip boundary → trigger
    ↓
Note resolution: active frets + strummed strings → chord/note
    ↓
Tone.js → audio output
```

---

## Strum Strip Detection

### Concept
The strum strip is a horizontal zone at the base of the fretboard template. Strumming is detected when the **strumming hand** crosses through this zone.

### Implementation

```javascript
// Define strum strip in template coordinates (normalised 0–1)
const STRUM_STRIP = {
  y_top: 0.85,    // 85% down the template
  y_bottom: 1.0,
  x_left: 0.0,
  x_right: 1.0
};

// Track wrist/palm landmark (landmark 0) of strumming hand
function updateStrumState(hand, transformedLandmarks) {
  const palm = transformedLandmarks[0]; // wrist landmark
  const inStrip = palm.y >= STRUM_STRIP.y_top && palm.y <= STRUM_STRIP.y_bottom;

  if (inStrip && !hand.wasInStrip) {
    // Entered strip — direction tells us up/down strum
    hand.strumDirection = palm.y_velocity > 0 ? 'down' : 'up';
    triggerStrum(hand.strumDirection);
  }
  hand.wasInStrip = inStrip;
}
```

### Which Strings Are Strummed
- On strum trigger, inspect the **x position** of the strumming hand's fingertips as they cross the strip
- Fingertips within the strip determine which strings are active in the strum
- If the full hand width spans the strip → all 6 strings strummed
- Partial strum (e.g. only fingertips 2–4 in strip) → strum strings 2–4 only

```javascript
function getStrumedStrings(fingertips, templateCoords) {
  // Each string has an x coordinate in template space
  const stringXPositions = [0.08, 0.22, 0.36, 0.50, 0.64, 0.78]; // E A D G B e
  const THRESHOLD = 0.07; // ~half string spacing

  return stringXPositions
    .map((sx, i) => ({
      string: i,
      hit: fingertips.some(tip => Math.abs(tip.x - sx) < THRESHOLD && isInStrumStrip(tip))
    }))
    .filter(s => s.hit)
    .map(s => s.string);
}
```

---

## Fretting Hand Logic

```javascript
function getFrettedNotes(hand, transformedLandmarks) {
  // Fingertip landmark indices: thumb=4, index=8, middle=12, ring=16, pinky=20
  const fingertipIndices = [4, 8, 12, 16, 20];
  const frettedPositions = [];

  for (const idx of fingertipIndices) {
    const tip = transformedLandmarks[idx];
    const gridPos = snapToGrid(tip, STRING_X_POSITIONS, FRET_X_POSITIONS);
    if (gridPos && tip.confidence > 0.7) {
      frettedPositions.push(gridPos); // { string, fret }
    }
  }
  return frettedPositions;
}
```

---

## Note Resolution

```javascript
// Build the note map: noteMap[string][fret] = MIDI note number
// Standard EADGBE tuning, fret 0 = open string
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

function buildNoteMap() {
  const map = [];
  for (let s = 0; s < 6; s++) {
    map[s] = [];
    for (let f = 0; f <= 12; f++) {
      map[s][f] = OPEN_STRINGS[s] + f;
    }
  }
  return map;
}

function resolveChord(frettedPositions, strumedStrings, noteMap) {
  return strumedStrings.map(stringIdx => {
    const fret = frettedPositions.find(p => p.string === stringIdx);
    return noteMap[stringIdx][fret ? fret.fret : 0]; // open if no finger on string
  });
}
```

---

## Audio

Use **Tone.js** with a Sampler loaded with real guitar samples (e.g. from Tonejs/Tone.js sample library or a royalty-free pack).

```javascript
import * as Tone from 'tone';

const guitar = new Tone.Sampler({
  urls: { A2: "A2.mp3", E2: "E2.mp3", /* etc */ },
  baseUrl: "/samples/guitar/",
  onload: () => console.log("Samples loaded")
}).toDestination();

function triggerNotes(midiNotes) {
  const now = Tone.now();
  midiNotes.forEach(midi => {
    guitar.triggerAttackRelease(
      Tone.Frequency(midi, "midi").toNote(),
      "2n",
      now
    );
  });
}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Camera / CV | `OpenCV.js` (ArUco), `MediaPipe Hands` |
| Rendering | HTML5 Canvas overlay on video feed |
| Audio | `Tone.js` + sampler |
| Framework | Vanilla JS PWA (aligns with Air Piano) |
| Calibration | Homography via OpenCV `findHomography` |

---

## File Structure

```
air-guitar/
├── index.html
├── src/
│   ├── main.js              # App init, camera setup
│   ├── calibration.js       # ArUco detection, homography
│   ├── handTracking.js      # MediaPipe setup, landmark processing
│   ├── fretboard.js         # Grid snap, note resolution
│   ├── strumDetector.js     # Strum strip logic
│   ├── audio.js             # Tone.js sampler wrapper
│   └── noteMap.js           # MIDI note map, tunings
├── templates/
│   ├── fretboard.svg        # Laser engraving source file
│   └── fretboard-print.pdf  # Print-at-home version
├── samples/
│   └── guitar/              # Audio samples
└── README.md
```

---

## Build Phases

### Phase 1 — Calibration + Grid
- [ ] Camera feed in browser
- [ ] ArUco detection with OpenCV.js
- [ ] Homography transform
- [ ] Visual overlay showing detected grid

### Phase 2 — Hand Tracking
- [ ] MediaPipe Hands integration
- [ ] Landmark → template coordinate mapping
- [ ] Fingertip snapping to fret grid
- [ ] Visual debug overlay (dots on detected fret positions)

### Phase 3 — Strum Detection
- [ ] Strum strip zone definition
- [ ] Palm entry/exit detection
- [ ] Strummed string identification from fingertip x-positions
- [ ] Strum direction (up/down) detection

### Phase 4 — Audio
- [ ] Tone.js sampler setup
- [ ] Note resolution (fretted + strummed → MIDI)
- [ ] Chord triggering
- [ ] Open string handling

### Phase 5 — Template
- [ ] SVG fretboard with ArUco codes at correct positions
- [ ] Laser engraving export
- [ ] Print-at-home PDF version

---

## Key Design Decisions

**Why homography + landmark tracking (not code occlusion):**
Detecting finger *on* a code by occlusion doesn't scale to chords (multiple fingers block multiple codes simultaneously and detection becomes unreliable). Instead, codes calibrate the perspective transform once; thereafter MediaPipe tracks fingers directly with no dependency on code visibility.

**Why a dedicated strum strip:**
Separating fretting and strumming hands into distinct spatial zones maps naturally to how guitar works and avoids ambiguity about which hand is which. The strip also provides clear visual feedback to the player about where to strum.

**Phone camera orientation:**
Portrait mode, phone placed above the board (leaning on a stand or held by a second person). Recommended working distance: 40–60cm. This gives enough FOV to see the full 600mm board while keeping ArUco codes large enough in frame to decode reliably.
