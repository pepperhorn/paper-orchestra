import * as Tone from 'tone'

class AudioManager {
  constructor() {
    this._started = false
  }

  async ensure() {
    if (!this._started) {
      await Tone.start()
      this._started = true
    }
    return Tone.getContext()
  }

  get started() { return this._started }

  getContext() {
    return Tone.getContext().rawContext
  }

  get currentTime() {
    return Tone.now()
  }
}

export const audioManager = new AudioManager()
