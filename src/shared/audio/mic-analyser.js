export function createMicAnalyser(options = {}) {
  const {
    fftSize = 2048,
    smoothing = 0.45,
    breathThreshold = 0.022,
    voiceRmsThreshold = 0.015,
    hnrThreshold = 8,
  } = options

  let audioCtx = null
  let analyser = null
  let source = null
  let rafId = null

  let smoothRms = 0
  let smoothVoiceRms = 0
  let breathLevel = 0
  let micBlowing = false
  let voiceGate = false
  let onUpdate = null

  function computeHNR(samples, sampleRate) {
    const n = samples.length
    if (n < 64) return 0
    const minLag = Math.floor(sampleRate / 500) // 500 Hz max
    const maxLag = Math.min(n - 1, Math.floor(sampleRate / 80)) // 80 Hz min

    let bestR = 0
    let energy = 0
    for (let i = 0; i < n; i++) energy += samples[i] * samples[i]
    if (energy < 1e-10) return 0

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0
      for (let i = 0; i < n - lag; i++) sum += samples[i] * samples[i + lag]
      const r = sum / energy
      if (r > bestR) bestR = r
    }

    if (bestR <= 0 || bestR >= 1) return 0
    return 10 * Math.log10(bestR / (1 - bestR))
  }

  function tick() {
    if (!analyser) return

    const tBuf = new Float32Array(analyser.fftSize)
    const fBuf = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatTimeDomainData(tBuf)
    analyser.getFloatFrequencyData(fBuf)

    // RMS
    let ss = 0
    for (let i = 0; i < tBuf.length; i++) ss += tBuf[i] * tBuf[i]
    const rms = Math.sqrt(ss / tBuf.length)
    smoothRms = smoothRms * 0.82 + rms * 0.18

    // Spectral flatness
    let gs = 0, as = 0, c = 0
    for (let i = 4; i < fBuf.length * 0.7; i++) {
      const lin = Math.pow(10, fBuf[i] / 20)
      gs += Math.log(lin + 1e-10); as += lin; c++
    }
    const flat = Math.exp(gs / c) / (as / c + 1e-10)
    micBlowing = smoothRms > breathThreshold && (flat > 0.06 || smoothRms > breathThreshold * 2.2)

    // HNR voice detection
    const hnrWindow = tBuf.slice(768, 1280)
    const hnr = computeHNR(hnrWindow, audioCtx.sampleRate)
    smoothVoiceRms = smoothVoiceRms * 0.75 + rms * 0.25
    voiceGate = hnr > hnrThreshold && smoothVoiceRms > voiceRmsThreshold

    // Unified breath level
    const breathNorm = Math.min(1, smoothRms / 0.12)
    const voiceNorm = Math.min(1, smoothVoiceRms / 0.08)
    const newLevel = (micBlowing || voiceGate)
      ? Math.max(breathNorm, voiceGate ? voiceNorm : 0)
      : 0
    breathLevel = breathLevel * 0.88 + newLevel * 0.12

    onUpdate?.({
      rms: smoothRms,
      voiceRms: smoothVoiceRms,
      breathLevel,
      micBlowing,
      voiceGate,
      isActive: micBlowing || voiceGate,
    })

    rafId = requestAnimationFrame(tick)
  }

  return {
    async start(ctx) {
      audioCtx = ctx || new (window.AudioContext || window.webkitAudioContext)()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      })
      source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = fftSize
      analyser.smoothingTimeConstant = smoothing
      source.connect(analyser)
      tick()
      return audioCtx
    },

    stop() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
      if (source) {
        source.mediaStream.getTracks().forEach(t => t.stop())
        source.disconnect()
      }
      source = null
      analyser = null
    },

    set onUpdate(fn) { onUpdate = fn },
    get onUpdate() { return onUpdate },

    get breathLevel() { return breathLevel },
    get micBlowing() { return micBlowing },
    get voiceGate() { return voiceGate },
    get isActive() { return micBlowing || voiceGate },
  }
}
