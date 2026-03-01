import * as Tone from 'tone'

export function createEffectsChain(options = {}) {
  const {
    reverbDecay = 2.5,
    reverbWet = 0.25,
    compressorThreshold = -20,
    compressorRatio = 4,
    volume = 0,
  } = options

  const reverb = new Tone.Reverb({ decay: reverbDecay, wet: reverbWet })
  const compressor = new Tone.Compressor({
    threshold: compressorThreshold,
    ratio: compressorRatio,
  })
  const vol = new Tone.Volume(volume)

  // Chain: input → reverb → compressor → volume → destination
  reverb.connect(compressor)
  compressor.connect(vol)

  return {
    get input() { return reverb },
    get output() { return vol },
    get reverb() { return reverb },
    get compressor() { return compressor },
    get volume() { return vol },

    connect(destination) {
      vol.connect(destination)
      return this
    },

    toDestination() {
      vol.toDestination()
      return this
    },

    setReverbWet(wet) {
      reverb.wet.value = wet
    },

    setVolume(db) {
      vol.volume.value = db
    },

    dispose() {
      reverb.dispose()
      compressor.dispose()
      vol.dispose()
    },
  }
}
