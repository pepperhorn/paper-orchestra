# aruco-3d — Library Plan
### Generative 3D-printable ArUco markers, tokens and clips

A standalone library. Generates OpenSCAD files and/or STL/3MF output for any ArUco marker
in any form factor. Designed for Bambu A1 + AMS multi-colour printing but works with any
dual-extrusion or filament-swap printer.

Used by: pipe instrument clips, control tokens for all instruments in the series,
workshop sets, logo-branded blanks.

---

## What It Generates

```
aruco-3d/
├── src/
│   ├── index.js              # Public API
│   ├── aruco-bits.js         # ArUco dictionary → bit matrix
│   ├── geometry.js           # Form factor geometry builders
│   ├── scad-writer.js        # OpenSCAD code generator
│   ├── logo.js               # SVG → emboss geometry
│   └── registry.js           # Named token presets (instrument configs)
├── dictionaries/
│   ├── 4x4_50.json           # Standard ArUco dictionaries as JSON
│   ├── 4x4_100.json
│   ├── 5x5_50.json
│   └── 6x6_250.json
├── output/                   # Generated .scad and .stl files
├── cli.js                    # CLI: `aruco-3d generate --id 4 --form pipe-clip`
└── README.md
```

---

## Core Concept — Layer Strategy

ArUco detection needs high contrast. Two approaches, both supported:

### Strategy A — Raised Cells (AMS colour swap)
```
Layer 0–N:   white PLA base (entire form)
Layer N+1:   AMS swaps to black PLA
Layer N+1:   black cells printed on top of white face
Result:      raised black squares on white face — tactile + visual
```

### Strategy B — Recessed Cells (paint-fill friendly)
```
Single colour print (white or light grey)
ArUco cells are recessed cavities
User fills with black acrylic or marker pen
Result:      accessible single-colour print, user finishes
```

Both generated from the same input. `strategy: 'raised' | 'recessed'` parameter.

---

## Form Factors

### 1. `pipe-clip`
Snap-fit collar for 20mm OD PVC pipe. ArUco on flat forward face.

```
Parameters:
  pipe_od:        float   (default 20.4mm, clearance included)
  clip_height:    float   (default 28mm)
  clip_wall:      float   (default 3mm)
  aruco_id:       int
  aruco_dict:     string  (default '4x4_50')
  rotation_key:   bool    (default true — flat on inner bore)
  strategy:       string  (default 'raised')
```

### 2. `flat-token`
Round or square flat disc. Both faces usable:
- Front: ArUco pattern
- Back: blank / logo emboss / label text

```
Parameters:
  shape:          'round' | 'square' | 'hex'
  size:           float   (diameter or side length, default 40mm)
  thickness:      float   (default 4mm)
  aruco_id:       int
  back:           'blank' | 'logo' | 'text'
  logo_svg:       string  (path to SVG, if back: 'logo')
  back_text:      string  (if back: 'text')
  text_font:      string  (default 'Liberation Sans')
```

### 3. `stand-token`
Flat token with an integrated base so it stands upright on a table or music stand.
Used as control tokens (place on surface to trigger mode changes).

```
Parameters:
  ...all flat-token params
  base_style:     'wedge' | 'ring' | 'pin'
  base_height:    float   (default 20mm)
  tilt_angle:     float   (default 15° — faces camera at table level)
```

### 4. `wall-mount`
Larger format marker for room-scale tracking or stage use.
Screw or adhesive mount on back.

```
Parameters:
  size:           float   (default 80mm)
  mount:          'screw' | 'adhesive-pad' | 'magnetic'
  border:         float   (white border width, default 10mm)
```

### 5. `blank`
No ArUco. Just the form with logo emboss or plain. Used for:
- Workshop "no function" tokens (silences an instrument)
- Branded giveaways
- Placeholder in clip sets

---

## API

