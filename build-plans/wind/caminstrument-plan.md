# CamInstrument — Claude Code Implementation Plan

**Working file:** `caminstrument.html` (single self-contained file, ~1671 lines)  
**No build system.** All edits are direct string replacements or insertions into the HTML file.  
**Execute phases in order.** Each phase is independently testable before proceeding.

---

## Current state

| System | Status | Notes |
|---|---|---|
| Template detection (blob topology) | ✅ Working | 6-blob=whistle, 3-blob=trumpet, 45-frame lock |
| Whistle z-depth detection | ✅ Working | 2-hand, tap velocity + sustained threshold |
| Trumpet z-depth detection | ✅ Working | 1-hand, index/middle/ring |
| Breath gate (mic, spectral flatness) | ✅ Working | AEC enabled |
| Voice gate (HNR autocorrelation) | ✅ Working | Parallel to breath, OR gate |
| Lip aperture gate (face mesh) | ✅ Working | Embouchure / blow detection |
| Breath fusion (any source gates note) | ✅ Working | |
| Dynamic gain + filter (breathLevel) | ✅ Working | Timbre tracks amplitude |
| **Trumpet partials (lip → register)** | ❌ Not built | Discussed, never implemented |
| **Z-depth calibration** | ❌ Not built | Fixed thresholds, not per-session |
| **Print template generator** | ❌ Not built | Needed for physical instruments |
| Stale `varBaseline` ref in `requestRescan` | 🐛 Bug | Line 950 — resets an unused array |
| Scanning overlay hardcoded blue | 🐛 Style | Should use `--mode-c` |

---

## Phase 1 — Bug fixes and cleanup (do first, ~15 min)

### 1a — Remove stale `varBaseline` reset

`requestRescan()` (around line 944) still resets `varBaseline = new Array(6).fill(null)`.  
This array was used by the old variance occlusion system which has been removed.

**Fix:** Delete this line from `requestRescan()`:
```javascript
// DELETE this line:
varBaseline = new Array(6).fill(null);
```

Also delete the state declaration near the top of the script:
```javascript
// DELETE this line (search for it):
let varBaseline    = new Array(6).fill(null);
```

---

### 1b — Fix scanning overlay colour

`drawDetectionOverlay()` hardcodes `rgba(90,122,255,...)` (blue) for both templates.  
It should reflect which template is being detected.

**Fix:** In `drawDetectionOverlay(imageData, w, h, template)`:

```javascript
// Replace hardcoded colour with template-driven colour
const col = template === 'whistle'
  ? 'rgba(72,232,154,'    // green
  : template === 'trumpet'
  ? 'rgba(240,184,64,'    // brass
  : 'rgba(90,122,255,';   // indigo fallback

// Then use col in both:
octx.strokeStyle = col + '0.5)';
// and:
octx.fillStyle = col + '0.7)';
```

---

### 1c — Keyboard fallback: set breathLevel when SPACE held

Currently when SPACE is pressed, `micBlowing = true` but `breathLevel` stays at `0`,
so dynamics don't fire during keyboard testing.

**Fix:** In the keydown handler for SPACE:
```javascript
document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!isBlowing) {
      micBlowing = true;
      breathLevel = 0.7;  // ← add this: reasonable forte default
      updateBreathFusion();
      updateBreathUI();
    }
  }
});
```

---

## Phase 2 — Trumpet partials via lip aperture (largest feature, ~1.5hr)

### Context

Currently `TRUMPET_NOTES` is a flat array — one entry per valve combination, all in the same
register. Real trumpet players select register (partial) by tightening/loosening embouchure.
The face mesh `lipAperture` value (already computed in `onFaceResults`) is the correct signal.

This phase restructures the trumpet note lookup from:
```
valve_combo → single note
```
to:
```
valve_combo + partial_index → note
```

---

### 2a — Replace TRUMPET_NOTES with a 2D partial table

Delete the existing `TRUMPET_NOTES` const (around line 632) and replace with:

