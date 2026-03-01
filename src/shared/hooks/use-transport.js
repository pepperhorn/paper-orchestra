import { useState, useCallback, useRef } from 'react'
import { transport } from '@shared/audio/transport'
import { audioManager } from '@shared/audio/manager'

export function useTransport() {
  const [bpm, setBpmState] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [metroActive, setMetroActive] = useState(false)
  const metroRef = useRef(null)
  const tapTimesRef = useRef([])

  const setBpm = useCallback((value) => {
    const v = Math.max(40, Math.min(240, value))
    transport.bpm = v
    setBpmState(v)
  }, [])

  const start = useCallback(() => {
    transport.start()
    setIsPlaying(true)
  }, [])

  const stop = useCallback(() => {
    transport.stop()
    setIsPlaying(false)
  }, [])

  const metroClick = useCallback(() => {
    const ctx = audioManager.getContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.value = 1000
    osc.type = 'sine'
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.06)
  }, [])

  const startMetronome = useCallback((bpmVal) => {
    if (metroRef.current) clearInterval(metroRef.current)
    metroClick()
    metroRef.current = setInterval(metroClick, 60000 / bpmVal)
    setMetroActive(true)
  }, [metroClick])

  const stopMetronome = useCallback(() => {
    if (metroRef.current) { clearInterval(metroRef.current); metroRef.current = null }
    setMetroActive(false)
  }, [])

  const handleTap = useCallback(async () => {
    await audioManager.ensure()
    const now = Date.now()
    if (metroActive) { stopMetronome(); tapTimesRef.current = []; return }
    tapTimesRef.current = tapTimesRef.current.filter(t => now - t < 2000)
    tapTimesRef.current.push(now)
    if (tapTimesRef.current.length >= 2) {
      const times = tapTimesRef.current
      const intervals = []
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1])
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const newBpm = Math.max(40, Math.min(240, Math.round(60000 / avgMs)))
      setBpm(newBpm)
      startMetronome(newBpm)
    }
  }, [metroActive, stopMetronome, setBpm, startMetronome])

  return { bpm, setBpm, isPlaying, start, stop, metroActive, handleTap, startMetronome, stopMetronome }
}