```js
import { generate } from 'aruco-3d';

// Pipe clip — top tuning clip, ID 2, pentatonic preset
generate({
  form: 'pipe-clip',
  aruco_id: 2,
  aruco_dict: '4x4_50',
  pipe_od: 20.4,
  strategy: 'raised',
  output: './output/top-clip-pentatonic.scad'
});

// Control token — round, logo on back
generate({
  form: 'flat-token',
  aruco_id: 10,
  shape: 'round',
  size: 45,
  back: 'logo',
  logo_svg: './assets/logo.svg',
  strategy: 'raised',
  output: './output/token-10.scad'
});

// Blank token with logo — no ArUco
generate({
  form: 'blank',
  shape: 'round',
  size: 45,
  back: 'logo',
  logo_svg: './assets/logo.svg',
  output: './output/blank-logo.scad'
});

// Batch — generate full set from registry
import { generateSet } from 'aruco-3d';

generateSet({
  registry: './instrument-registry.json',
  form: 'pipe-clip',
  output_dir: './output/clips/'
});
```

---

## ArUco Bit Matrix (`src/aruco-bits.js`)

Each ArUco marker is an NxN binary matrix. The library stores dictionaries as JSON,
decoded at generation time.

```js
// 4x4 dictionary entry for ID 0
{
  "id": 0,
  "bits": [
    [1,0,1,1],
    [0,0,0,1],
    [1,0,1,0],
    [0,1,0,1]
  ]
}
```

The white border (quiet zone) is always added automatically in the geometry layer —
dictionaries store only the inner data bits.

Cell size is calculated from available face area:
```
cell_size = (face_width - 2 × border) / (N + 2)
// N = inner bits, +2 for mandatory black outer ring
```

---

## OpenSCAD Output (`src/scad-writer.js`)

Generates clean, readable `.scad` files with all parameters at the top as variables.
This means:

1. File is human-editable after generation
2. Parametric — change `pipe_od = 21` and rerender
3. Version-controllable as text

Example output structure:

```scad
// Generated by aruco-3d
// Form: pipe-clip | ArUco ID: 2 | Dict: 4x4_50

// === Parameters ===
pipe_od       = 20.4;
clip_height   = 28;
clip_wall     = 3;
aruco_size    = 20;
aruco_border  = 2;
cell_size     = 4;   // (20 - 4) / 6 cells

// === Main ===
difference() {
  pipe_clip_body();
  pipe_bore();
  snap_gap();
}
aruco_face(id=2, strategy="raised");

// === Modules ===
module pipe_clip_body() { ... }
module aruco_face(id, strategy) { ... }
// etc.
```

---

## Logo Emboss (`src/logo.js`)

SVG → OpenSCAD emboss geometry pipeline:

```
SVG path → parse with svgdom or svg-parser
         → extract path outlines as polygon points
         → scale to fit token face (with margin)
         → extrude to emboss depth (default 0.6mm)
         → union or difference with token face
```

Two modes:
- **Raised logo** — `union()` with face surface
- **Debossed logo** — `difference()` from face surface

Raised works better for single-colour prints (tactile + visible).
Debossed works better for AMS two-colour (fill colour shows in the cavity).

Constraints:
- SVG must be single-colour (no gradients, no rasters)
- Minimum feature size: 1.5mm (print resolution)
- Library warns if path features are below threshold
- Auto-scales to fit available face minus quiet zone

---

## Registry (`src/registry.js`)

Named presets connecting ArUco IDs to instrument configurations.
Single source of truth used by both the 3D library and the app's `clip-registry.js`.