```javascript
// Bb Trumpet partial table
// Outer index: partial 0=2nd, 1=3rd, 2=4th, 3=5th (concert pitch, Bb instrument)
// Inner: keyed by valve combo string '000','100','110', etc.
// Partial 0 = "low register", lips relaxed
// Partial 3 = "high register", lips tight
const TRUMPET_PARTIALS = [
  // Partial 0 — 2nd harmonic (lowest playable, relaxed embouchure)
  { partial:0, label:'2nd partial', notes: [
    { name:'B♭', oct:'3', freq:233.08, v:[0,0,0] },
    { name:'A',  oct:'3', freq:220.00, v:[1,0,0] },
    { name:'A♭', oct:'3', freq:207.65, v:[1,1,0] },
    { name:'G',  oct:'3', freq:196.00, v:[0,0,1] },
    { name:'G♭', oct:'3', freq:184.99, v:[0,1,1] },
    { name:'F♯', oct:'3', freq:184.99, v:[1,0,1] },
    { name:'F',  oct:'3', freq:174.61, v:[1,1,1] },
    { name:'B',  oct:'3', freq:246.94, v:[0,1,0] },
  ]},
  // Partial 1 — 3rd harmonic (mid-low, slight lip tension)
  { partial:1, label:'3rd partial', notes: [
    { name:'F',  oct:'4', freq:349.23, v:[0,0,0] },
    { name:'E',  oct:'4', freq:329.63, v:[1,0,0] },
    { name:'E♭', oct:'4', freq:311.13, v:[0,1,0] },
    { name:'D',  oct:'4', freq:293.66, v:[1,1,0] },
    { name:'D♭', oct:'4', freq:277.18, v:[0,0,1] },  // alt: 1+3
    { name:'C',  oct:'4', freq:261.63, v:[0,1,1] },
    { name:'B',  oct:'3', freq:246.94, v:[1,1,1] },
  ]},
  // Partial 2 — 4th harmonic (mid, standard playing range)
  { partial:2, label:'4th partial', notes: [
    { name:'B♭', oct:'4', freq:466.16, v:[0,0,0] },
    { name:'A',  oct:'4', freq:440.00, v:[1,0,0] },
    { name:'A♭', oct:'4', freq:415.30, v:[1,1,0] },
    { name:'G',  oct:'4', freq:392.00, v:[0,0,1] },
    { name:'G♭', oct:'4', freq:369.99, v:[0,1,1] },
    { name:'F♯', oct:'4', freq:369.99, v:[1,0,1] },
    { name:'F',  oct:'4', freq:349.23, v:[1,1,1] },
    { name:'B',  oct:'4', freq:493.88, v:[0,1,0] },
  ]},
  // Partial 3 — 5th harmonic (upper register, tight embouchure)
  { partial:3, label:'5th partial', notes: [
    { name:'D',  oct:'5', freq:587.33, v:[0,0,0] },
    { name:'C♯', oct:'5', freq:554.37, v:[1,0,0] },
    { name:'C',  oct:'5', freq:523.25, v:[0,1,0] },
    { name:'B',  oct:'4', freq:493.88, v:[1,1,0] },
    { name:'B♭', oct:'4', freq:466.16, v:[0,0,1] },
    { name:'A',  oct:'4', freq:440.00, v:[0,1,1] },
    { name:'A♭', oct:'4', freq:415.30, v:[1,1,1] },
  ]},
  // Partial 4 — 6th harmonic (high register, very tight)
  { partial:4, label:'6th partial', notes: [
    { name:'F',  oct:'5', freq:698.46, v:[0,0,0] },
    { name:'E',  oct:'5', freq:659.25, v:[1,0,0] },
    { name:'E♭', oct:'5', freq:622.25, v:[0,1,0] },
    { name:'D',  oct:'5', freq:587.33, v:[1,1,0] },
  ]},
];

// Flatten for chart rendering (backward compat helper)
const TRUMPET_NOTES = TRUMPET_PARTIALS.flatMap(p => p.notes);
```

---

### 2b — Add partial state variables

Near the existing trumpet state vars (around line 700–706), add:

