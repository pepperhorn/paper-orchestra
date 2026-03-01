import * as Tone from 'tone'

export function createSynthEngine(options = {}) {
  const {
    waveform = 'triangle',
    maxPolyphony = 16,
    adsr = { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.3 },
    volume = -6,
  } = options

  const synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony,
    oscillator: { type: waveform },
    envelope: adsr,
    volume,
  })

  const activeNotes = new Map() // id -> frequency
  let onRecord = null

  return {
    get synth() { return synth },

    connect(destination) {
      synth.connect(destination)
      return this
    },

    toDestination() {
      synth.toDestination()
      return this
    },

    noteOn(id, freq, vel = 1, time) {
      if (activeNotes.has(id)) this.noteOff(id, time)
      activeNotes.set(id, freq)
      const t = time ?? Tone.now()
      synth.triggerAttack(freq, t, vel)
      if (onRecord) {
        const delay = time ? (time - Tone.now()) * 1000 : 0
        onRecord({ type: 'on', id, freq, vel, t: Date.now() + delay })
      }
    },

    noteOff(id, time) {
      const freq = activeNotes.get(id)
      if (freq === undefined) return
      activeNotes.delete(id)
      const t = time ?? Tone.now()
      synth.triggerRelease(freq, t)
      if (onRecord) {
        const delay = time ? (time - Tone.now()) * 1000 : 0
        onRecord({ type: 'off', id, t: Date.now() + delay })
      }
    },

    allNotesOff() {
      synth.releaseAll()
      activeNotes.clear()
    },

    setWaveform(type) {
      synth.set({ oscillator: { type } })
    },

    setADSR(env) {
      synth.set({ envelope: env })
    },

    setVolume(db) {
      synth.volume.value = db
    },

    set onRecord(fn) { onRecord = fn },
    get onRecord() { return onRecord },

    get activeCount() { return activeNotes.size },

    dispose() {
      synth.releaseAll()
      synth.dispose()
      activeNotes.clear()
    },
  }
}
