export function createRecordingEngine(options = {}) {
  const {
    storageKey = 'pp_recordings',
    maxSlots = 8,
  } = options

  let recordings = loadRecordings()
  let activeSlot = null
  let startTime = 0
  let events = []
  let playbackTimers = []
  let playingSlot = null

  function loadRecordings() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null') || Array(maxSlots).fill(null)
    } catch {
      return Array(maxSlots).fill(null)
    }
  }

  function saveRecordings() {
    try { localStorage.setItem(storageKey, JSON.stringify(recordings)) } catch (_) {}
  }

  return {
    get recordings() { return recordings },
    get activeSlot() { return activeSlot },
    get playingSlot() { return playingSlot },
    get isRecording() { return activeSlot !== null },
    get isPlaying() { return playingSlot !== null },

    // Returns a callback to feed to synth.onRecord
    startRecording(slot) {
      this.stopPlayback()
      activeSlot = slot
      startTime = Date.now()
      events = []
      return (evt) => {
        events.push({ ...evt, t: evt.t - startTime })
      }
    },

    stopRecording() {
      if (activeSlot === null || !events.length) {
        activeSlot = null
        return null
      }
      const duration = Date.now() - startTime
      recordings[activeSlot] = { events: [...events], duration }
      saveRecordings()
      const slot = activeSlot
      activeSlot = null
      events = []
      return slot
    },

    playRecording(slot, noteOn, noteOff, onComplete) {
      const rec = recordings[slot]
      if (!rec) return false
      this.stopPlayback()
      playingSlot = slot
      playbackTimers = rec.events.map(evt =>
        setTimeout(() => {
          if (evt.type === 'on') noteOn(evt.id, evt.freq, evt.vel)
          else noteOff(evt.id)
        }, evt.t)
      )
      playbackTimers.push(setTimeout(() => {
        playingSlot = null
        playbackTimers = []
        onComplete?.()
      }, rec.duration + 200))
      return true
    },

    stopPlayback() {
      playbackTimers.forEach(t => clearTimeout(t))
      playbackTimers = []
      playingSlot = null
    },

    clearSlot(slot) {
      if (playingSlot === slot) this.stopPlayback()
      recordings[slot] = null
      saveRecordings()
    },

    hasRecording(slot) {
      return recordings[slot] !== null
    },
  }
}