```javascript
let currentPartial    = 2;        // default: 4th harmonic, most common register
let targetPartial     = 2;        // raw detected partial before hysteresis
let partialHoldFrames = 0;        // hysteresis counter
const PARTIAL_HYSTERESIS = 12;    // frames to hold before accepting partial change
                                  // ~400ms at 30fps — prevents jitter at thresholds

// Lip aperture → partial thresholds
// These are the aperture values (0..1 normalised to face height) at each boundary.
// Calibrated against typical adult embouchure; adjustable in Phase 3.
const PARTIAL_THRESHOLDS = [
  0.038,  // above this = partial 0 (very relaxed, 2nd harmonic)
  0.028,  // above this = partial 1 (relaxed, 3rd harmonic)
  0.018,  // above this = partial 2 (mid, 4th harmonic — DEFAULT)
  0.010,  // above this = partial 3 (tighter, 5th harmonic)
           // below 0.010 = partial 4 (very tight, 6th harmonic)
];
// Reading: lipAperture > 0.038 → partial 0
//          0.028 < lipAperture <= 0.038 → partial 1
//          0.018 < lipAperture <= 0.028 → partial 2  ← normal
//          0.010 < lipAperture <= 0.018 → partial 3
//          lipAperture <= 0.010         → partial 4
```

---

### 2c — Add `getPartialFromAperture(aperture)` function

Add this function after the `PARTIAL_THRESHOLDS` declaration:

```javascript
function getPartialFromAperture(aperture) {
  // Aperture is INVERTED relative to partial — tighter lip = smaller aperture = higher partial
  for (let i = 0; i < PARTIAL_THRESHOLDS.length; i++) {
    if (aperture > PARTIAL_THRESHOLDS[i]) return i;
  }
  return PARTIAL_THRESHOLDS.length; // maximum partial
}
```

---

### 2d — Add partial update with hysteresis to `onFaceResults`

At the end of `onFaceResults`, after `lipBlowing` is set, add:

```javascript
  // ── Partial detection (trumpet only) ──
  if (mode === 'trumpet') {
    const raw = getPartialFromAperture(lipAperture);
    if (raw !== currentPartial) {
      if (raw === targetPartial) {
        partialHoldFrames++;
        if (partialHoldFrames >= PARTIAL_HYSTERESIS) {
          currentPartial    = raw;
          partialHoldFrames = 0;
          updateNote();          // retrigger note lookup with new partial
          updatePartialUI();
        }
      } else {
        targetPartial     = raw;
        partialHoldFrames = 1;
      }
    } else {
      partialHoldFrames = 0;
    }
  }
```

---

### 2e — Update `updateNote()` trumpet branch to use partial table

Replace the trumpet note-matching block inside `updateNote()`:

```javascript
  // BEFORE:
  } else if (mode === 'trumpet') {
    const pressed = fingerState.map(s => s === 'pressed' ? 1 : 0);
    for (const n of TRUMPET_NOTES) {
      if (n.v.every((h, i) => h === pressed[i])) { matched = n; break; }
    }
    ...

  // AFTER:
  } else if (mode === 'trumpet') {
    const pressed = fingerState.map(s => s === 'pressed' ? 1 : 0);
    // Look up in the current partial's note list
    const partialIdx = Math.min(currentPartial, TRUMPET_PARTIALS.length - 1);
    const partialNotes = TRUMPET_PARTIALS[partialIdx].notes;
    for (const n of partialNotes) {
      if (n.v.every((h, i) => h === pressed[i])) { matched = n; break; }
    }
    // Chart: highlight matched note across ALL partials in chart
    TRUMPET_NOTES.forEach((n, i) => {
      document.getElementById(`tc${i}`).className = 'chart-cell' + (matched && n.freq === matched.freq ? ' lit' : '');
    });
  }
```

---

### 2f — Add `updatePartialUI()` function

This updates a register indicator in the panel and the note subtitle.

```javascript
function updatePartialUI() {
  const el = document.getElementById('partialIndicator');
  if (!el) return;
  const p = TRUMPET_PARTIALS[Math.min(currentPartial, TRUMPET_PARTIALS.length-1)];
  el.textContent = p.label;

  // Update zone bars
  for (let i = 0; i < TRUMPET_PARTIALS.length; i++) {
    const bar = document.getElementById(`pbar${i}`);
    if (bar) bar.classList.toggle('active', i === currentPartial);
  }
}
```

---

### 2g — Add partial register indicator to trumpet panel HTML

In the trumpet panel `<div class="trumpet-panel">`, immediately after the closing
`</div>` of `valves-wrap`, add:

