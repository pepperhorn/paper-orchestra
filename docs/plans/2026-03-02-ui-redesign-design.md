# UI Redesign: Light, Simple, Fullscreen

**Date**: 2026-03-02
**Status**: Approved

## Brief

Simple, light, fullscreen-as-possible. shadcn-influenced (but Tailwind-only restyle, no shadcn install — we already have Radix). Monochrome palette. Poppins font. Inspired by the clean, whitespace-heavy piano template PDFs.

## Design Decisions

- **Approach**: Restyle existing components via theme tokens + Tailwind classes. No new dependencies except Poppins font.
- **Layout**: Split view — camera top (~60%), piano keys + controls bottom (~40%). Full viewport width.
- **Controls**: Minimal visible (Scan, Reset, Octave +/-, settings gear). Everything else behind collapsible settings panel.
- **Launcher**: Monochrome card grid, restyled.

## 1. Theme Tokens (`src/index.css`)

Replace dark palette with light monochrome:

| Token | Old | New |
|-------|-----|-----|
| `--color-surface` | `#0d0b14` | `#ffffff` |
| `--color-surface-raised` | `#161322` | `#f9fafb` |
| `--color-surface-overlay` | `#1e1a2e` | `#f3f4f6` |
| `--color-accent` | `#e8c97a` | `#111827` |
| `--color-accent-warm` | `#e8a030` | `#374151` |
| `--color-accent-hot` | `#ff6010` | `#111827` |
| `--color-text-primary` | `#d8d0e8` | `#111827` |
| `--color-text-muted` | `#8a8090` | `#6b7280` |
| `--color-text-dim` | `#6a6080` | `#9ca3af` |
| `--color-text-faint` | `#4a4060` | `#d1d5db` |
| `--color-border` | `rgba(255,255,255,0.08)` | `#e5e7eb` |
| `--color-border-accent` | `rgba(232,201,122,0.3)` | `#9ca3af` |
| `--color-success` | `#7ad890` | `#22c55e` |
| `--color-error` | `#e87878` | `#ef4444` |
| `--color-info` | `#60c0ff` | `#3b82f6` |
| `--color-warning` | `#e8c97a` | `#f59e0b` |
| `--font-family-display` | Georgia, serif | "Poppins", sans-serif |

Add Poppins via Google Fonts `<link>` in `index.html`.

Body: `background: #ffffff; color: #111827; font-family: "Poppins", sans-serif;`

Range inputs: gray thumb (`#6b7280`), gray track (`#e5e7eb`).

## 2. Launcher Page

- White background, no gradients
- "Paper Orchestra" in Poppins 600, gray-900, normal case
- Subtitle in gray-500
- Cards: `bg-white border border-gray-200 rounded-lg shadow-sm`
- Hover: `border-gray-300`
- No colored dots, no glows
- Wave 2 cards: 50% opacity, "coming soon" badge

## 3. Instrument Shell

- Remove `max-w-[600px]` constraint
- Use `max-w-5xl` on desktop, full width on mobile
- Remove background gradients
- Header: single thin line — name left, status dot + FPS right
- Remove version string
- Remove sidebar layout option — always stack vertically
- Orchestra badge, piano roll, transport controls, meter bar all move inside settings panel

## 4. Camera + Piano View

```
┌──────────────────────────────────────────────┐
│ Paper Piano                    ● Ready  12fps│
├──────────────────────────────────────────────┤
│                                              │
│              CAMERA FEED                     │
│           (aspect 4:3, centered)             │
│                                              │
├──────────────────────────────────────────────┤
│ ┌─C─┬─D─┬─E─┬─F─┬─G─┬─A─┬─B─┬─C'┐         │
│ │   │   │   │   │   │   │   │    │         │
│ └───┴───┴───┴───┴───┴───┴───┴────┘         │
├──────────────────────────────────────────────┤
│  [Scan]  [Reset]   OCT [−] 4 [+]     ⚙     │
└──────────────────────────────────────────────┘
```

- Camera: `aspect-[4/3]`, `rounded-lg`, `border border-gray-200`
- Key highlights: active white key → `bg-gray-900 text-white`, active black key → `bg-gray-500`
- Piano SVG: light key fill `#fafafa`, borders `#d1d5db`, black keys `#1f2937`
- Control bar: `border-t border-gray-200`, `py-2`, flex row
- Status overlays on camera: semi-transparent `bg-black/60 text-white` pills
- Settings gear → opens Radix collapsible below control bar

## 5. Settings Panel (collapsed by default)

Contains all advanced controls in a clean grid:
- Waveform selector (buttons)
- BPM + tap tempo
- Volume, Reverb (range sliders)
- ADSR knobs
- Recording slots
- Piano roll
- Orchestra badge
- Meter bar
- "All notes off" / "Clear roll" actions

Styled with `bg-gray-50 border-t border-gray-200`, internal sections separated by light dividers.

## 6. Component Styling Notes

- **Buttons**: `bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50`
- **Active buttons**: `bg-gray-900 text-white border-gray-900`
- **Status dot**: Simple 8px circle, colored (green/red/yellow), no glow/shadow
- **ScanButton**: Same button style, scanning state uses `animate-pulse`
- **Knob**: Restyle range input with gray thumb
- **CameraOverlay**: Remove colored border states, just `border-gray-200` always

## 7. Files Changed

1. `index.html` — Add Poppins font link
2. `src/index.css` — Replace all theme tokens
3. `src/shared/components/ui/instrument-shell.jsx` — Full-width layout, thin header, remove sidebar
4. `src/shared/components/ui/camera-overlay.jsx` — Light border styling
5. `src/shared/components/ui/status-indicator.jsx` — Remove glow, simpler dot
6. `src/shared/components/ui/scan-button.jsx` — Monochrome button style
7. `src/shared/components/ui/knob.jsx` — Gray range styling
8. `src/shared/components/ui/meter-bar.jsx` — Monochrome fill
9. `src/shared/components/ui/transport-controls.jsx` — Monochrome buttons
10. `src/shared/components/ui/settings-panel.jsx` — Light panel style
11. `src/shared/components/ui/piano-roll.jsx` — Monochrome note colors
12. `src/pages/Launcher.jsx` — Light cards, remove gradients/colors
13. `src/instruments/piano/PaperPiano.jsx` — Reorganize layout (camera → keys → controls → settings), monochrome piano SVG, move advanced controls into settings panel
14. `src/instruments/drum/PaperDrum.jsx` — Same layout pattern
15. `src/instruments/wind/PaperWind.jsx` — Same layout pattern
