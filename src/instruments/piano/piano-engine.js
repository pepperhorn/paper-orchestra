import { TAG, CHORD_TAG_MAP, ARP_PAT_TAG, ARP_RATE_TAG, TAG_INV, PRESS_VEL } from './piano-config'
import { getKey, computeKeyZoneParams } from '@shared/engine/key-detect'
import { getRibbon } from '@shared/engine/ribbon'
import { FINGERTIP_IDS } from '@shared/detection/hands'
import { detectCoveredMarkers } from '@shared/detection/ghost'

export function processCoveredTags(covered, octUpDeb, octDnDeb, setOctave) {
  let ct = null, ap = 'off', ar = 'eighth', rm = 'mod', so = false
  const nowMs = Date.now()
  for (const id of covered) {
    if (CHORD_TAG_MAP[id]) ct = CHORD_TAG_MAP[id]
    if (ARP_PAT_TAG[id]) ap = ARP_PAT_TAG[id]
    if (ARP_RATE_TAG[id]) ar = ARP_RATE_TAG[id]
    if (id === TAG.MODE_MOD) rm = 'mod'
    if (id === TAG.MODE_VOL) rm = 'vol'
    if (id === TAG.SUSTAIN) so = true
    if (id === TAG.OCT_UP && nowMs - octUpDeb.current > 1500) {
      octUpDeb.current = nowMs
      setOctave(o => Math.min(5, o + 1))
    }
    if (id === TAG.OCT_DOWN && nowMs - octDnDeb.current > 1500) {
      octDnDeb.current = nowMs
      setOctave(o => Math.max(2, o - 1))
    }
  }
  return { chordType: ct, arpPattern: ap, arpRate: ar, ribbonMode: rm, sustainObj: so }
}

export function processFrame(results, ctx) {
  const {
    canvas, canvasCtx, markers: knownMkrs, positionTags, keyboard: kb,
    velTracker, pressedRef, sustainRef, sustainHeld, sustainObj,
    chordType, arpPattern, arpRef, ribbonMode,
    synth, buildChordNotes, setRibbonValue, dispatch, status,
  } = ctx

  // Draw camera image (mirrored)
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
  canvasCtx.save()
  canvasCtx.scale(-1, 1)
  canvasCtx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height)
  canvasCtx.restore()

  // ArUco processing handled by caller — we receive detected markers & covered set

  if (status !== 'ready') return { newlyPressed: new Set() }

  // Compute key detection parameters
  const zoneParams = computeKeyZoneParams(knownMkrs)
  if (!zoneParams) return { newlyPressed: new Set() }
  const { markerRowY, keyZoneDepth, avgKeyWidth } = zoneParams

  const newlyPressed = new Set()

  if (results.multiHandLandmarks) {
    for (const lms of results.multiHandLandmarks) {
      for (const tipId of FINGERTIP_IDS) {
        const lm = lms[tipId]
        const lmx = 1 - lm.x, lmy = lm.y
        velTracker.update(tipId, lmy)
        const vy = velTracker.vel(tipId)

        const px = lmx * canvas.width, py = lmy * canvas.height

        // Key detection
        const key = getKey(px, py, kb, knownMkrs, markerRowY, keyZoneDepth, avgKeyWidth)

        if (key) {
          newlyPressed.add(key.id)
          if (vy > PRESS_VEL && !pressedRef.current.has(key.id)) {
            pressedRef.current.add(key.id)
            const vel = Math.min(1, vy / 2.5)
            // Press with chord mode
            if (chordType) {
              const notes = buildChordNotes(key.freq, key.label, chordType)
              notes.forEach(n => synth.noteOn(n.id, n.freq, vel))
              if (arpPattern !== 'off' && arpRef.current) arpRef.current.setNotes(notes)
            } else {
              synth.noteOn(key.id, key.freq, vel)
              if (arpPattern !== 'off' && arpRef.current) arpRef.current.setNotes([key])
            }
            if (sustainRef.current || sustainObj) sustainHeld.current.add(key.id)
            dispatch?.({ type: 'ADD', note: key.label, vel })
          }
        }

        // Ribbon
        const rv = getRibbon(px, py, knownMkrs)
        if (rv !== null) {
          setRibbonValue(rv)
          if (ribbonMode === 'vol') synth.setVolume(rv * -6) // 0 to -6 dB range
        }

        // Draw fingertip
        const pressing = vy > PRESS_VEL
        canvasCtx.beginPath()
        canvasCtx.arc(px, py, pressing ? 14 : 10, 0, Math.PI * 2)
        canvasCtx.fillStyle = pressing ? 'rgba(255,80,50,0.9)' : key ? 'rgba(255,200,60,0.8)' : 'rgba(100,200,255,0.7)'
        canvasCtx.fill()
        canvasCtx.strokeStyle = 'white'
        canvasCtx.lineWidth = 2
        canvasCtx.stroke()
        if (key) {
          canvasCtx.fillStyle = '#111'
          canvasCtx.font = 'bold 10px monospace'
          canvasCtx.textAlign = 'center'
          canvasCtx.fillText(key.label, px, py + 4)
        }
        // Velocity bar
        if (Math.abs(vy) > 0.05) {
          const bh = Math.min(28, Math.abs(vy) * 14)
          canvasCtx.fillStyle = vy > 0 ? 'rgba(255,100,60,0.8)' : 'rgba(60,200,100,0.8)'
          canvasCtx.fillRect(px - 3, py - 18 - (vy > 0 ? bh : 0), 6, bh)
        }
      }
      // Skeleton
      const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]]
      for (const [a, b] of BONES) {
        const la = lms[a], lb = lms[b]
        canvasCtx.strokeStyle = 'rgba(255,255,255,0.2)'
        canvasCtx.lineWidth = 1
        canvasCtx.beginPath()
        canvasCtx.moveTo((1 - la.x) * canvas.width, la.y * canvas.height)
        canvasCtx.lineTo((1 - lb.x) * canvas.width, lb.y * canvas.height)
        canvasCtx.stroke()
      }
    }
  }

  return { newlyPressed }
}

export function drawMarkerOverlays(canvasCtx, markers) {
  for (const m of markers) {
    canvasCtx.beginPath()
    canvasCtx.moveTo(m.corners[0].x, m.corners[0].y)
    for (let i = 1; i < 4; i++) canvasCtx.lineTo(m.corners[i].x, m.corners[i].y)
    canvasCtx.closePath()
    canvasCtx.strokeStyle = 'rgba(255,200,60,0.8)'
    canvasCtx.lineWidth = 2
    canvasCtx.stroke()
    canvasCtx.fillStyle = 'rgba(255,200,60,0.10)'
    canvasCtx.fill()
    canvasCtx.fillStyle = 'rgba(255,210,70,0.9)'
    canvasCtx.font = 'bold 8px monospace'
    canvasCtx.textAlign = 'left'
    canvasCtx.fillText(TAG_INV[m.id] || `#${m.id}`, m.corners[0].x + 2, m.corners[0].y - 4)
  }
}
