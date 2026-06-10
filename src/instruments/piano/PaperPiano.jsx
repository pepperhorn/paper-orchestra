import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { buildKeyboard, buildPositionTags, TAG_INV, PRESS_VEL } from './piano-config'
import { processCoveredTags, processFrame, drawMarkerOverlays } from './piano-engine'
import { CHORD_TYPES, buildChordNotes, detectChord } from '@shared/engine/chords'
import { ARP_PATTERNS, ARP_RATES, ArpEngine } from '@shared/engine/arp'
import { VelocityTracker } from '@shared/engine/velocity'
import { loadArucoLibrary, createDetector, detectMarkers } from '@shared/detection/aruco'
import { loadMediaPipeHands, createHandTracker } from '@shared/detection/hands'
import { initCamera } from '@shared/detection/camera'
import { detectCoveredMarkers } from '@shared/detection/ghost'
import { createSynthEngine } from '@shared/audio/synth'
import { createEffectsChain } from '@shared/audio/effects'
import { createRecordingEngine } from '@shared/audio/recorder'
import { audioManager } from '@shared/audio/manager'
import InstrumentShell from '@shared/components/ui/instrument-shell'
import CameraOverlay from '@shared/components/ui/camera-overlay'
import ScanButton from '@shared/components/ui/scan-button'
import Knob from '@shared/components/ui/knob'
import MeterBar from '@shared/components/ui/meter-bar'
import PianoRoll, { usePianoRoll } from '@shared/components/ui/piano-roll'
import TransportControls from '@shared/components/ui/transport-controls'
import SettingsPanel from '@shared/components/ui/settings-panel'
import { useTransport } from '@shared/hooks/use-transport'
import { useOrchestra } from '@shared/hooks/use-orchestra'
import OrchestraBadge from '@shared/components/ui/orchestra-badge'