```js
// instrument-registry.json
{
  "top_clips": {
    "0": {
      "name": "G Standard",
      "root": "G3",
      "divisions": 24,
      "strings": [0, 7, 14],
      "mode": "chromatic",
      "label": "G STD"
    },
    "1": {
      "name": "D Standard",
      "root": "D3",
      "divisions": 24,
      "strings": [0, 7, 14],
      "mode": "chromatic",
      "label": "D STD"
    },
    "2": {
      "name": "G Pentatonic",
      "root": "G3",
      "divisions": 15,
      "strings": [0, 7, 14],
      "mode": "pentatonic",
      "label": "G PENT"
    }
  },
  "bottom_clips": {
    "1": { "name": "Standard",    "mode": "default",  "label": "STD"  },
    "2": { "name": "Snap",        "mode": "snap",     "label": "SNAP" },
    "3": { "name": "Latch",       "mode": "latch",    "label": "LTCH" },
    "4": { "name": "Loop",        "mode": "loop",     "label": "LOOP" },
    "5": { "name": "MIDI Out",    "mode": "midi",     "label": "MIDI" },
    "6": { "name": "Duet",        "mode": "duet",     "label": "DUET" }
  },
  "control_tokens": {
    "10": { "name": "Sustain",   "action": "sustain_on"  },
    "11": { "name": "Reverb",    "action": "reverb_on"   },
    "12": { "name": "Record",    "action": "loop_record" },
    "13": { "name": "Silence",   "action": "mute_all"    },
    "14": { "name": "Reset",     "action": "reset_state" }
  }
}
```

The label is auto-embossed on the back of each clip if `label_back: true`.

---

## CLI (`cli.js`)

```bash
# Generate a single clip
aruco-3d generate --id 2 --form pipe-clip --output ./output/

# Generate full set from registry
aruco-3d generate-set --registry ./instrument-registry.json --form pipe-clip

# Generate control token set
aruco-3d generate-set --registry ./instrument-registry.json --form stand-token

# Generate logo blank
aruco-3d blank --logo ./assets/logo.svg --form flat-token --shape round

# Preview in OpenSCAD (opens GUI)
aruco-3d preview --id 2 --form pipe-clip

# Export STL (requires OpenSCAD on PATH)
aruco-3d export --id 2 --form pipe-clip --format stl

# Export 3MF with AMS colour config (Bambu-ready)
aruco-3d export --id 2 --form pipe-clip --format 3mf --ams
```

---

## AMS / 3MF Colour Config

When exporting to `.3mf` for Bambu, the library generates the paint map automatically:

```
Extruder 1 (AMS slot 1): White PLA — body, base, background cells
Extruder 2 (AMS slot 2): Black PLA — ArUco dark cells
Extruder 3 (AMS slot 3): Accent colour — optional label text or logo
```

The `.3mf` file embeds the colour-per-face / colour-per-layer assignments so
Bambu Studio imports it ready to print — no manual painting step.

---

## Integration with Instrument Projects

```
pipe-instrument/
└── hardware/
    ├── clip/
    │   ├── aruco-clip.scad         ← generated by aruco-3d
    │   └── generate.js             ← calls aruco-3d API with registry
    └── tokens/
        ├── token-sustain.scad      ← generated
        └── token-silence.scad      ← generated
```

```js
// pipe-instrument/hardware/generate.js
import { generateSet } from 'aruco-3d';
import registry from '../instrument-registry.json';

generateSet({ registry, form: 'pipe-clip',    output_dir: './clip/' });
generateSet({ registry, form: 'stand-token',  output_dir: './tokens/' });
```

One command regenerates all hardware files when the registry changes.

---

## Future Form Factors

- `wrist-band` — curved marker that wraps around a wrist strap (body tracking)
- `hat-brim` — large flat marker for head tracking
- `floor-tile` — 100mm+ flat tile for room-scale instruments
- `card` — credit-card thickness, fits in a wallet, for sharing tuning configs

---

## Dependencies

| Package | Purpose |
|---|---|
| `svg-parser` | SVG path extraction for logo emboss |
| `openscad-js` | Optional — programmatic SCAD without string templating |
| `node-openscad` | CLI wrapper for STL/3MF export |
| `three` | Optional — in-browser preview of generated geometry |

OpenSCAD itself must be installed locally for STL/3MF export. SCAD generation
works without it — the output file can be opened manually.