```html
<div class="partial-section" style="padding:0 22px 10px">
  <div class="sec-label">
    Register
    <span id="partialIndicator" style="color:var(--mode-c);margin-left:8px">4th partial</span>
  </div>
  <div class="partial-bars">
    <!-- 5 bars: one per partial, light up based on currentPartial -->
    <div class="pbar" id="pbar4"><span>6th</span></div>
    <div class="pbar" id="pbar3"><span>5th</span></div>
    <div class="pbar active" id="pbar2"><span>4th</span></div>
    <div class="pbar" id="pbar1"><span>3rd</span></div>
    <div class="pbar" id="pbar0"><span>2nd</span></div>
  </div>
  <div style="font-size:0.5rem;color:var(--muted);margin-top:6px;letter-spacing:0.06em">
    tighten embouchure to rise · relax to fall
  </div>
</div>
```

**CSS for partial bars** (add to `<style>`):

```css
.partial-bars {
  display: flex;
  gap: 4px;
  height: 28px;
  align-items: flex-end;
  margin-top: 8px;
}
.pbar {
  flex: 1;
  background: var(--border);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  cursor: default;
}
/* Heights stagger to show register ladder */
#pbar0 { height: 40%; }
#pbar1 { height: 55%; }
#pbar2 { height: 70%; }
#pbar3 { height: 85%; }
#pbar4 { height: 100%; }

.pbar span {
  font-size: 0.45rem;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pbar.active {
  background: var(--mode-dim);
  border-color: var(--mode-c);
  box-shadow: 0 0 8px color-mix(in srgb, var(--mode-c) 30%, transparent);
}
.pbar.active span { color: var(--mode-c); }
```

---

### 2h — Lip aperture threshold markers in the LIP breath meter

The LIP bar's `.apt-zone` currently shows a fixed zone. In trumpet mode this should
show all four partial boundary positions as tick marks.

Replace the static `.apt-zone` in the LIP row with dynamically-rendered threshold ticks.
In `updateBreathUI()`, after setting `lipFill` width, add:

```javascript
// Draw partial threshold ticks on lip track in trumpet mode
const lipTrack = document.querySelector('#lipFill').parentElement;
// Remove old ticks
lipTrack.querySelectorAll('.partial-tick').forEach(t => t.remove());
if (mode === 'trumpet') {
  PARTIAL_THRESHOLDS.forEach((thresh, i) => {
    const tick = document.createElement('div');
    tick.className = 'partial-tick';
    tick.style.cssText = `position:absolute;top:0;bottom:0;left:${(thresh/0.08)*100}%;
      width:1px;background:rgba(240,184,64,${i===currentPartial?0.8:0.25});pointer-events:none;`;
    lipTrack.appendChild(tick);
  });
}
```

---

### 2i — Keyboard partial testing

Add keyboard shortcuts for testing partial changes without face mesh.
In the existing keyboard section:

```javascript
// [ and ] keys cycle partials up/down (testing without face mesh)
document.addEventListener('keydown', e => {
  if (e.code === 'BracketLeft'  && mode === 'trumpet') {
    currentPartial = Math.max(0, currentPartial - 1);
    updateNote(); updatePartialUI();
  }
  if (e.code === 'BracketRight' && mode === 'trumpet') {
    currentPartial = Math.min(TRUMPET_PARTIALS.length - 1, currentPartial + 1);
    updateNote(); updatePartialUI();
  }
});
```

---

### 2j — Reset partial state on mode change

In `lockMode()`, when `newMode === 'trumpet'`, reset partial to 2 (4th harmonic default):

```javascript
if (newMode === 'trumpet') {
  currentPartial    = 2;
  targetPartial     = 2;
  partialHoldFrames = 0;
  updatePartialUI();
}
```

Also in `requestRescan()` reset partial state.

---

## Phase 3 — Z-depth calibration (per-session, ~45 min)

### Context

Currently `WHISTLE_HOVER_T`, `WHISTLE_PRESS_T`, `HOVER_T`, `PRESS_T` are hardcoded constants.
These work for an average hand at an average camera distance but fail at extremes.
A 2-gesture calibration fixes this per session.

### 3a — Add calibration state

```javascript
// Calibration state — null = using defaults
let cal = {
  whistle: { hoverZ: null, pressZ: null },  // measured from live hand
  trumpet: { hoverZ: null, pressZ: null },
};
let calPhase = null;   // null | 'hover' | 'press'
let calFrames = 0;
let calSamples = [];   // z-depth readings accumulated during calibration
const CAL_FRAMES = 30; // 1 second of samples
```

