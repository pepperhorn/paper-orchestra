import { STRIKE_COOLDOWN, OCCLUSION_THRESHOLD } from './drum-config'

// State machine per pad: PRESENT → OCCLUDED → COOLDOWN → PRESENT
export class StrikeDetector {
  constructor(padCount, onStrike) {
    this.onStrike = onStrike
    this.states = Array(padCount).fill('present')
    this.cooldowns = Array(padCount).fill(0)
    this.prevPresence = Array(padCount).fill(1)
  }

  update(padIndex, presence, now = Date.now()) {
    const state = this.states[padIndex]

    if (state === 'cooldown') {
      if (now - this.cooldowns[padIndex] > STRIKE_COOLDOWN) {
        this.states[padIndex] = 'present'
      }
      this.prevPresence[padIndex] = presence
      return
    }

    if (state === 'present' && presence < OCCLUSION_THRESHOLD) {
      this.states[padIndex] = 'occluded'
      // Velocity from speed of occlusion
      const delta = this.prevPresence[padIndex] - presence
      const vel = Math.min(1, Math.max(0.3, delta * 3))
      this.onStrike(padIndex, vel)
      this.states[padIndex] = 'cooldown'
      this.cooldowns[padIndex] = now
    }

    this.prevPresence[padIndex] = presence
  }
}

export class PadRegistry {
  constructor() {
    this.pads = new Map() // id → { cx, cy, colourSignature, sampleUrl, sampleName }
  }

  register(id, cx, cy) {
    this.pads.set(id, { cx, cy, colourSignature: null, sampleUrl: null, sampleName: null })
  }

  setColour(id, signature) {
    const pad = this.pads.get(id)
    if (pad) pad.colourSignature = signature
  }

  setSample(id, url, name) {
    const pad = this.pads.get(id)
    if (pad) { pad.sampleUrl = url; pad.sampleName = name }
  }

  get count() { return this.pads.size }

  entries() { return [...this.pads.entries()] }
}
