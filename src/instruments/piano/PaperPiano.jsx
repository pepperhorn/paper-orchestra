import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { buildKeyboard, TAG_INV, POSITION_TAGS, PRESS_VEL } from './piano-config'
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

  const kb = buildKeyboard(octave)

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
        setStatus('ready')
        setMessage(`Scan complete: ${n} markers learned. Place objects on buttons to activate modes!`)
      } else {
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

  // Main detection loop
  function onResults(results) {
    fpsRef.current.n++
    const now = Date.now()
    if (now - fpsRef.current.last >= 1000) { setFps(fpsRef.current.n); fpsRef.current = { n: 0, last: now } }

    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    setHandCount(results.multiHandLandmarks?.length || 0)

    // ArUco
    const arucoMarkers = detectMarkers(detRef.current, canvas)
    const visible = new Set(arucoMarkers.map(m => m.id))

    // Scan: learn positions
    if (scanRef.current) {
      for (const m of arucoMarkers) {
        const cx = m.corners.reduce((s, p) => s + p.x, 0) / 4
        const cy = m.corners.reduce((s, p) => s + p.y, 0) / 4
        knownMkrs.current[m.id] = { cx, cy }
      }
    }

    // Process frame (draw camera + fingertips + key detection)
    const { newlyPressed } = processFrame(results, {
      canvas, canvasCtx: ctx, markers: knownMkrs.current, positionTags: POSITION_TAGS,
      keyboard: kb, velTracker: velTrk.current, pressedRef, sustainRef, sustainHeld,
      sustainObj, chordType, arpPattern, arpRef, ribbonMode,
      synth: synthRef.current, buildChordNotes, setRibbonValue,
      dispatch: (action) => addNote(action.note, action.vel), status,
    })

    // Draw ArUco overlays
    drawMarkerOverlays(ctx, arucoMarkers)

    // Ghost markers
    const covered = detectCoveredMarkers(knownMkrs.current, visible, POSITION_TAGS)
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

  // Piano SVG
  const W = Math.min(600, typeof window !== 'undefined' ? window.innerWidth - 24 : 560)
  function PianoSVG({ w = 600, h = 140 }) {
    const N = kb.whites.length, wkW = w / N, bkW = wkW * 0.58, bkH = h * 0.62
    return (
      <svg width={w} height={h} style={{ display: 'block', margin: '0 auto', filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.6))' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5f0e8" /><stop offset="100%" stopColor="#e0d8c8" /></linearGradient>
          <linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd166" /><stop offset="100%" stopColor="#ff9020" /></linearGradient>
          <linearGradient id="bkn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#222" /><stop offset="100%" stopColor="#0a0a0a" /></linearGradient>
          <linearGradient id="bka" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff8020" /><stop offset="100%" stopColor="#cc5010" /></linearGradient>
        </defs>
        {kb.whites.map((k, i) => {
          const active = activeKeys.has(k.id)
          return (
            <g key={k.id}>
              <rect x={i * wkW + 1} y={1} width={wkW - 2} height={h - 2} rx={4} fill={active ? 'url(#wa)' : 'url(#wg)'} stroke={active ? '#e87010' : '#444'} strokeWidth={active ? 2 : 1} />
              {chordType && activeKeys.has(k.id) && <rect x={i * wkW + 2} y={2} width={wkW - 4} height={5} rx={2} fill="#ff4040" />}
              <text x={i * wkW + wkW / 2} y={h - 11} textAnchor="middle" fontSize={12} fontFamily="Georgia,serif" fontWeight="bold" fill={active ? '#7a3000' : '#666'}>{k.label}</text>
            </g>
          )
        })}
        {kb.blacks.map(k => {
          const active = activeKeys.has(k.id), x = (k.leftWhiteIdx + 1) * wkW - bkW / 2
          return (
            <g key={k.id}>
              <rect x={x} y={0} width={bkW} height={bkH} rx={3} fill={active ? 'url(#bka)' : 'url(#bkn)'} stroke={active ? '#ff6010' : '#000'} strokeWidth={1} />
              <text x={x + bkW / 2} y={bkH - 8} textAnchor="middle" fontSize={8} fontFamily="monospace" fill={active ? '#fff' : '#777'}>{k.label}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <InstrumentShell
      name="Paper Piano"
      version="PepperHorn x CRF · v3.1 · 2-Octave Marker-Based + Chord + Arp + Ribbon"
      fps={fps}
      handCount={handCount}
      status={status}
      statusMessage={message}
      onClickCapture={ensureAudio}
      sidebar={
        <div className="flex flex-col gap-2 items-center">
          <MeterBar label={ribbonMode.toUpperCase()} value={ribbonValue} color={ribbonMode === 'mod' ? '#60c0ff' : '#ffa030'} />
          {coveredTags.size > 0 && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-md p-1.5 w-[58px]">
              <div className="text-[0.52rem] text-text-dim mb-0.5">ACTIVE</div>
              {[...coveredTags].slice(0, 6).map(tid => (
                <div key={tid} className="text-[0.5rem] text-accent/80 font-mono leading-relaxed">{TAG_INV[tid] || `#${tid}`}</div>
              ))}
            </div>
          )}
        </div>
      }
    >
      {/* Camera */}
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef} status={status}>
        {/* Mode pills */}
        <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
          {chordType && <div className="bg-purple-600/75 rounded px-2 py-0.5 text-[0.65rem] text-purple-100">● {CHORD_TYPES[chordType]?.label}</div>}
          {arpPattern !== 'off' && <div className="bg-blue-600/75 rounded px-2 py-0.5 text-[0.65rem] text-blue-100">♩ {ARP_PATTERNS[arpPattern]?.label} {ARP_RATES[arpRate]?.label}</div>}
        </div>
        {chord && !chordType && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-md px-3 py-0.5 text-[0.95rem] font-bold text-accent font-display">{chord}</div>}
        {chordType && activeKeys.size > 0 && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-md px-3 py-0.5 text-[0.95rem] font-bold text-purple-300 font-display">{[...activeKeys][0]?.split(/\d/)[0]}{CHORD_TYPES[chordType]?.symbol}</div>}
        {(sustain || sustainObj) && <div className="absolute top-1.5 right-1.5 bg-info/30 border border-info/60 rounded px-2 py-0.5 text-[0.62rem] text-info">{sustainObj ? 'OBJ HOLD' : 'SUSTAIN'}</div>}
      </CameraOverlay>

      {/* Piano keyboard */}
      <div className="w-full mt-2"><PianoSVG w={W} h={130} /></div>

      {/* Piano roll */}
      <div className="w-full mt-2"><PianoRoll roll={roll} /></div>

      {/* Transport */}
      <div className="w-full mt-2 max-w-[600px]">
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

      {/* Controls */}
      <div className="flex gap-1.5 flex-wrap justify-center w-full max-w-[600px] mt-2">
        <div className="flex items-center gap-1 bg-white/[0.05] rounded-md px-2.5 py-0.5">
          <span className="text-[0.62rem] text-text-muted">OCT</span>
          <button onClick={() => setOctave(o => Math.max(2, o - 1))} className="text-text-primary cursor-pointer bg-transparent border-none px-1">−</button>
          <span className="font-mono text-accent min-w-3.5 text-center text-[0.9rem]">{octave}</span>
          <button onClick={() => setOctave(o => Math.min(5, o + 1))} className="text-text-primary cursor-pointer bg-transparent border-none px-1">+</button>
        </div>
        {['sine', 'triangle', 'sawtooth', 'square'].map(w => (
          <button key={w} onClick={() => setWaveform(w)} className={`rounded-md px-2 py-0.5 text-[0.68rem] border cursor-pointer ${waveform === w ? 'bg-accent/20 border-accent/50 text-accent' : 'bg-white/[0.05] border-white/10 text-text-muted'}`}>{w}</button>
        ))}
        <div className="flex items-center gap-1 bg-white/[0.05] rounded-md px-2 py-0.5">
          <span className="text-[0.62rem] text-text-muted">BPM</span>
          <input type="number" value={bpm} min={40} max={240} onChange={e => setBpm(Number(e.target.value))} className="w-10 bg-transparent border-none text-accent font-mono text-[0.82rem] text-center outline-none" />
        </div>
        <ScanButton scanning={scanning} status={status} onScan={startScan} onReset={resetScan} />
        <button onClick={() => setShowSettings(s => !s)} className="rounded-md px-2.5 py-0.5 text-[0.68rem] border cursor-pointer bg-white/[0.05] border-white/10 text-text-primary">{showSettings ? '▲' : 'settings'}</button>
      </div>

      {/* Settings panel */}
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings}>
        <div className="flex gap-3.5 flex-wrap justify-center">
          <Knob label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} fmt={v => `${Math.round(v * 100)}%`} />
          <Knob label="Reverb" value={reverbAmt} min={0} max={1} step={0.01} onChange={setReverbAmt} fmt={v => `${Math.round(v * 100)}%`} />
        </div>
        <div className="border-t border-white/[0.06] pt-2.5">
          <div className="text-[0.58rem] text-text-dim tracking-wider text-center mb-2">ADSR ENVELOPE</div>
          <div className="flex gap-3 flex-wrap justify-center">
            <Knob label="Atk" value={adsr.attack} min={0.005} max={2} step={0.005} onChange={v => setAdsr(a => ({ ...a, attack: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Dec" value={adsr.decay} min={0.01} max={2} step={0.01} onChange={v => setAdsr(a => ({ ...a, decay: v }))} fmt={v => `${v.toFixed(2)}s`} />
            <Knob label="Sus" value={adsr.sustain} min={0} max={1} step={0.01} onChange={v => setAdsr(a => ({ ...a, sustain: v }))} fmt={v => `${Math.round(v * 100)}%`} />
            <Knob label="Rel" value={adsr.release} min={0.05} max={4} step={0.05} onChange={v => setAdsr(a => ({ ...a, release: v }))} fmt={v => `${v.toFixed(2)}s`} />
          </div>
        </div>
        <div className="flex gap-1.5 justify-center border-t border-white/[0.06] pt-2.5">
          <button onClick={clearRoll} className="px-3 py-1 rounded-md text-[0.68rem] bg-white/[0.05] border border-white/10 text-text-primary cursor-pointer">Clear roll</button>
          <button onClick={() => synthRef.current?.allNotesOff()} className="px-3 py-1 rounded-md text-[0.68rem] bg-error/10 border border-error/30 text-error/80 cursor-pointer">All notes off</button>
        </div>
      </SettingsPanel>

      {/* Back link */}
      <Link to="/" className="flex items-center gap-1 text-text-dim text-sm hover:text-accent mt-2 no-underline">
        <ArrowLeft size={14} /> Back to launcher
      </Link>
    </InstrumentShell>
  )
}