---

### 3b — Add `startCalibration(phase)` and `tickCalibration(depths)` functions

```javascript
function startCalibration(phase) {
  // phase: 'hover' | 'press'
  calPhase   = phase;
  calFrames  = 0;
  calSamples = [];
  showCalibrationOverlay(phase);
}

function tickCalibration(depths) {
  // depths: array of current raw z values for active fingers
  if (!calPhase) return;
  calSamples.push(...depths.filter(d => d > 0.01));
  calFrames++;
  updateCalibrationProgress(calFrames / CAL_FRAMES);

  if (calFrames >= CAL_FRAMES) {
    const mean = calSamples.reduce((a,b)=>a+b,0) / calSamples.length;
    const key  = mode === 'whistle' ? 'whistle' : 'trumpet';

    if (calPhase === 'hover') {
      cal[key].hoverZ = mean;
    } else {
      cal[key].pressZ = mean;
      // Apply: set thresholds at midpoints with 15% guard band
      const h = cal[key].hoverZ ?? 0.28;
      const p = mean;
      const range = p - h;
      if (mode === 'whistle') {
        // Rewrite module-level thresholds dynamically
        window._WHISTLE_HOVER_T = h + range * 0.15;
        window._WHISTLE_PRESS_T = h + range * 0.65;
      } else {
        window._HOVER_T = h + range * 0.15;
        window._PRESS_T = h + range * 0.65;
      }
    }
    calPhase = null;
    hideCalibrationOverlay();
  }
}
```

**Note for Claude Code:** After adding this, update `processWhistleHand()` and the trumpet
detection in `onHandResults()` to read `window._WHISTLE_HOVER_T ?? WHISTLE_HOVER_T`
(and equivalent) rather than the constants directly, so calibrated values override defaults.

---

### 3c — Calibration UI overlay

Add a full-overlay calibration modal inside `.cam-wrap` (hidden by default):

```html
<div id="calOverlay" style="display:none;position:absolute;inset:0;
  background:rgba(0,0,0,0.75);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;z-index:20;">
  <div id="calTitle" style="font-family:'Bebas Neue';font-size:2rem;
    color:var(--mode-c);letter-spacing:0.1em"></div>
  <div id="calInstr" style="font-size:0.7rem;color:var(--text);
    text-align:center;max-width:280px;line-height:1.8"></div>
  <div style="width:200px;height:4px;background:var(--border)">
    <div id="calProgress" style="height:100%;width:0%;background:var(--mode-c);
      transition:width 0.05s linear"></div>
  </div>
</div>
```

```javascript
function showCalibrationOverlay(phase) {
  const overlay = document.getElementById('calOverlay');
  overlay.style.display = 'flex';
  document.getElementById('calTitle').textContent =
    phase === 'hover' ? 'HOVER POSITION' : 'PRESS POSITION';
  document.getElementById('calInstr').textContent =
    phase === 'hover'
      ? 'Hold all fingers just above the template circles\nwithout touching. Hold still.'
      : 'Press all fingers firmly down onto the template circles. Hold still.';
  document.getElementById('calProgress').style.width = '0%';
}
function hideCalibrationOverlay() {
  document.getElementById('calOverlay').style.display = 'none';
}
function updateCalibrationProgress(pct) {
  document.getElementById('calProgress').style.width = (pct*100)+'%';
}
```

---

### 3d — Calibration buttons in controls

Add to each instrument panel (below the rescan button):

```html
<!-- In whistle panel -->
<div style="display:flex;gap:8px;justify-content:center;padding:0 22px 10px">
  <button class="rescan-btn" onclick="startCalibration('hover')">Calibrate hover</button>
  <button class="rescan-btn" onclick="startCalibration('press')">Calibrate press</button>
</div>

<!-- In trumpet panel — same -->
```

---

## Phase 4 — Print template generator (standalone Python script, ~1hr)

### Context

Players need physical templates to hold. This phase produces a separate Python script
`generate_templates.py` that outputs print-ready PDFs.

### Requirements

- **Whistle template:** 6 circles, 38mm diameter, 14mm gap, vertical layout, centred on A4.
  Each circle contains an ArUco 4x4 marker (IDs 0–5) at 28mm × 28mm.
  Label below each circle: "1" through "6", "Left hand" / "Right hand" divider.
  Thin registration border around page. Print at 300dpi.

