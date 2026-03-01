import {
  WHISTLE_NOTES, TRUMPET_NOTES, PARTIAL_THRESHOLDS,
  WHISTLE_HOVER_T, WHISTLE_PRESS_T,
} from './wind-config'
import { computeGridVariances, clusterBlobs } from '@shared/detection/colour-blob'

// Template detection — determines if paper shows whistle (6 blobs vertical) or trumpet (3 blobs horizontal)
export class TemplateDetector {
  constructor() {
    this.confidence = 0
    this.pendingMode = null
    this.lockFrames = 30
  }

  detect(imageData, w, h) {
    const hot = computeGridVariances(imageData, w, h)
    const blobs = clusterBlobs(hot)
    const valid = blobs.filter(b => b.size >= 3 && b.size <= 80)
    if (valid.length < 3 || valid.length > 8) return this._decay()

    const xs = valid.map(b => b.cx), ys = valid.map(b => b.cy)
    const xRange = Math.max(...xs) - Math.min(...xs)
    const yRange = Math.max(...ys) - Math.min(...ys)
    const minSpan = Math.min(w, h) * 0.08

    let detected = null
    if (valid.length === 6 && yRange > xRange * 1.5 && yRange > minSpan) {
      detected = { template: 'whistle', blobs: [...valid].sort((a, b) => a.cy - b.cy) }
    } else if (valid.length === 3 && xRange > yRange * 1.5 && xRange > minSpan) {
      detected = { template: 'trumpet', blobs: [...valid].sort((a, b) => a.cx - b.cx) }
    }

    if (detected && detected.template === this.pendingMode) {
      this.confidence++
    } else if (detected) {
      this.pendingMode = detected.template
      this.confidence = 1
      this._pendingBlobs = detected.blobs
    } else {
      return this._decay()
    }

    if (this.confidence >= this.lockFrames) {
      const result = { template: this.pendingMode, blobs: this._pendingBlobs }
      this.confidence = 0
      this.pendingMode = null
      return result
    }

    return { pending: this.pendingMode, progress: this.confidence / this.lockFrames }
  }

  _decay() {
    this.confidence = Math.max(0, this.confidence - 1)
    return null
  }
}

// Whistle: Z-depth hole coverage via MediaPipe hands
export class WhistleEngine {
  constructor() {
    this.holePositions = [] // [{cx, cy, r}]
    this.holesCovered = new Array(6).fill(false)
    this.fingerStates = new Array(6).fill('idle')
    this.depths = new Array(6).fill(0)
    this.prevZ = new Array(6).fill(null)
    this.tapHold = new Array(6).fill(0)
  }

  setHoles(blobs) {
    this.holePositions = blobs.map(b => ({ cx: b.cx, cy: b.cy, r: 20 }))
    this.reset()
  }

  reset() {
    this.holesCovered.fill(false)
    this.fingerStates.fill('idle')
    this.depths.fill(0)
    this.prevZ.fill(null)
    this.tapHold.fill(0)
  }

  processHands(landmarks, canvasW, canvasH) {
    if (!landmarks?.length || !this.holePositions.length) return

    // Use first hand, check fingertips 4,8,12,16,20
    const tips = [4, 8, 12, 16, 20]
    const lms = landmarks[0]

    for (let hi = 0; hi < 6; hi++) {
      const hole = this.holePositions[hi]
      if (!hole) continue

      // Find nearest fingertip
      let minDist = Infinity, nearestTip = null
      for (const tipId of tips) {
        const lm = lms[tipId]
        const px = (1 - lm.x) * canvasW, py = lm.y * canvasH
        const dist = Math.sqrt((px - hole.cx) ** 2 + (py - hole.cy) ** 2)
        if (dist < minDist) { minDist = dist; nearestTip = lm }
      }

      if (!nearestTip || minDist > hole.r * 3) {
        this.fingerStates[hi] = 'idle'
        this.depths[hi] = 0
        continue
      }

      // Z-depth for coverage
      const z = nearestTip.z
      const d = Math.max(0, -z)

      if (this.prevZ[hi] !== null && d > WHISTLE_PRESS_T && this.depths[hi] < WHISTLE_PRESS_T) {
        this.tapHold[hi] = 5
      }
      if (this.tapHold[hi] > 0) this.tapHold[hi]--
      this.prevZ[hi] = z
      this.depths[hi] = d

      this.fingerStates[hi] =
        d < WHISTLE_HOVER_T ? 'idle' :
        this.tapHold[hi] > 0 ? 'pressed' :
        d < WHISTLE_PRESS_T ? 'hovering' : 'pressed'

      this.holesCovered[hi] = this.fingerStates[hi] === 'pressed'
    }
  }

  matchNote() {
    const cov = this.holesCovered.map(c => c ? 1 : 0)
    for (const n of WHISTLE_NOTES) {
      if (n.holes.every((h, i) => h === cov[i])) return n
    }
    return null
  }
}

// Trumpet: valve states from MediaPipe hand tracking
export class TrumpetEngine {
  constructor() {
    this.valveStates = [false, false, false] // index, middle, ring
    this.fingerDepths = [0, 0, 0]
  }

  processHands(landmarks, canvasW, canvasH, blobPositions) {
    if (!landmarks?.length || blobPositions.length < 3) return

    const TIP_IDS = [8, 12, 16] // index, middle, ring
    const MCP_IDS = [5, 9, 13]
    const lms = landmarks[0]

    for (let i = 0; i < 3; i++) {
      const tip = lms[TIP_IDS[i]]
      const mcp = lms[MCP_IDS[i]]
      const depth = mcp.z - tip.z
      this.fingerDepths[i] = Math.max(0, depth)
      this.valveStates[i] = depth > 0.03
    }
  }

  matchNote(partial = 1) {
    const pressed = this.valveStates.map(s => s ? 1 : 0)
    for (const n of TRUMPET_NOTES) {
      if (n.v.every((h, i) => h === pressed[i])) {
        return { ...n, freq: n.freq * partial }
      }
    }
    return null
  }
}

// Breath fusion: OR-gate of mic + lip + voice signals
export class BreathFusion {
  constructor() {
    this.micBlowing = false
    this.lipBlowing = false
    this.voiceGate = false
    this.breathLevel = 0
    this.lipAperture = 0
    this.lipNarrow = 0
  }

  updateMic(data) {
    this.micBlowing = data.micBlowing
    this.voiceGate = data.voiceGate
    this.breathLevel = data.breathLevel
  }

  updateFace(landmarks, canvasW, canvasH) {
    if (!landmarks?.length) {
      this.lipBlowing = false
      this.lipAperture = 0
      return
    }
    const lm = landmarks[0]
    const dist = (a, b) => Math.sqrt(((a.x - b.x) * canvasW) ** 2 + ((a.y - b.y) * canvasH) ** 2)
    const aperture = dist(lm[13], lm[14])
    const width = dist(lm[61], lm[291])
    const faceH = dist(lm[168], lm[152])
    if (!faceH) return

    const rawApt = aperture / faceH
    this.lipAperture = this.lipAperture * 0.75 + rawApt * 0.25
    this.lipNarrow = 1 - (width / (faceH * 0.7))
    this.lipBlowing = this.lipAperture > 0.005 && this.lipAperture < 0.045 && this.lipNarrow > 0.12
  }

  get isBlowing() {
    return this.micBlowing || this.lipBlowing || this.voiceGate
  }

  get dynamics() {
    return this.breathLevel
  }
}
