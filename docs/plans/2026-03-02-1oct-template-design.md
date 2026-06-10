# 1-Octave Mode + Enlarged Template Markers

**Goal:** Make the piano work reliably with the 1-octave template by enlarging all ArUco markers 50%+, moving key markers inside key boundaries, updating key detection geometry, and rendering only 1 octave in the UI.

## Template Changes (`piano_template_v3_1oct.html`)

- Key markers: 10mm → 15mm, moved from row above keys to top-center inside each key
- Ribbon markers: 8mm → 12mm
- Control markers: 10mm → 15mm
- Remove pitch letter labels below key markers
- Adjust grid spacing for larger control markers

## Key Detection (`key-detect.js`)

Rethink geometry: markers are now AT key tops, not above them.
- `computeKeyZoneParams` derives available keys from scanned markers (no hardcoded octave-2 IDs)
- Key zone extends downward from marker row (markers = top of keys)
- Black/white zone split unchanged (upper 60% = black zone)

## Piano Config (`piano-config.js`)

- `buildKeyboard(octave, octaveCount)` — new param, default 1
- `POSITION_TAGS` derived dynamically from keyboard build
- 1-octave: 8 white (C-C) + 5 black, tags 0-6, 8-12, 58

## UI (`PaperPiano.jsx`)

- SVG renders only the keys buildKeyboard returns
- OCT +/- still shifts the musical octave

## Files

- `piano_template_v3_1oct.html`
- `src/shared/engine/key-detect.js`
- `src/instruments/piano/piano-config.js`
- `src/instruments/piano/PaperPiano.jsx`