- **Trumpet template:** 3 circles, 48mm diameter, 18mm gap, horizontal layout, centred on A4.
  Each circle contains an ArUco 4x4 marker (IDs 6–8) — different IDs from whistle to
  enable future hard ID-based discrimination.
  Label below each: "Valve 1", "Valve 2", "Valve 3".

- Both templates include:
  - Corner alignment marks (10mm crosses)
  - Instrument name and version string
  - "Hover — don't lift" instruction text in small type
  - QR code linking to the instrument URL (placeholder)

### Script outline

```python
# generate_templates.py
# Dependencies: pip install reportlab opencv-python numpy

import cv2
import numpy as np
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdf_canvas

A4_W, A4_H = A4  # points: 595.28 × 841.89

ARUCO_DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)

def generate_marker_png(marker_id, size_px):
    """Generate ArUco marker as numpy array."""
    img = np.zeros((size_px, size_px), dtype=np.uint8)
    img = cv2.aruco.generateImageMarker(ARUCO_DICT, marker_id, size_px, img, 1)
    return img

def draw_circle_with_marker(c, cx_pt, cy_pt, circle_r_pt, marker_id, label):
    """Draw a circle hole with embedded ArUco marker and label."""
    # Outer circle
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.5)
    c.circle(cx_pt, cy_pt, circle_r_pt, stroke=1, fill=0)
    # ArUco marker centred inside circle (75% of circle diameter)
    marker_size_pt = circle_r_pt * 1.5
    marker_px = 128
    img = generate_marker_png(marker_id, marker_px)
    # Save temp PNG, embed in PDF
    # ... (use reportlab ImageReader or temp file)
    # Label
    c.setFont("Helvetica", 10)
    c.drawCentredString(cx_pt, cy_pt - circle_r_pt - 14, label)

def generate_whistle_template(output_path):
    c = pdf_canvas.Canvas(output_path, pagesize=A4)
    # Title
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(A4_W/2, A4_H - 40, "CamInstrument — Tin Whistle Template")
    c.setFont("Helvetica", 8)
    c.drawCentredString(A4_W/2, A4_H - 56, "Hover fingers above circles — do not lift away")
    # 6 circles vertically
    circle_r = 27  # 19mm radius → 38mm diameter in points (1pt ≈ 0.353mm)
    gap = 20       # 14mm gap in points
    total_h = 6 * circle_r*2 + 5 * gap
    start_y = A4_H/2 + total_h/2 - circle_r
    cx = A4_W / 2
    for i in range(6):
        cy = start_y - i * (circle_r*2 + gap)
        label = f"{'Left' if i < 3 else 'Right'} {(i%3)+1}"
        draw_circle_with_marker(c, cx, cy, circle_r, i, label)
    # Hand divider line between hole 3 and 4
    mid_y = start_y - 2*(circle_r*2+gap) - circle_r - gap/2
    c.setDash(4, 4)
    c.line(cx - 60, mid_y, cx + 60, mid_y)
    c.setDash()
    c.setFont("Helvetica", 7)
    c.drawCentredString(cx - 80, mid_y - 3, "Left hand")
    c.drawCentredString(cx + 80, mid_y - 3, "Right hand")
    # Corner marks, border
    _draw_registration(c)
    c.save()

def generate_trumpet_template(output_path):
    c = pdf_canvas.Canvas(output_path, pagesize=A4)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(A4_W/2, A4_H - 40, "CamInstrument — Trumpet Template")
    c.setFont("Helvetica", 8)
    c.drawCentredString(A4_W/2, A4_H - 56, "Hover fingers above circles — do not lift away")
    circle_r = 34  # 24mm radius → 48mm diameter
    gap = 25       # 18mm gap
    total_w = 3 * circle_r*2 + 2 * gap
    start_x = A4_W/2 - total_w/2 + circle_r
    cy = A4_H / 2
    for i in range(3):
        cx = start_x + i * (circle_r*2 + gap)
        draw_circle_with_marker(c, cx, cy, circle_r, 6+i, f"Valve {i+1}")
    _draw_registration(c)
    c.save()

def _draw_registration(c):
    """Corner crosses and thin border."""
    margin = 20
    cross = 10
    for (x, y) in [(margin, margin), (A4_W-margin, margin),
                   (margin, A4_H-margin), (A4_W-margin, A4_H-margin)]:
        c.setLineWidth(0.5)
        c.line(x-cross, y, x+cross, y)
        c.line(x, y-cross, x, y+cross)

if __name__ == '__main__':
    generate_whistle_template('template_whistle.pdf')
    generate_trumpet_template('template_trumpet.pdf')
    print("Generated: template_whistle.pdf, template_trumpet.pdf")
```