export default function PaperPiano() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const synthRef = useRef(null)
  const effectsRef = useRef(null)
  const velTrk = useRef(new VelocityTracker())
  const pressedRef = useRef(new Set())
  const sustainRef = useRef(false)
  const sustainHeld = useRef(new Set())
  const knownMkrs = useRef({})
  const arpRef = useRef(null)
  const detRef = useRef(null)
  const fpsRef = useRef({ n: 0, last: Date.now() })
  const scanRef = useRef(false)
  const octUpDeb = useRef(0)
  const octDnDeb = useRef(0)
  const recEngine = useRef(createRecordingEngine())

  const [octave, setOctave] = useState(4)
  const [waveform, setWaveform] = useState('triangle')
  const [volume, setVolume] = useState(0.75)
  const [reverbAmt, setReverbAmt] = useState(0.25)
  const [adsr, setAdsr] = useState({ attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.3 })
  const [sustain, setSustain] = useState(false)
  const [activeKeys, setActiveKeys] = useState(new Set())
  const [coveredTags, setCoveredTags] = useState(new Set())
  const [chordType, setChordType] = useState(null)
  const [arpPattern, setArpPattern] = useState('off')
  const [arpRate, setArpRate] = useState('eighth')
  const [ribbonMode, setRibbonMode] = useState('mod')
  const [ribbonValue, setRibbonValue] = useState(0)
  const [sustainObj, setSustainObj] = useState(false)
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const [fps, setFps] = useState(0)
  const [handCount, setHandCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [chord, setChord] = useState(null)
  const [recArmed, setRecArmed] = useState(false)
  const [recSlot, setRecSlot] = useState(null)
  const [playSlot, setPlaySlot] = useState(null)

  const { roll, addNote, clear: clearRoll } = usePianoRoll()
  const { bpm, setBpm, metroActive, handleTap } = useTransport()
  const orchestra = useOrchestra({
    onBpmChange: (newBpm) => setBpm(newBpm),
    onKeyChange: (key, scale) => { /* future: transpose */ },
    onCommand: (cmd) => {
      if (cmd === 'mute') synthRef.current?.allNotesOff()
    },
  })

  const kb = buildKeyboard(octave, 1)
  const positionTags = buildPositionTags(kb)

  // Initialize audio
  function ensureAudio() {
    if (!synthRef.current) {
      audioManager.ensure()
      const effects = createEffectsChain({ reverbWet: reverbAmt })
      effects.toDestination()
      effectsRef.current = effects
      const synth = createSynthEngine({ waveform, adsr, volume: -6 })
      synth.connect(effects.input)
      synthRef.current = synth
      // Forward note events to orchestra
      const origNoteOn = synth.noteOn.bind(synth)
      const origNoteOff = synth.noteOff.bind(synth)
      synth.noteOn = (id, freq, vel, time) => {
        origNoteOn(id, freq, vel, time)
        orchestra.sendNoteEvent(id, freq, vel, 'on')
      }
      synth.noteOff = (id, time) => {
        origNoteOff(id, time)
        orchestra.sendNoteEvent(id, 0, 0, 'off')
      }
      arpRef.current = new ArpEngine(
        (id, freq, vel, t) => synth.noteOn(id, freq, vel, t),
        (id, t) => synth.noteOff(id, t)
      )
    }
  }

  // Sync settings
  useEffect(() => { synthRef.current?.setADSR(adsr) }, [adsr])
  useEffect(() => { synthRef.current?.setWaveform(waveform) }, [waveform])
  useEffect(() => {
    const db = volume <= 0 ? -Infinity : 20 * Math.log10(volume)
    synthRef.current?.setVolume(db)
  }, [volume])
  useEffect(() => { effectsRef.current?.setReverbWet(reverbAmt) }, [reverbAmt])

  // Arp sync
  useEffect(() => {
    if (arpRef.current) {
      arpRef.current.setPattern(arpPattern)
      arpRef.current.setRate(arpRate)
      arpRef.current.setBPM(bpm)
      if (arpPattern !== 'off') arpRef.current.start(); else arpRef.current.stop()
    }
  }, [arpPattern, arpRate, bpm])

  // Spacebar sustain
  useEffect(() => {
    const dn = e => { if (e.code === 'Space') { e.preventDefault(); sustainRef.current = true; setSustain(true) } }
    const up = e => {
      if (e.code === 'Space') {
        sustainRef.current = false; setSustain(false)
        for (const id of sustainHeld.current) { if (!pressedRef.current.has(id)) synthRef.current?.noteOff(id) }
        sustainHeld.current.clear()
      }
    }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // Load libraries + camera
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        await loadArucoLibrary('ARUCO_4X4_1000')
        if (cancelled) return
        detRef.current = createDetector('ARUCO_4X4_1000')

        await initCamera(videoRef.current)
        if (cancelled) return

        await loadMediaPipeHands()
        if (cancelled) return

        createHandTracker(videoRef.current, onResults, {
          maxHands: 2, complexity: 0, detection: 0.72, tracking: 0.55,
        })

        // Restore markers
        try {
          const saved = JSON.parse(localStorage.getItem('airpiano_v3_markers') || 'null')
          if (saved && Object.keys(saved).length >= 8) {
            knownMkrs.current = saved
            setStatus('ready')
            setMessage(`Restored ${Object.keys(saved).length} markers. Ready to play!`)
            return
          }
        } catch (_) {}
        setStatus('scan_needed')
        setMessage('Point camera at template and click Scan.')
      } catch (err) {
        if (!cancelled) { setStatus('error'); setMessage(err.message) }
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  function startScan() {
    ensureAudio()
    scanRef.current = true; knownMkrs.current = {}; setScanning(true)
    setMessage('Scanning... keep template visible for 2 seconds.')
    setTimeout(() => {
      scanRef.current = false; setScanning(false)
      const n = Object.keys(knownMkrs.current).length
      if (n >= 8) {
        try { localStorage.setItem('airpiano_v3_markers', JSON.stringify(knownMkrs.current)) } catch (_) {}
        const ids = Object.keys(knownMkrs.current).map(Number).sort((a, b) => a - b)
        console.log(`[Piano] Scan complete: ${n} markers learned [${ids.join(',')}]`)
        console.table(Object.fromEntries(ids.map(id => [id, { cx: Math.round(knownMkrs.current[id].cx), cy: Math.round(knownMkrs.current[id].cy) }])))
        setStatus('ready')
        setMessage(`Scan complete: ${n} markers learned. Place objects on buttons to activate modes!`)
      } else {
        console.warn(`[Piano] Scan failed: only ${n}/8 markers found`)
        setMessage(`Only ${n} markers found — need at least 8. Try again.`)
      }
    }, 2000)
  }

  function resetScan() {
    knownMkrs.current = {}; pressedRef.current.clear(); sustainHeld.current.clear()
    synthRef.current?.allNotesOff(); arpRef.current?.stop()
    setActiveKeys(new Set()); setCoveredTags(new Set())
    try { localStorage.removeItem('airpiano_v3_markers') } catch (_) {}
    setStatus('scan_needed'); setMessage('Markers cleared. Point camera at template and click Scan.')
  }

  // Recording handlers
  function handleSlotClick(i) {
    if (recArmed) {
      if (recSlot === i) {
        synthRef.current.onRecord = null
        recEngine.current.stopRecording()
        setRecSlot(null); setRecArmed(false)
      } else {
        if (recSlot !== null) { synthRef.current.onRecord = null; recEngine.current.stopRecording() }
        const cb = recEngine.current.startRecording(i)
        synthRef.current.onRecord = cb
        setRecSlot(i)
      }
    } else {
      if (playSlot === i) {
        recEngine.current.stopPlayback(); synthRef.current?.allNotesOff(); setPlaySlot(null)
      } else if (recEngine.current.hasRecording(i)) {
        ensureAudio()
        recEngine.current.stopPlayback(); synthRef.current?.allNotesOff()
        setPlaySlot(i)
        recEngine.current.playRecording(i,
          (id, freq, vel) => synthRef.current.noteOn(id, freq, vel),
          (id) => synthRef.current.noteOff(id),
          () => setPlaySlot(null)
        )
      }
    }
  }

  const debugRef = useRef({ last: 0, scanLogged: false })

  // Main detection loop
  function onResults(results) {
    fpsRef.current.n++
    const now = Date.now()
    if (now - fpsRef.current.last >= 1000) { setFps(fpsRef.current.n); fpsRef.current = { n: 0, last: now } }

    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const hands = results.multiHandLandmarks?.length || 0
    setHandCount(hands)

    // ArUco
    const arucoMarkers = detectMarkers(detRef.current, canvas)
    const visible = new Set(arucoMarkers.map(m => m.id))

    // Periodic debug summary (every 3s)
    if (now - debugRef.current.last >= 3000) {
      debugRef.current.last = now
      const ids = arucoMarkers.map(m => m.id).sort((a, b) => a - b)
      const known = Object.keys(knownMkrs.current).length
      console.log(`[Piano] ArUco: ${ids.length} visible [${ids.join(',')}] | Known: ${known} | Hands: ${hands} | Active: [${[...pressedRef.current].join(',')}] | Status: ${status}`)
    }

    // Scan: learn positions
    if (scanRef.current) {
      for (const m of arucoMarkers) {
        const cx = m.corners.reduce((s, p) => s + p.x, 0) / 4
        const cy = m.corners.reduce((s, p) => s + p.y, 0) / 4
        knownMkrs.current[m.id] = { cx, cy }
      }
      if (!debugRef.current.scanLogged && arucoMarkers.length > 0) {
        debugRef.current.scanLogged = true
        console.log(`[Piano] Scan: detecting markers...`, arucoMarkers.map(m => ({ id: m.id, cx: Math.round(m.corners.reduce((s, p) => s + p.x, 0) / 4), cy: Math.round(m.corners.reduce((s, p) => s + p.y, 0) / 4) })))
      }
    } else {
      debugRef.current.scanLogged = false
    }

    // Process frame (draw camera + fingertips + key detection)
    const { newlyPressed } = processFrame(results, {
      canvas, canvasCtx: ctx, markers: knownMkrs.current, positionTags: positionTags,
      keyboard: kb, velTracker: velTrk.current, pressedRef, sustainRef, sustainHeld,
      sustainObj, chordType, arpPattern, arpRef, ribbonMode,
      synth: synthRef.current, buildChordNotes, setRibbonValue,
      dispatch: (action) => addNote(action.note, action.vel), status,
    })

    // Draw ArUco overlays
    drawMarkerOverlays(ctx, arucoMarkers)

    // Ghost markers
    const covered = detectCoveredMarkers(knownMkrs.current, visible, positionTags)
    setCoveredTags(covered)

    // Mode state from covered tags
    const modes = processCoveredTags(covered, octUpDeb, octDnDeb, setOctave)
    setChordType(modes.chordType)
    setSustainObj(modes.sustainObj)
    setRibbonMode(modes.ribbonMode)
    if (modes.arpPattern !== arpPattern) setArpPattern(modes.arpPattern)
    if (modes.arpRate !== arpRate) setArpRate(modes.arpRate)

    // Release lifted keys
    for (const id of [...pressedRef.current]) {
      if (!newlyPressed.has(id)) {
        pressedRef.current.delete(id)
        if (!sustainRef.current && !modes.sustainObj && !sustainHeld.current.has(id)) synthRef.current?.noteOff(id)
      }
    }
    if (modes.sustainObj) for (const id of pressedRef.current) sustainHeld.current.add(id)
    setActiveKeys(new Set([...newlyPressed, ...sustainHeld.current]))

    // Chord detection
    const ss = new Set([...newlyPressed].map(id => { const k = kb.all.find(k => k.id === id); return k ? k.semi : null }).filter(s => s !== null))
    setChord(modes.chordType && newlyPressed.size > 0 ? null : detectChord(ss))
  }

  useEffect(() => {
    synthRef.current?.allNotesOff(); pressedRef.current.clear(); sustainHeld.current.clear(); setActiveKeys(new Set())
  }, [octave])

  // Piano SVG — uses viewBox coordinates, stretches to fill container
  function PianoSVG() {
    const vw = 800, vh = 400 // viewBox coordinate space
    const N = kb.whites.length, wkW = vw / N, bkW = wkW * 0.58, bkH = vh * 0.62
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <filter id="glow-green">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22c55e" floodOpacity="0.8" />
          </filter>
        </defs>
        {kb.whites.map((k, i) => {
          const active = activeKeys.has(k.id)
          return (
            <g key={k.id}>
              <rect x={i * wkW + 0.5} y={0.5} width={wkW - 1} height={vh - 1} rx={3}
                fill={active ? '#22c55e' : '#fafafa'}
                stroke={active ? '#16a34a' : '#d1d5db'} strokeWidth={active ? 2 : 1}
                filter={active ? 'url(#glow-green)' : undefined} />
              <text x={i * wkW + wkW / 2} y={vh - 14} textAnchor="middle"
                fontSize={18} fontFamily="Poppins, sans-serif" fontWeight="500"
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
                fill={active ? '#16a34a' : '#1f2937'}
                stroke={active ? '#22c55e' : '#111827'} strokeWidth={active ? 2 : 1}
                filter={active ? 'url(#glow-green)' : undefined} />
              <text x={x + bkW / 2} y={bkH - 10} textAnchor="middle"
                fontSize={14} fontFamily="monospace"
                fill={active ? '#ffffff' : '#6b7280'}>{k.label}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <InstrumentShell
      name="Paper Piano"
      fps={fps}
      handCount={handCount}
      status={status}
      statusMessage={message}
      onClickCapture={ensureAudio}
      className="h-screen overflow-hidden"
    >
      {/* Camera — maintains 4:3 ratio, height-limited, centered */}
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef} className="max-h-[40%] w-auto self-center shrink-0">
        {/* Mode pills */}
        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
          {chordType && <div className="bg-black/60 rounded px-2 py-0.5 text-xs text-white">{CHORD_TYPES[chordType]?.label}</div>}
          {arpPattern !== 'off' && <div className="bg-black/60 rounded px-2 py-0.5 text-xs text-white">{ARP_PATTERNS[arpPattern]?.label} {ARP_RATES[arpRate]?.label}</div>}
        </div>
        {chord && !chordType && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-md px-3 py-0.5 text-sm font-medium text-white">{chord}</div>}
        {chordType && activeKeys.size > 0 && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-md px-3 py-0.5 text-sm font-medium text-white">{[...activeKeys][0]?.split(/\d/)[0]}{CHORD_TYPES[chordType]?.symbol}</div>}
        {(sustain || sustainObj) && <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white">{sustainObj ? 'HOLD' : 'SUSTAIN'}</div>}
      </CameraOverlay>

      {/* Piano keyboard — fills remaining vertical space */}
      <div className="flex-1 min-h-0 w-full"><PianoSVG /></div>

      {/* Control bar */}
      <div className="flex items-center gap-2 w-full flex-wrap shrink-0">
        <ScanButton scanning={scanning} status={status} onScan={startScan} onReset={resetScan} />
        <div className="flex items-center gap-1 border border-gray-200 rounded-md px-2.5 py-1.5">
          <span className="text-xs text-gray-400">OCT</span>
          <button onClick={() => setOctave(o => Math.max(2, o - 1))} className="text-gray-900 cursor-pointer bg-transparent border-none px-1 text-sm font-medium">−</button>
          <span className="font-mono text-sm text-gray-900 min-w-4 text-center">{octave}</span>
          <button onClick={() => setOctave(o => Math.min(5, o + 1))} className="text-gray-900 cursor-pointer bg-transparent border-none px-1 text-sm font-medium">+</button>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="rounded-md px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            {showSettings ? 'Hide' : 'Settings'}
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
              className={`rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors ${
                waveform === w
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Volume + Reverb */}
        <div className="flex gap-4 flex-wrap justify-center">
          <Knob label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} fmt={v => `${Math.round(v * 100)}%`} />
          <Knob label="Reverb" value={reverbAmt} min={0} max={1} step={0.01} onChange={setReverbAmt} fmt={v => `${Math.round(v * 100)}%`} />
        </div>

        {/* ADSR */}
        <div className="border-t border-gray-200 pt-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider text-center mb-2 uppercase font-medium">Envelope</div>
          <div className="flex gap-4 flex-wrap justify-center">
            <Knob label="Atk" value={adsr.attack} min={0.005} max={2} step={0.005} onChange={v => setAdsr(a => ({ ...a, attack: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Dec" value={adsr.decay} min={0.01} max={2} step={0.01} onChange={v => setAdsr(a => ({ ...a, decay: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Sus" value={adsr.sustain} min={0} max={1} step={0.01} onChange={v => setAdsr(a => ({ ...a, sustain: v }))} fmt={v => `${Math.round(v * 100)}%`} />
            <Knob label="Rel" value={adsr.release} min={0.05} max={4} step={0.05} onChange={v => setAdsr(a => ({ ...a, release: v }))} fmt={v => `${v.toFixed(2)}s`} />
          </div>
        </div>

        {/* BPM */}
        <div className="border-t border-gray-200 pt-3 flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">BPM</span>
          <input type="number" value={bpm} min={40} max={240} onChange={e => setBpm(Number(e.target.value))} className="w-14 bg-white border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-900 font-mono text-center outline-none focus:border-gray-400" />
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

        {/* Ribbon / covered tags */}
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
          <button onClick={clearRoll} className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50">Clear roll</button>
          <button onClick={() => synthRef.current?.allNotesOff()} className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-500 cursor-pointer hover:bg-gray-50">All notes off</button>
        </div>
      </SettingsPanel>

      {/* Back link */}
      <Link to="/" className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-900 mt-1 no-underline transition-colors">
        <ArrowLeft size={14} /> Back
      </Link>
    </InstrumentShell>
  )
}
