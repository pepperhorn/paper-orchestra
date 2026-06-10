export function computeKeyZoneParams(markers, keyboard) {
  // Derive available key markers from the keyboard definition
  const whiteMarkers = keyboard.whites.filter(k => markers[k.tagId])
  const blackMarkers = keyboard.blacks.filter(k => markers[k.tagId])

  if (whiteMarkers.length < 2) return null

  const whiteXs = whiteMarkers.map(k => markers[k.tagId].cx).sort((a, b) => a - b)
  const avgKeyWidth = (whiteXs[whiteXs.length - 1] - whiteXs[0]) / (whiteXs.length - 1)

  // Black markers sit near key tops, white markers sit lower — use topmost as zone start
  const allKeyYs = [...whiteMarkers, ...blackMarkers].map(k => markers[k.tagId].cy)
  const markerRowY = Math.min(...allKeyYs)

  // Key zone extends downward from the topmost markers
  const keyZoneDepth = avgKeyWidth * 3

  return { markerRowY, keyZoneDepth, avgKeyWidth }
}

export function getKey(px, py, keyboard, markers, markerRowY, keyZoneDepth, avgKeyWidth) {
  if (py < markerRowY || py > markerRowY + keyZoneDepth) return null
  const relativeY = (py - markerRowY) / keyZoneDepth

  // Black keys in upper 60% of key zone
  if (relativeY < 0.60) {
    const blackThreshold = avgKeyWidth * 0.4
    let nearest = null, nearestDist = Infinity
    for (const bk of keyboard.blacks) {
      if (!markers[bk.tagId]) continue
      const dist = Math.abs(px - markers[bk.tagId].cx)
      if (dist < blackThreshold && dist < nearestDist) {
        nearestDist = dist
        nearest = bk
      }
    }
    if (nearest) return nearest
  }

  // White keys — nearest horizontally
  const whiteThreshold = avgKeyWidth * 0.6
  let nearest = null, nearestDist = Infinity
  for (const wk of keyboard.whites) {
    if (!markers[wk.tagId]) continue
    const dist = Math.abs(px - markers[wk.tagId].cx)
    if (dist < whiteThreshold && dist < nearestDist) {
      nearestDist = dist
      nearest = wk
    }
  }
  return nearest
}