**Claude Code task:** Implement this script fully, handling the ArUco marker embedding
correctly (temp PNG → reportlab Image). Test that output PDFs open in a PDF viewer
without errors and markers are clearly visible.

---

## Phase 5 — Graceful degradation and edge cases (~30 min)

These are robustness fixes that matter in classroom use.

### 5a — Single-hand whistle mode

Currently if only one hand is in frame, the missing hand's holes go `idle` (open).
This is correct but should show a visual warning rather than silent failure.

In `onHandResults`, when `mode === 'whistle'` and only one hand detected, show a
non-blocking banner: `"Only one hand detected — holes 1–3 or 4–6 open"`.

Add a small status line below the whistle holes diagram:
```html
<div id="handStatus" style="font-size:0.55rem;color:var(--muted);
  text-align:center;min-height:1rem;letter-spacing:0.08em"></div>
```

Update in `onHandResults`:
```javascript
const handStatus = document.getElementById('handStatus');
if (mode === 'whistle' && handStatus) {
  const count = results.multiHandLandmarks?.length || 0;
  handStatus.textContent = count === 2 ? '' :
    count === 1 ? (leftHandData ? 'right hand not detected' : 'left hand not detected') :
    'no hands detected';
}
```

---

### 5b — No face mesh fallback for trumpet partials

If `faceVisible` is false in trumpet mode, `currentPartial` stays at whatever it was.
This is acceptable but should show a warning and default to partial 2.

In `onFaceResults`, at the top where `faceVisible = false` is set:
```javascript
if (!faceVisible) {
  lipBlowing = false; lipAperture = 0;
  if (mode === 'trumpet') {
    // Default to 4th harmonic when face not visible
    if (currentPartial !== 2) { currentPartial = 2; updatePartialUI(); }
  }
  updateBreathUI(); return;
}
```

---

### 5c — Minimum air support gate per partial (trumpet)

Higher partials should require more breath to reach — preventing accidental register
jumps from a child blowing softly then tightening lips.

Add to `updateNote()` in the trumpet branch, after `matched` is found:

```javascript
// Minimum breathLevel required to sustain each partial
const PARTIAL_MIN_BREATH = [0.05, 0.10, 0.15, 0.22, 0.30];
const minBreath = PARTIAL_MIN_BREATH[Math.min(currentPartial, PARTIAL_MIN_BREATH.length-1)];
const hasEnoughAir = breathLevel >= minBreath || !isBlowing;
// If not enough air for this partial, show note but don't sound it
if (matched && isBlowing && !hasEnoughAir) {
  // Show note name dimmed, no sound
  noteBig.textContent = matched.name;
  noteBig.className   = 'note-big silent';
  noteSub.textContent = `need more air for ${TRUMPET_PARTIALS[currentPartial].label}`;
  stopNote();
  return; // skip normal note-play path
}
```

---

### 5d — Template loss detection

If the detected template leaves the frame mid-session (player sets it down), 
the instrument keeps playing on stale detections. Add a watchdog:

```javascript
let templateLastSeenFrame = 0;
let visionFrameCount = 0;
const TEMPLATE_TIMEOUT_FRAMES = 90; // 3s at 30fps

// In startVisionLoop frame(), increment counter each frame
visionFrameCount++;

// In runTemplateDetection, when result found: templateLastSeenFrame = visionFrameCount

// Add watchdog check in vision loop (after template is locked):
if (mode !== 'scanning' && !rescanRequested) {
  if (visionFrameCount - templateLastSeenFrame > TEMPLATE_TIMEOUT_FRAMES) {
    // Template lost — but don't auto-rescan, just warn
    document.getElementById('footerDetail').textContent =
      '⚠ template not visible · move template into frame';
  }
}
```

---

## Phase 6 — Polish (~20 min)

### 6a — Note transition smoothing for legato

