# UI Redesign: Light, Simple, Fullscreen — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Paper Orchestra from a dark/ornate theme to a clean, light, monochrome design with Poppins font, full-width layouts, and minimal visible controls.

**Architecture:** Restyle via CSS theme tokens + Tailwind classes. No new UI dependencies. Same component tree, stripped-down visuals. Shared components get monochrome treatment, then each instrument page gets layout reorganization.

**Tech Stack:** Tailwind CSS v4 theme tokens, Poppins via Google Fonts, existing Radix primitives.

---

### Task 1: Add Poppins font and update theme tokens

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`

**Step 1: Add Poppins to index.html**

In `index.html`, add Google Fonts link inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
```

**Step 2: Replace theme tokens in index.css**

Replace the entire `@theme` block and body styles with:

```css
@import "tailwindcss";

@theme {
  --color-surface: #ffffff;
  --color-surface-raised: #f9fafb;
  --color-surface-overlay: #f3f4f6;
  --color-accent: #111827;
  --color-accent-warm: #374151;
  --color-accent-hot: #111827;
  --color-text-primary: #111827;
  --color-text-muted: #6b7280;
  --color-text-dim: #9ca3af;
  --color-text-faint: #d1d5db;
  --color-border: #e5e7eb;
  --color-border-accent: #9ca3af;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --font-family-display: "Poppins", sans-serif;
  --font-family-mono: "SF Mono", "Cascadia Code", "Fira Code", monospace;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-family: var(--font-family-display);
  overflow-x: hidden;
}

input[type=range] {
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #6b7280;
  cursor: pointer;
}
```

**Step 3: Verify in browser**

Run: visit `http://localhost:5174/` — page should now be white background with Poppins font. Colors will look broken until components are updated (expected).

**Step 4: Commit**

```bash
git add index.html src/index.css
git commit -m "feat: light monochrome theme with Poppins font"
```

---

### Task 2: Restyle shared UI components (StatusIndicator, ScanButton, Knob, MeterBar)

**Files:**
- Modify: `src/shared/components/ui/status-indicator.jsx`
- Modify: `src/shared/components/ui/scan-button.jsx`
- Modify: `src/shared/components/ui/knob.jsx`
- Modify: `src/shared/components/ui/meter-bar.jsx`

**Step 1: StatusIndicator — remove glow**

Replace entire file:

```jsx
const STATUS_COLORS = {
  loading: '#9ca3af',
  scan_needed: '#f59e0b',
  ready: '#22c55e',
  error: '#ef4444',
  scanning: '#3b82f6',
}

export default function StatusIndicator({ status = 'loading' }) {
  const color = STATUS_COLORS[status] || '#9ca3af'
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}
```

**Step 2: ScanButton — monochrome buttons**

Replace entire file:

```jsx
export default function ScanButton({ scanning, status, onScan, onReset }) {
  return (
    <div className="flex gap-2">
      {(status === 'ready' || status === 'scan_needed') && (
        <button
          onClick={onScan}
          className={`rounded-md px-3 py-1.5 text-xs border cursor-pointer transition-colors ${
            scanning
              ? 'bg-gray-900 border-gray-900 text-white animate-pulse'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      )}
      {status === 'ready' && (
        <button
          onClick={onReset}
          className="rounded-md px-3 py-1.5 text-xs border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50"
        >
          Reset
        </button>
      )}
    </div>
  )
}
```

**Step 3: Knob — gray styling**

Replace entire file:

```jsx
export default function Knob({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[0.65rem] text-gray-500 uppercase tracking-wide">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-[58px] cursor-pointer"
      />
      <div className="text-[0.65rem] text-gray-900 font-mono">
        {fmt ? fmt(value) : value}
      </div>
    </div>
  )
}
```

**Step 4: MeterBar — monochrome fill**

Replace entire file:

```jsx
import { cn } from '@shared/lib/utils'

