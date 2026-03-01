import * as Tone from 'tone'

const SOUNDFONT_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite'

// Standard note names for sparse sampling (every 3rd note)
const SAMPLE_NOTES = ['C1', 'Eb1', 'Gb1', 'A1', 'C2', 'Eb2', 'Gb2', 'A2',
  'C3', 'Eb3', 'Gb3', 'A3', 'C4', 'Eb4', 'Gb4', 'A4',
  'C5', 'Eb5', 'Gb5', 'A5', 'C6', 'Eb6', 'Gb6', 'A6', 'C7']

export function createSampler(options = {}) {
  const { urls, baseUrl, volume = 0, onLoad } = options

  const sampler = new Tone.Sampler({
    urls: urls || {},
    baseUrl: baseUrl || '',
    volume,
    onload: onLoad,
  })

  return {
    get sampler() { return sampler },

    connect(destination) {
      sampler.connect(destination)
      return this
    },

    toDestination() {
      sampler.toDestination()
      return this
    },

    triggerAttack(note, time, vel) {
      sampler.triggerAttack(note, time, vel)
    },

    triggerRelease(note, time) {
      sampler.triggerRelease(note, time)
    },

    triggerAttackRelease(note, duration, time, vel) {
      sampler.triggerAttackRelease(note, duration, time, vel)
    },

    get loaded() { return sampler.loaded },

    dispose() { sampler.dispose() },
  }
}

export function loadGMSoundfont(instrument, options = {}) {
  const { volume = 0, onLoad } = options
  const urls = {}
  for (const note of SAMPLE_NOTES) {
    const encoded = note.replace('#', '%23')
    urls[note] = `${encoded}.mp3`
  }

  return createSampler({
    urls,
    baseUrl: `${SOUNDFONT_BASE}/${instrument}-mp3/`,
    volume,
    onLoad,
  })
}
