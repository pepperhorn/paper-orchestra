import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { WHISTLE_NOTES, TRUMPET_NOTES } from './wind-config'
import { TemplateDetector, WhistleEngine, TrumpetEngine, BreathFusion } from './wind-engine'
import { initCamera } from '@shared/detection/camera'
import { loadMediaPipeHands, createHandTracker } from '@shared/detection/hands'
import { loadFaceMesh, createFaceMeshTracker } from '@shared/detection/face-mesh'
import { createMicAnalyser } from '@shared/audio/mic-analyser'
import { audioManager } from '@shared/audio/manager'
import InstrumentShell from '@shared/components/ui/instrument-shell'
import CameraOverlay from '@shared/components/ui/camera-overlay'
import MeterBar from '@shared/components/ui/meter-bar'

export default function PaperWind() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const analysisCanvasRef = useRef(null)
  const templateDetRef = useRef(new TemplateDetector())
  const whistleRef = useRef(new WhistleEngine())
  const trumpetRef = useRef(new TrumpetEngine())
  const breathRef = useRef(new BreathFusion())
  const micRef = useRef(null)
  const animRef = useRef(null)
  const oscRef = useRef(null) // current playing oscillator
  const gainRef = useRef(null)
  const filterRef = useRef(null)

  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState('scanning') // scanning | whistle | trumpet
  const [currentNote, setCurrentNote] = useState(null)
  const [isBlowing, setIsBlowing] = useState(false)
  const [breathLevel, setBreathLevel] = useState(0)
  const [lipLevel, setLipLevel] = useState(0)
  const [micLevel, setMicLevel] = useState(0)
  const [fps, setFps] = useState(0)
  const [handCount, setHandCount] = useState(0)
  const [holeStates, setHoleStates] = useState([])
  const [valveStates, setValveStates] = useState([false, false, false])
  const [scanProgress, setScanProgress] = useState(0)
  const fpsRef = useRef({ n: 0, last: Date.now() })
  const blobsRef = useRef([])

  // Initialize everything
  useEffect(() => {
    let cancelled = false
    const analysisCanvas = document.createElement('canvas')
    analysisCanvas.width = 640
    analysisCanvas.height = 480
    analysisCanvasRef.current = analysisCanvas

    async function init() {
      try {
        await initCamera(videoRef.current)
        if (cancelled) return

        // Load MediaPipe
        await loadMediaPipeHands()
        if (cancelled) return
        createHandTracker(videoRef.current, onHandResults, {
          maxHands: 2, complexity: 1, detection: 0.65, tracking: 0.6,
        })

        // Load FaceMesh
        try {
          await loadFaceMesh()
          if (cancelled) return
          const fm = createFaceMeshTracker(videoRef.current, onFaceResults)
          // FaceMesh needs to be sent frames — we piggyback on the hand tracker's camera
        } catch (e) { console.warn('FaceMesh unavailable:', e) }

        // Start mic
        micRef.current = createMicAnalyser()
        try {
          await audioManager.ensure()
          await micRef.current.start(audioManager.getContext())
          micRef.current.onUpdate = (data) => {
            breathRef.current.updateMic(data)
            setMicLevel(data.rms / 0.12)
          }
        } catch { console.warn('Mic unavailable') }

        setStatus('scan_needed')
        setMessage('Hold a printed whistle or trumpet template in front of the camera.')
        startVisionLoop()
      } catch (err) {
        if (!cancelled) { setStatus('error'); setMessage(err.message) }
      }
    }
    init()
    return () => {
      cancelled = true
      if (animRef.current) cancelAnimationFrame(animRef.current)
      micRef.current?.stop()
      stopNote()
    }
  }, [])

  function onHandResults(results) {
    fpsRef.current.n++
    const now = Date.now()
    if (now - fpsRef.current.last >= 1000) { setFps(fpsRef.current.n); fpsRef.current = { n: 0, last: now } }
    setHandCount(results.multiHandLandmarks?.length || 0)

    const W = canvasRef.current?.width || 640, H = canvasRef.current?.height || 480

    if (mode === 'whistle') {
      whistleRef.current.processHands(results.multiHandLandmarks, W, H)
      setHoleStates([...whistleRef.current.fingerStates])
      updateNote()
    } else if (mode === 'trumpet') {
      trumpetRef.current.processHands(results.multiHandLandmarks, W, H, blobsRef.current)
      setValveStates([...trumpetRef.current.valveStates])
      updateNote()
    }
  }

  function onFaceResults(results) {
    const W = canvasRef.current?.width || 640, H = canvasRef.current?.height || 480
    breathRef.current.updateFace(results.multiFaceLandmarks, W, H)
    setLipLevel(breathRef.current.lipAperture / 0.08)
    setIsBlowing(breathRef.current.isBlowing)
    setBreathLevel(breathRef.current.dynamics)
  }

  function updateNote() {
    let matched = null
    if (mode === 'whistle') {
      matched = whistleRef.current.matchNote()
    } else if (mode === 'trumpet') {
      matched = trumpetRef.current.matchNote()
    }

    if (breathRef.current.isBlowing && matched) {
      playNote(matched.freq, breathRef.current.dynamics)
      setCurrentNote(matched)
    } else {
      stopNote()
      setCurrentNote(null)
    }
  }

  function playNote(freq, dynamics) {
    const ctx = audioManager.getContext()
    if (!ctx) return

    if (!oscRef.current) {
      // Create oscillator stack for rich timbre
      const osc = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()

      osc.type = mode === 'whistle' ? 'sine' : 'sawtooth'
      filter.type = 'lowpass'
      filter.frequency.value = 2000
      filter.Q.value = 2
      gain.gain.value = 0

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()

      oscRef.current = osc
      filterRef.current = filter
      gainRef.current = gain
    }

    // Update pitch and dynamics
    const t = ctx.currentTime
    oscRef.current.frequency.setTargetAtTime(freq, t, 0.03)
    gainRef.current.gain.setTargetAtTime(Math.min(0.5, dynamics * 0.6), t, 0.02)
    filterRef.current.frequency.setTargetAtTime(800 + dynamics * 3000, t, 0.02)
  }

  function stopNote() {
    if (oscRef.current && gainRef.current) {
      const ctx = audioManager.getContext()
      if (ctx) {
        gainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
        const osc = oscRef.current
        setTimeout(() => { try { osc.stop() } catch {} }, 200)
      }
      oscRef.current = null
      filterRef.current = null
      gainRef.current = null
    }
  }

  function startVisionLoop() {
    function frame() {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video || video.readyState < 2) {
        animRef.current = requestAnimationFrame(frame)
        return
      }

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()

      // Template detection when scanning
      if (mode === 'scanning') {
        const actx = analysisCanvasRef.current.getContext('2d')
        actx.save(); actx.scale(-1, 1); actx.drawImage(video, -640, 0, 640, 480); actx.restore()
        const imgData = actx.getImageData(0, 0, 640, 480)
        const result = templateDetRef.current.detect(imgData, 640, 480)

        if (result?.template) {
          blobsRef.current = result.blobs
          setMode(result.template)
          setStatus('ready')
          setMessage(`Detected: ${result.template}. ${result.template === 'whistle' ? 'Cover holes with fingers' : 'Press valves'} and blow to play!`)
          if (result.template === 'whistle') {
            whistleRef.current.setHoles(result.blobs)
          }
        } else if (result?.pending) {
          setScanProgress(result.progress)
        }
      }

      // Draw hole/valve overlays
      if (mode === 'whistle') {
        drawWhistleOverlay(ctx)
      } else if (mode === 'trumpet') {
        drawTrumpetOverlay(ctx)
      }

      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
  }

  function drawWhistleOverlay(ctx) {
    const holes = whistleRef.current.holePositions
    const states = whistleRef.current.fingerStates
    holes.forEach((hole, i) => {
      const state = states[i]
      ctx.beginPath()
      ctx.arc(hole.cx, hole.cy, hole.r, 0, Math.PI * 2)
      ctx.strokeStyle = state === 'pressed' ? '#ff4040' : state === 'hovering' ? '#ffa030' : '#60c0ff'
      ctx.lineWidth = state === 'pressed' ? 4 : 2
      ctx.stroke()
      if (state === 'pressed') {
        ctx.fillStyle = 'rgba(255,64,64,0.3)'
        ctx.fill()
      }
    })
  }

  function drawTrumpetOverlay(ctx) {
    const blobs = blobsRef.current
    const vs = trumpetRef.current.valveStates
    blobs.forEach((blob, i) => {
      ctx.beginPath()
      ctx.arc(blob.cx, blob.cy, 20, 0, Math.PI * 2)
      ctx.strokeStyle = vs[i] ? '#ff4040' : '#60c0ff'
      ctx.lineWidth = vs[i] ? 4 : 2
      ctx.stroke()
      if (vs[i]) { ctx.fillStyle = 'rgba(255,64,64,0.3)'; ctx.fill() }
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`V${i + 1}`, blob.cx, blob.cy + 4)
    })
  }

  function requestRescan() {
    setMode('scanning')
    setStatus('scan_needed')
    setMessage('Hold a printed template in front of the camera.')
    templateDetRef.current = new TemplateDetector()
    whistleRef.current.reset()
    blobsRef.current = []
    stopNote()
    setScanProgress(0)
  }

  return (
    <InstrumentShell
      name="Paper Wind"
      version="PepperHorn x CRF · Whistle + Trumpet · Breath-controlled"
      fps={fps}
      handCount={handCount}
      status={status}
      statusMessage={message}
      onClickCapture={() => audioManager.ensure()}
      sidebar={
        <div className="flex flex-col gap-2 items-center">
          <MeterBar label="BREATH" value={breathLevel} color="#60c0ff" />
          <MeterBar label="LIP" value={lipLevel} color="#ff8040" />
          <MeterBar label="MIC" value={micLevel} color="#7ad890" />
          {isBlowing && (
            <div className="text-[0.58rem] text-success font-mono animate-pulse">BLOWING</div>
          )}
        </div>
      }
    >
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef} status={status}>
        {/* Scan progress */}
        {mode === 'scanning' && scanProgress > 0 && (
          <div className="absolute bottom-2 left-2 right-2 h-2 bg-black/60 rounded-full overflow-hidden">
            <div className="h-full bg-info rounded-full transition-all" style={{ width: `${scanProgress * 100}%` }} />
          </div>
        )}
        {/* Current note */}
        {currentNote && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-md px-3 py-1 text-lg font-bold text-accent font-display">
            {currentNote.note}
          </div>
        )}
        {/* Mode badge */}
        {mode !== 'scanning' && (
          <div className="absolute top-1.5 left-1.5 bg-info/70 rounded px-2 py-0.5 text-[0.65rem] text-white uppercase tracking-wider">
            {mode}
          </div>
        )}
      </CameraOverlay>

      {/* Fingering chart */}
      {mode === 'whistle' && (
        <div className="w-full mt-2 bg-white/[0.04] border border-white/[0.08] rounded-lg p-2.5">
          <div className="text-[0.58rem] text-text-dim tracking-wider mb-1.5">WHISTLE FINGERING</div>
          <div className="flex gap-1.5 flex-wrap">
            {WHISTLE_NOTES.map((n, i) => {
              const matched = currentNote?.note === n.note
              return (
                <div key={i} className={`rounded-md px-2 py-1 text-[0.62rem] border ${
                  matched ? 'bg-accent/25 border-accent/60 text-accent' : 'bg-white/[0.04] border-white/10 text-text-muted'
                }`}>
                  <div className="font-bold font-mono">{n.note}</div>
                  <div className="flex gap-0.5 mt-0.5">
                    {n.holes.map((h, j) => (
                      <div key={j} className={`w-2 h-2 rounded-full ${h ? 'bg-error' : 'bg-white/20'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'trumpet' && (
        <div className="w-full mt-2 bg-white/[0.04] border border-white/[0.08] rounded-lg p-2.5">
          <div className="text-[0.58rem] text-text-dim tracking-wider mb-1.5">TRUMPET VALVES</div>
          <div className="flex gap-3 justify-center mb-2">
            {valveStates.map((pressed, i) => (
              <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
                pressed ? 'bg-error/30 border-error text-error' : 'bg-white/[0.05] border-white/20 text-text-muted'
              }`}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {TRUMPET_NOTES.map((n, i) => {
              const matched = currentNote?.note === n.note
              return (
                <div key={i} className={`rounded-md px-2 py-1 text-[0.62rem] border ${
                  matched ? 'bg-accent/25 border-accent/60 text-accent' : 'bg-white/[0.04] border-white/10 text-text-muted'
                }`}>
                  <div className="font-bold font-mono">{n.note}</div>
                  <div className="flex gap-0.5 mt-0.5">
                    {n.v.map((h, j) => (
                      <div key={j} className={`w-2 h-2 rounded-full ${h ? 'bg-error' : 'bg-white/20'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-1.5 flex-wrap justify-center w-full max-w-[600px] mt-2">
        {mode !== 'scanning' && (
          <button onClick={requestRescan} className="rounded-md px-2.5 py-0.5 text-[0.68rem] border cursor-pointer bg-warning/10 border-warning/40 text-warning">
            Re-scan
          </button>
        )}
      </div>

      <Link to="/" className="flex items-center gap-1 text-text-dim text-sm hover:text-accent mt-4 no-underline">
        <ArrowLeft size={14} /> Back to launcher
      </Link>
    </InstrumentShell>
  )
}