export default function MeterBar({
  label,
  value = 0,
  direction = 'vertical',
  className,
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const isVert = direction === 'vertical'

  return (
    <div className={cn('flex items-center gap-1', isVert ? 'flex-col' : 'flex-row', className)}>
      {label && (
        <div className="text-[0.6rem] text-gray-400 tracking-wide uppercase">{label}</div>
      )}
      <div
        className={cn(
          'bg-gray-100 rounded border border-gray-200 relative overflow-hidden',
          isVert ? 'w-4 h-[72px]' : 'h-4 w-[72px]'
        )}
      >
        <div
          className="absolute bg-gray-400 transition-all duration-[40ms]"
          style={isVert
            ? { bottom: 0, left: 0, right: 0, height: `${pct}%` }
            : { left: 0, top: 0, bottom: 0, width: `${pct}%` }
          }
        />
      </div>
      <div className="text-[0.6rem] font-mono text-gray-400">{pct}%</div>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/shared/components/ui/status-indicator.jsx src/shared/components/ui/scan-button.jsx src/shared/components/ui/knob.jsx src/shared/components/ui/meter-bar.jsx
git commit -m "feat: monochrome shared UI components"
```

---

### Task 3: Restyle SettingsPanel, TransportControls, PianoRoll

**Files:**
- Modify: `src/shared/components/ui/settings-panel.jsx`
- Modify: `src/shared/components/ui/transport-controls.jsx`
- Modify: `src/shared/components/ui/piano-roll.jsx`

**Step 1: SettingsPanel — light panel**

Replace entire file:

```jsx
import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@shared/lib/utils'

export default function SettingsPanel({ open, onOpenChange, trigger, children, className }) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn('w-full', className)}>
      {trigger && (
        <Collapsible.Trigger asChild>
          {trigger}
        </Collapsible.Trigger>
      )}
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2 flex flex-col gap-4">
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
```

**Step 2: TransportControls — monochrome slots**

Replace entire file:

```jsx
import { cn } from '@shared/lib/utils'

export default function TransportControls({
  recordings = [],
  recArmed = false,
  recSlot = null,
  playSlot = null,
  bpm = 120,
  metroActive = false,
  onToggleArm,
  onSlotClick,
  onSlotClear,
  onTap,
  onBpmChange,
}) {
  return (
    <div className="w-full flex gap-2 items-center flex-wrap">
      <button
        onClick={onToggleArm}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer',
          recArmed
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
        )}
      >
        {recArmed ? '● REC' : 'REC'}
      </button>

      {recordings.map((rec, i) => {
        const isRec = recSlot === i
        const isPlay = playSlot === i
        const filled = !!rec
        return (
          <button
            key={i}
            onClick={() => onSlotClick(i)}
            onContextMenu={e => { e.preventDefault(); if (filled) onSlotClear(i) }}
            className={cn(
              'min-w-7 rounded-md px-1.5 py-1.5 text-xs font-mono border cursor-pointer',
              isRec && 'bg-gray-900 border-gray-900 text-white',
              isPlay && 'bg-gray-700 border-gray-700 text-white',
              !isRec && !isPlay && filled && 'bg-gray-100 border-gray-300 text-gray-700',
              !isRec && !isPlay && !filled && 'bg-white border-gray-200 text-gray-300'
            )}
          >
            {isRec ? '●' : isPlay ? '▶' : i + 1}
          </button>
        )
      })}

      <div className="ml-auto flex gap-2 items-center">
        {metroActive && (
          <span className="text-xs font-mono text-gray-500">{bpm} bpm</span>
        )}
        <button
          onClick={onTap}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer',
            metroActive
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          )}
        >
          {metroActive ? '■ TAP' : 'TAP'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: PianoRoll — monochrome notes**

Replace entire file:

```jsx
import { useReducer, useCallback } from 'react'

const MAX_ROLL = 64

function rollReducer(state, action) {
  if (action.type === 'ADD') {
    return [{ id: Date.now() + Math.random(), note: action.note, vel: action.vel }, ...state].slice(0, MAX_ROLL)
  }
  if (action.type === 'CLEAR') return []
  return state
}

export function usePianoRoll() {
  const [roll, dispatch] = useReducer(rollReducer, [])
  const addNote = useCallback((note, vel) => dispatch({ type: 'ADD', note, vel }), [])
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])
  return { roll, addNote, clear }
}

export default function PianoRoll({ roll = [] }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 h-16 overflow-hidden">
      <div className="text-[0.6rem] text-gray-400 tracking-wider mb-0.5">ROLL</div>
      <div className="flex gap-0.5 items-end h-[42px] overflow-x-hidden">
        {roll.map(e => (
          <div
            key={e.id}
            className="rounded-sm shrink-0 flex items-center justify-center text-[0.42rem] font-mono text-white font-medium bg-gray-900"
            style={{
              width: Math.max(7, e.vel * 15),
              height: Math.max(10, e.vel * 38),
            }}
          >
            {e.note}
          </div>
        ))}
        {!roll.length && (
          <span className="text-gray-300 text-xs italic">no notes yet</span>
        )}
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/shared/components/ui/settings-panel.jsx src/shared/components/ui/transport-controls.jsx src/shared/components/ui/piano-roll.jsx
git commit -m "feat: monochrome settings panel, transport controls, piano roll"
```

---

### Task 4: Restyle CameraOverlay and InstrumentShell

**Files:**
- Modify: `src/shared/components/ui/camera-overlay.jsx`
- Modify: `src/shared/components/ui/instrument-shell.jsx`

**Step 1: CameraOverlay — light border, no colored states**

Replace entire file:

```jsx
import { forwardRef } from 'react'
import { cn } from '@shared/lib/utils'

const CameraOverlay = forwardRef(function CameraOverlay(
  { videoRef, canvasRef, children, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative aspect-[4/3] rounded-lg overflow-hidden bg-black border border-gray-200',
        className
      )}
    >
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full block"
      />
      {children}
    </div>
  )
})

export default CameraOverlay
```

Note: removed `status` prop — border is always the same.

**Step 2: InstrumentShell — full-width, thin header, no sidebar, no gradients**

Replace entire file:

```jsx
import { cn } from '@shared/lib/utils'
import StatusIndicator from './status-indicator'

export default function InstrumentShell({
  name,
  fps = 0,
  handCount = 0,
  status = 'loading',
  statusMessage = '',
  children,
  onClickCapture,
  className,
}) {
  return (
    <div
      onClick={onClickCapture}
      className={cn(
        'min-h-screen bg-white text-gray-900 font-display',
        'flex flex-col items-center px-3 py-2 gap-2',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-5xl">
        <h1 className="text-sm font-medium text-gray-900">{name}</h1>
        <div className="flex gap-2 items-center">
          <span className="text-[0.65rem] font-mono text-gray-400">
            {fps} fps · {handCount} {handCount === 1 ? 'hand' : 'hands'}
          </span>
          <StatusIndicator status={status} />
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="w-full max-w-5xl text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
          {statusMessage}
        </div>
      )}

      {/* Content */}
      <div className="w-full max-w-5xl flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}
```

Key changes:
- Removed `version`, `sidebar`, `settings`, `orchestraBadge` props
- Removed gradient background
- Removed max-w-[600px], now `max-w-5xl` (1024px)
- Header is one line: name left, fps+status right
- Status message is a simple light bar

**Step 3: Commit**

```bash
git add src/shared/components/ui/camera-overlay.jsx src/shared/components/ui/instrument-shell.jsx
git commit -m "feat: full-width instrument shell, light camera overlay"
```

---

### Task 5: Restyle Launcher page

**Files:**
- Modify: `src/pages/Launcher.jsx`

**Step 1: Replace with monochrome card grid**

Replace entire file:

```jsx
import { Link } from 'react-router-dom'

const INSTRUMENTS = [
  { id: 'piano', name: 'Paper Piano', desc: '2-octave keyboard with chords, arps & ribbon', wave: 1 },
  { id: 'drum', name: 'Paper Drum', desc: 'Colour-ring pad kit with strike detection', wave: 1 },
  { id: 'wind', name: 'Paper Wind', desc: 'Whistle & trumpet with breath control', wave: 1 },
  { id: 'guitar', name: 'Paper Guitar', desc: 'Strum detection on printed fretboard', wave: 2 },
  { id: 'drum-machine', name: 'Paper Drum Machine', desc: 'Step sequencer with token programming', wave: 2 },
  { id: 'sequencer', name: 'Paper Sequencer', desc: 'Grid-based pattern sequencer', wave: 2 },
  { id: 'string', name: 'Paper String', desc: 'Bowed string instrument with gesture control', wave: 2 },
]

export default function Launcher() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Paper Orchestra</h1>
        <p className="text-sm text-gray-500 mt-1">Camera-based musical instruments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
        {INSTRUMENTS.map(inst => {
          const disabled = inst.wave > 1
          const Card = disabled ? 'div' : Link
          const props = disabled ? {} : { to: `/instrument/${inst.id}` }
          return (
            <Card
              key={inst.id}
              {...props}
              className={`relative rounded-lg border p-4 transition-colors no-underline ${
                disabled
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              <h2 className="text-sm font-medium text-gray-900">{inst.name}</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{inst.desc}</p>
              {disabled && (
                <span className="absolute top-3 right-3 text-[0.6rem] tracking-wider uppercase text-gray-400">
                  coming soon
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Verify in browser**

Visit `http://localhost:5174/` — should see white page, clean cards, Poppins font.

**Step 3: Commit**

```bash
git add src/pages/Launcher.jsx
git commit -m "feat: monochrome launcher with clean card grid"
```

---

### Task 6: Reorganize PaperPiano layout — camera/keys/controls/settings

This is the biggest task. PaperPiano needs layout restructuring: move most controls into settings, restyle piano SVG to monochrome with active key highlighting, and remove sidebar.

**Files:**
- Modify: `src/instruments/piano/PaperPiano.jsx`

**Step 1: Restructure the JSX return**

Replace the `return (...)` block (from `return (` to the closing `)` of the component) with the new layout. Key changes:

- Pass only `name`, `fps`, `handCount`, `status`, `statusMessage`, `onClickCapture` to InstrumentShell (removed `version`, `sidebar`, `orchestraBadge`)
- Camera overlay: remove colored chord/arp pills, keep simple status overlays with `bg-black/60 text-white` styling
- Piano SVG: white keys `fill="#fafafa" stroke="#d1d5db"`, black keys `fill="#1f2937"`, active white key `fill="#111827"` with white text, active black key `fill="#6b7280"`
- Control bar: just Scan, Reset, OCT +/-, and settings gear button — all monochrome
- Settings panel (collapsed): contains waveform, BPM, volume, reverb, ADSR, recording, piano roll, orchestra badge, meter bar, "all notes off", "clear roll"
- Back link: `text-gray-400 hover:text-gray-900`

The full replacement JSX for the return:

```jsx
  return (
    <InstrumentShell
      name="Paper Piano"
      fps={fps}
      handCount={handCount}
      status={status}
      statusMessage={message}
      onClickCapture={ensureAudio}
    >
      {/* Camera */}
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef}>
        {chordType && (
          <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white">
            {CHORD_TYPES[chordType]?.label}
          </div>
        )}
        {arpPattern !== 'off' && (
          <div className="absolute top-2 left-20 bg-black/60 rounded px-2 py-0.5 text-xs text-white">
            {ARP_PATTERNS[arpPattern]?.label} {ARP_RATES[arpRate]?.label}
          </div>
        )}
        {(sustain || sustainObj) && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white">
            {sustainObj ? 'HOLD' : 'SUSTAIN'}
          </div>
        )}
        {chord && !chordType && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-md px-3 py-0.5 text-sm font-medium text-white">
            {chord}
          </div>
        )}
      </CameraOverlay>

      {/* Piano keyboard */}
      <div className="w-full"><PianoSVG w={W} h={100} /></div>

      {/* Control bar */}
      <div className="flex items-center gap-2 w-full flex-wrap">
        <ScanButton scanning={scanning} status={status} onScan={startScan} onReset={resetScan} />
        <div className="flex items-center gap-1 border border-gray-200 rounded-md px-2 py-1">
          <span className="text-xs text-gray-500">OCT</span>
          <button onClick={() => setOctave(o => Math.max(2, o - 1))} className="text-gray-900 cursor-pointer bg-transparent border-none px-1 text-sm">−</button>
          <span className="font-mono text-sm text-gray-900 min-w-3.5 text-center">{octave}</span>
          <button onClick={() => setOctave(o => Math.min(5, o + 1))} className="text-gray-900 cursor-pointer bg-transparent border-none px-1 text-sm">+</button>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="rounded-md px-3 py-1.5 text-xs border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50"
          >
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings}>
        {/* Waveform */}
        <div className="flex gap-2 flex-wrap">
          {['sine', 'triangle', 'sawtooth', 'square'].map(w => (
            <button
              key={w}
              onClick={() => setWaveform(w)}
              className={`rounded-md px-3 py-1.5 text-xs border cursor-pointer ${
                waveform === w
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Knobs */}
        <div className="flex gap-4 flex-wrap justify-center">
          <Knob label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} fmt={v => `${Math.round(v * 100)}%`} />
          <Knob label="Reverb" value={reverbAmt} min={0} max={1} step={0.01} onChange={setReverbAmt} fmt={v => `${Math.round(v * 100)}%`} />
        </div>

        {/* ADSR */}
        <div className="border-t border-gray-200 pt-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider text-center mb-2 uppercase">Envelope</div>
          <div className="flex gap-4 flex-wrap justify-center">
            <Knob label="Atk" value={adsr.attack} min={0.005} max={2} step={0.005} onChange={v => setAdsr(a => ({ ...a, attack: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Dec" value={adsr.decay} min={0.01} max={2} step={0.01} onChange={v => setAdsr(a => ({ ...a, decay: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Sus" value={adsr.sustain} min={0} max={1} step={0.01} onChange={v => setAdsr(a => ({ ...a, sustain: v }))} fmt={v => `${Math.round(v * 100)}%`} />
            <Knob label="Rel" value={adsr.release} min={0.05} max={4} step={0.05} onChange={v => setAdsr(a => ({ ...a, release: v }))} fmt={v => `${v.toFixed(2)}s`} />
          </div>
        </div>

        {/* BPM */}
        <div className="border-t border-gray-200 pt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">BPM</span>
          <input type="number" value={bpm} min={40} max={240} onChange={e => setBpm(Number(e.target.value))} className="w-14 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 font-mono text-center outline-none" />
        </div>

        {/* Transport */}
        <div className="border-t border-gray-200 pt-3">
          <TransportControls
            recordings={recEngine.current.recordings}
            recArmed={recArmed}
            recSlot={recSlot}
            playSlot={playSlot}
            bpm={bpm}
            metroActive={metroActive}
            onToggleArm={() => { if (recSlot !== null) { synthRef.current.onRecord = null; recEngine.current.stopRecording(); setRecSlot(null) } setRecArmed(a => !a) }}
            onSlotClick={handleSlotClick}
            onSlotClear={(i) => { recEngine.current.clearSlot(i); if (playSlot === i) setPlaySlot(null) }}
            onTap={handleTap}
            onBpmChange={setBpm}
          />
        </div>

        {/* Piano roll */}
        <div className="border-t border-gray-200 pt-3">
          <PianoRoll roll={roll} />
        </div>

        {/* Ribbon / covered tags info */}
        <div className="border-t border-gray-200 pt-3 flex gap-4 items-center">
          <MeterBar label={ribbonMode.toUpperCase()} value={ribbonValue} direction="horizontal" />
          {coveredTags.size > 0 && (
            <div className="text-xs text-gray-400 font-mono">
              {[...coveredTags].slice(0, 4).map(tid => TAG_INV[tid] || `#${tid}`).join(', ')}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-center border-t border-gray-200 pt-3">
          <button onClick={clearRoll} className="px-3 py-1.5 rounded-md text-xs bg-white border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50">Clear roll</button>
          <button onClick={() => synthRef.current?.allNotesOff()} className="px-3 py-1.5 rounded-md text-xs bg-white border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50">All notes off</button>
        </div>
      </SettingsPanel>

      {/* Back link */}
      <Link to="/" className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-900 mt-1 no-underline">
        <ArrowLeft size={14} /> Back
      </Link>
    </InstrumentShell>
  )
```

**Step 2: Restyle PianoSVG (inside PaperPiano)**

Replace the PianoSVG function with monochrome version:

```jsx
  function PianoSVG({ w = 600, h = 100 }) {
    const N = kb.whites.length, wkW = w / N, bkW = wkW * 0.58, bkH = h * 0.62
    return (
      <svg width={w} height={h} style={{ display: 'block', margin: '0 auto' }}>
        {kb.whites.map((k, i) => {
          const active = activeKeys.has(k.id)
          return (
            <g key={k.id}>
              <rect x={i * wkW + 0.5} y={0.5} width={wkW - 1} height={h - 1} rx={3}
                fill={active ? '#111827' : '#fafafa'}
                stroke="#d1d5db" strokeWidth={1} />
              <text x={i * wkW + wkW / 2} y={h - 8} textAnchor="middle"
                fontSize={11} fontFamily="Poppins, sans-serif" fontWeight="500"
                fill={active ? '#ffffff' : '#9ca3af'}>{k.label}</text>
            </g>
          )
        })}
        {kb.blacks.map(k => {
          const active = activeKeys.has(k.id)
          const x = (k.leftWhiteIdx + 1) * wkW - bkW / 2
          return (
            <g key={k.id}>
              <rect x={x} y={0} width={bkW} height={bkH} rx={2}
                fill={active ? '#6b7280' : '#1f2937'}
                stroke={active ? '#6b7280' : '#111827'} strokeWidth={1} />
              <text x={x + bkW / 2} y={bkH - 6} textAnchor="middle"
                fontSize={8} fontFamily="monospace"
                fill={active ? '#ffffff' : '#6b7280'}>{k.label}</text>
            </g>
          )
        })}
      </svg>
    )
  }
```

**Step 3: Remove unused imports from PaperPiano**

Remove `OrchestraBadge` import and `useOrchestra` hook usage if not needed in settings. Keep orchestra functionality but don't render the badge in the main view (it moves into settings or is removed for now).

**Step 4: Verify in browser**

Visit `http://localhost:5174/instrument/piano` — should show full-width layout with light theme.

**Step 5: Commit**

```bash
git add src/instruments/piano/PaperPiano.jsx
git commit -m "feat: monochrome piano layout with minimal controls"
```

---

### Task 7: Restyle PaperDrum

**Files:**
- Modify: `src/instruments/drum/PaperDrum.jsx`

**Step 1: Update JSX return**

Key changes:
- Remove `version`, `orchestraBadge` props from InstrumentShell
- Pad list: `bg-gray-50 border-gray-200`, flash state: `bg-gray-900 text-white`
- Back link: `text-gray-400 hover:text-gray-900`
- Canvas overlays (in the vision loop): keep functional colors but simplify — scan ring `#22c55e`, flash ring `#111827`, idle ring `#9ca3af`

Replace the return block with:

```jsx
  return (
    <InstrumentShell
      name="Paper Drum"
      status={status}
      statusMessage={message}
      onClickCapture={() => audioManager.ensure()}
    >
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef} />

      {padStates.length > 0 && (
        <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider mb-1.5 uppercase">Pads</div>
          <div className="grid grid-cols-4 gap-2">
            {padStates.map((pad, i) => (
              <div
                key={pad.id}
                className={`rounded-md px-2 py-1.5 text-center text-xs border transition-all duration-100 ${
                  flashPads.has(i)
                    ? 'bg-gray-900 border-gray-900 text-white scale-105'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                <div className="font-mono text-[0.6rem] text-gray-400">#{pad.id}</div>
                <div className="font-medium">{pad.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap justify-center w-full">
        <ScanButton scanning={scanning} status={status} onScan={startScan} onReset={resetScan} />
      </div>

      <Link to="/" className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-900 mt-2 no-underline">
        <ArrowLeft size={14} /> Back
      </Link>
    </InstrumentShell>
  )
```

**Step 2: Update canvas draw colors in startVisionLoop**

In the scan section, change:
- `ctx.strokeStyle = '#7ad890'` → `ctx.strokeStyle = '#22c55e'`
- `ctx.fillStyle = 'rgba(122,216,144,0.15)'` → `ctx.fillStyle = 'rgba(34,197,94,0.15)'`

In the runtime tracking section, change:
- `ctx.strokeStyle = flash ? '#ffd166' : '#60c0ff'` → `ctx.strokeStyle = flash ? '#111827' : '#9ca3af'`
- `ctx.fillStyle = 'rgba(255,209,102,0.3)'` → `ctx.fillStyle = 'rgba(17,24,39,0.2)'`

**Step 3: Commit**

```bash
git add src/instruments/drum/PaperDrum.jsx
git commit -m "feat: monochrome drum layout"
```

---

### Task 8: Restyle PaperWind

**Files:**
- Modify: `src/instruments/wind/PaperWind.jsx`

**Step 1: Update JSX return**

Key changes:
- Remove `version`, `sidebar`, `orchestraBadge` from InstrumentShell
- Move MeterBar indicators into the main content (below camera, above fingering chart) as horizontal bars
- Fingering chart: `bg-gray-50 border-gray-200`, matched note: `bg-gray-900 text-white`, hole dots: pressed `bg-gray-900`, unpressed `bg-gray-200`
- Camera overlays: `bg-black/60 text-white`
- Back link: same style

Replace the return block with:

```jsx
  return (
    <InstrumentShell
      name="Paper Wind"
      fps={fps}
      handCount={handCount}
      status={status}
      statusMessage={message}
      onClickCapture={() => audioManager.ensure()}
    >
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef}>
        {mode === 'scanning' && scanProgress > 0 && (
          <div className="absolute bottom-2 left-2 right-2 h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${scanProgress * 100}%` }} />
          </div>
        )}
        {currentNote && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-md px-3 py-1 text-sm font-medium text-white">
            {currentNote.note}
          </div>
        )}
        {mode !== 'scanning' && (
          <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white uppercase tracking-wider">
            {mode}
          </div>
        )}
      </CameraOverlay>

      {/* Breath meters */}
      <div className="flex gap-4 items-center w-full">
        <MeterBar label="BREATH" value={breathLevel} direction="horizontal" />
        <MeterBar label="LIP" value={lipLevel} direction="horizontal" />
        <MeterBar label="MIC" value={micLevel} direction="horizontal" />
        {isBlowing && <span className="text-xs font-mono text-gray-900 animate-pulse">BLOWING</span>}
      </div>

      {mode === 'whistle' && (
        <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider mb-1.5 uppercase">Whistle fingering</div>
          <div className="flex gap-1.5 flex-wrap">
            {WHISTLE_NOTES.map((n, i) => {
              const matched = currentNote?.note === n.note
              return (
                <div key={i} className={`rounded-md px-2 py-1 text-xs border ${
                  matched ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500'
                }`}>
                  <div className="font-medium font-mono">{n.note}</div>
                  <div className="flex gap-0.5 mt-0.5">
                    {n.holes.map((h, j) => (
                      <div key={j} className={`w-2 h-2 rounded-full ${h ? 'bg-gray-900' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'trumpet' && (
        <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider mb-1.5 uppercase">Trumpet valves</div>
          <div className="flex gap-3 justify-center mb-2">
            {valveStates.map((pressed, i) => (
              <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                pressed ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-400'
              }`}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {TRUMPET_NOTES.map((n, i) => {
              const matched = currentNote?.note === n.note
              return (
                <div key={i} className={`rounded-md px-2 py-1 text-xs border ${
                  matched ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500'
                }`}>
                  <div className="font-medium font-mono">{n.note}</div>
                  <div className="flex gap-0.5 mt-0.5">
                    {n.v.map((h, j) => (
                      <div key={j} className={`w-2 h-2 rounded-full ${h ? 'bg-gray-900' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap justify-center w-full">
        {mode !== 'scanning' && (
          <button onClick={requestRescan} className="rounded-md px-3 py-1.5 text-xs border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50">
            Re-scan
          </button>
        )}
      </div>

      <Link to="/" className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-900 mt-2 no-underline">
        <ArrowLeft size={14} /> Back
      </Link>
    </InstrumentShell>
  )
```

**Step 2: Update canvas draw colors**

In `drawWhistleOverlay`:
- `pressed: '#ff4040'` → `'#111827'`
- `hovering: '#ffa030'` → `'#6b7280'`
- `idle: '#60c0ff'` → `'#9ca3af'`
- pressed fill: `'rgba(255,64,64,0.3)'` → `'rgba(17,24,39,0.2)'`

In `drawTrumpetOverlay`:
- `pressed: '#ff4040'` → `'#111827'`
- `idle: '#60c0ff'` → `'#9ca3af'`
- pressed fill: `'rgba(255,64,64,0.3)'` → `'rgba(17,24,39,0.2)'`

**Step 3: Commit**

```bash
git add src/instruments/wind/PaperWind.jsx
git commit -m "feat: monochrome wind layout"
```

---

### Task 9: Final verification and cleanup

**Step 1: Test all routes in browser**

- `http://localhost:5174/` — Launcher
- `http://localhost:5174/instrument/piano` — Piano
- `http://localhost:5174/instrument/drum` — Drum
- `http://localhost:5174/instrument/wind` — Wind

Verify:
- White backgrounds, no gradients
- Poppins font everywhere
- Monochrome buttons, borders, text
- Piano keys highlight in dark gray when active
- Camera feeds render (black until camera grants access)
- Settings panel expands/collapses
- No console errors from removed props

**Step 2: Fix any TypeScript/prop warnings**

Check console for React warnings about removed props being passed. If `CameraOverlay` no longer accepts `status`, ensure no callers pass it.

**Step 3: Commit all fixes**

```bash
git add -A
git commit -m "fix: cleanup prop warnings from UI redesign"
```