When `playNote(freq)` is called with a new frequency, there's a brief gap because
`stopNote(true)` fades out before the new tone builds up. For legato playing this
is noticeable.

Fix: overlap the old and new tone by 30ms — start the new tone before stopping the old one.

```javascript
function playNote(freq) {
  if (currentFreq === freq) return;
  const prevTone = activeTone;   // hold reference
  const prevGain = dynGain;
  // Start new tone immediately
  activeTone  = buildTone(freq, mode);
  currentFreq = freq;
  breathLevel = breathLevel;
  applyDynamics();
  // Fade out previous tone over 30ms
  if (prevTone && prevGain) {
    prevGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.01);
    setTimeout(() => {
      prevTone.oscs.forEach(o => { try { o.stop(); } catch(e){} });
    }, 80);
  }
}
```

---

### 6b — `sec-label` for breath section clarification

Update the breath section label to hint at input modes. Change:
```html
<div class="sec-label">Breath</div>
```
to:
```html
<div class="sec-label">Air / Voice / Embouchure</div>
```

---

### 6c — Footer detail for trumpet mode

Update `updateModeUI()` trumpet detail string to mention partials:
```javascript
trumpet: 'B♭ · mediapipe hands z-depth · 3-valve · lip aperture partials',
```

---

## Testing checklist

Run through all of these after all phases complete:

**Template detection**
- [ ] Whistle template locks within 2s of being held steady
- [ ] Trumpet template locks within 2s of being held steady
- [ ] Holding both templates simultaneously doesn't crash (result: whichever has majority blobs wins)
- [ ] Removing template mid-session shows timeout warning without resetting mode
- [ ] Rescan button returns to scanning state cleanly

**Whistle**
- [ ] All 6 holes register independently, left and right hand
- [ ] Hovering above hole shows `hovering` state on hole button (depth fill visible)
- [ ] Tap velocity triggers note immediately without dwelling at threshold
- [ ] Finger fully lifted returns to `idle` (not stuck at `hovering`)
- [ ] One-hand-missing warning displays correctly
- [ ] D major scale playable in correct order (D E F# G A B C# D)
- [ ] Keyboard: Q-D holes + SPACE plays notes

**Trumpet**
- [ ] Valve hover shows `hovering` state on valve cap
- [ ] Valve press shows `pressed` state, stem depresses visually
- [ ] `[` and `]` keys cycle partials, note changes register correctly
- [ ] Lip aperture drives partial — partial changes show on register bars
- [ ] Hysteresis: rapidly puckering/relaxing lips doesn't cause rapid partial jumping
- [ ] No-face fallback: defaults to partial 2, no crash
- [ ] Min breath gate: very gentle breath on partial 4 suppresses sound
- [ ] Keyboard: 1-2-3 + SPACE plays correct valve combinations

**Breath / voice**
- [ ] Sustained blow gates note
- [ ] Humming/singing gates note (voice row shows activity)
- [ ] Both simultaneously shows "breath + voice" in status
- [ ] Lip aperture row shows activity when embouchure forms
- [ ] DYN bar tracks breath level dynamically
- [ ] Synth timbre audibly brightens from pp to ff
- [ ] SPACE key sets breathLevel to 0.7 for keyboard testing
- [ ] AEC prevents synth output from triggering mic gate

**Audio**
- [ ] No note gap during legato whistle runs (Phase 6a)
- [ ] Note cuts cleanly when breath stops (no hang)
- [ ] Changing fingering mid-breath does not produce a gap
- [ ] Volume at forte is comfortable, not distorted

**Calibration (Phase 3)**
- [ ] "Calibrate hover" starts calibration overlay
- [ ] Progress bar fills over 1 second
- [ ] After completing hover + press calibration, detection is more responsive to this hand
- [ ] Calibrated thresholds persist for session (reset on page reload is acceptable)

---

## Known deferred items (not in scope for this plan)

| Item | Reason deferred |
|---|---|
| Whistle second octave (overblowing) | Needs separate breath pressure + register detection |
| Ensemble / teacher station | Separate networking layer, separate plan |
| More scale modes (chromatic, minor, modes) | Extension of fingering table only |
| Trumpet mute / mouthpiece detection | Physical sensor territory |
| Recording and playback | Separate feature |
| Mobile (portrait) layout | Needs responsive CSS pass |
| Offline / PWA | ServiceWorker addition after main features stable |
