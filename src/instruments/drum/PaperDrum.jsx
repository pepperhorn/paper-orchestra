import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ARUCO_DICT, PAD_COUNT, DEFAULT_SAMPLES } from './drum-config'
import { StrikeDetector, PadRegistry } from './drum-engine'
import { loadArucoLibrary, createDetector, detectMarkers, markerCenter } from '@shared/detection/aruco'
import { initCamera } from '@shared/detection/camera'
import { sampleColourSignature, trackColourPresence } from '@shared/detection/colour-blob'
import { audioManager } from '@shared/audio/manager'
import InstrumentShell from '@shared/components/ui/instrument-shell'
import CameraOverlay from '@shared/components/ui/camera-overlay'
import ScanButton from '@shared/components/ui/scan-button'
import OrchestraBadge from '@shared/components/ui/orchestra-badge'
import { useOrchestra } from '@shared/hooks/use-orchestra'

export default function PaperDrum() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const detRef = useRef(null)
  const registryRef = useRef(new PadRegistry())
  const strikeRef = useRef(null)
  const samplesRef = useRef([]) // AudioBuffer[]
  const scanRef = useRef(false)
  const animRef = useRef(null)

  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const [padStates, setPadStates] = useState([]) // [{id, name, lastStrike}]
  const [flashPads, setFlashPads] = useState(new Set())

  const orchestra = useOrchestra({
    onBpmChange: () => {},
    onCommand: () => {},
  })

  // Load libraries
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        await loadArucoLibrary(ARUCO_DICT)
        if (cancelled) return
        detRef.current = createDetector(ARUCO_DICT)
        await initCamera(videoRef.current)
        if (cancelled) return
        setStatus('scan_needed')
        setMessage('Place drum pads in camera view and click Scan.')
        startVisionLoop()
      } catch (err) {
        if (!cancelled) { setStatus('error'); setMessage(err.message) }
      }
    }
    init()
    return () => { cancelled = true; if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // Load default samples
  useEffect(() => {
    async function loadSamples() {
      await audioManager.ensure()
      const ctx = audioManager.getContext()
      const buffers = await Promise.all(
        DEFAULT_SAMPLES.map(async (s) => {
          try {
            const resp = await fetch(s.url)
            const arr = await resp.arrayBuffer()
            return await ctx.decodeAudioData(arr)
          } catch { return null }
        })
      )
      samplesRef.current = buffers
    }
    loadSamples()
  }, [])

  function triggerSample(padIndex, vel) {
    const ctx = audioManager.getContext()
    if (!ctx) return
    const buf = samplesRef.current[padIndex % samplesRef.current.length]
    if (!buf) return
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    src.buffer = buf
    gain.gain.value = vel
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start()
    orchestra.sendNoteEvent(padIndex, 0, vel, 'on')

    setFlashPads(prev => { const next = new Set(prev); next.add(padIndex); return next })
    setTimeout(() => setFlashPads(prev => { const next = new Set(prev); next.delete(padIndex); return next }), 120)
  }

  function startScan() {
    audioManager.ensure()
    scanRef.current = true
    registryRef.current = new PadRegistry()
    setScanning(true)
    setMessage('Scanning... keep pads visible for 3 seconds.')

    setTimeout(() => {
      scanRef.current = false
      setScanning(false)
      const count = registryRef.current.count
      if (count >= 2) {
        // Assign default samples
        const entries = registryRef.current.entries()
        entries.forEach(([id], i) => {
          const sample = DEFAULT_SAMPLES[i % DEFAULT_SAMPLES.length]
          registryRef.current.setSample(id, sample.url, sample.name)
        })
        strikeRef.current = new StrikeDetector(count, triggerSample)
        setPadStates(entries.map(([id], i) => ({
          id,
          name: DEFAULT_SAMPLES[i % DEFAULT_SAMPLES.length].name,
          lastStrike: 0,
        })))
        setStatus('ready')
        setMessage(`Found ${count} pads. Tap to play!`)
      } else {
        setMessage(`Only ${count} pads found — need at least 2. Try again.`)
      }
    }, 3000)
  }

  function resetScan() {
    registryRef.current = new PadRegistry()
    strikeRef.current = null
    setPadStates([])
    setStatus('scan_needed')
    setMessage('Pads cleared. Place drum pads and click Scan.')
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

      // ArUco detection during scan
      if (scanRef.current && detRef.current) {
        const markers = detectMarkers(detRef.current, canvas)
        for (const m of markers) {
          const { cx, cy } = markerCenter(m)
          registryRef.current.register(m.id, cx, cy)

          // Sample colour around marker
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const sig = sampleColourSignature(imgData, cx, cy, 20, canvas.width)
          if (sig) registryRef.current.setColour(m.id, sig)

          // Draw detected pad outline
          ctx.beginPath()
          ctx.arc(cx, cy, 30, 0, Math.PI * 2)
          ctx.strokeStyle = '#22c55e'
          ctx.lineWidth = 3
          ctx.stroke()
          ctx.fillStyle = 'rgba(34,197,94,0.15)'
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 12px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(`PAD ${m.id}`, cx, cy + 4)
        }
      }

      // Runtime colour tracking for strike detection
      if (status === 'ready' && strikeRef.current) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const entries = registryRef.current.entries()
        entries.forEach(([id, pad], i) => {
          if (!pad.colourSignature) return
          const presence = trackColourPresence(imgData, pad.cx, pad.cy, 25, pad.colourSignature, canvas.width)
          strikeRef.current.update(i, presence)

          // Draw pad indicator
          const flash = flashPads.has(i)
          ctx.beginPath()
          ctx.arc(pad.cx, pad.cy, flash ? 35 : 28, 0, Math.PI * 2)
          ctx.strokeStyle = flash ? '#111827' : '#9ca3af'
          ctx.lineWidth = flash ? 4 : 2
          ctx.stroke()
          if (flash) {
            ctx.fillStyle = 'rgba(17,24,39,0.2)'
            ctx.fill()
          }
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(pad.sampleName || `#${id}`, pad.cx, pad.cy + 4)
        })
      }

      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
  }

  return (
    <InstrumentShell
      name="Paper Drum"
      status={status}
      statusMessage={message}
      onClickCapture={() => audioManager.ensure()}
    >
      <CameraOverlay videoRef={videoRef} canvasRef={canvasRef} />

      {/* Pad list */}
      {padStates.length > 0 && (
        <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-[0.6rem] text-gray-400 tracking-wider mb-1.5 uppercase font-medium">Pads</div>
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
                <div className="font-mono text-[0.6rem] text-gray-300">#{pad.id}</div>
                <div className="font-medium">{pad.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 flex-wrap justify-center w-full">
        <ScanButton scanning={scanning} status={status} onScan={startScan} onReset={resetScan} />
      </div>

      <Link to="/" className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-900 mt-2 no-underline transition-colors">
        <ArrowLeft size={14} /> Back
      </Link>
    </InstrumentShell>
  )
}
