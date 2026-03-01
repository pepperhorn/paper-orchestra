export function computeKeyZoneParams(markers) {
  const whiteIds = [0, 1, 2, 3, 4, 5, 6, 46, 47, 48, 49, 50, 51, 52, 58]
  const blackIds = [8, 9, 10, 11, 12, 53, 54, 55, 56, 57]

  const whiteMarkers = whiteIds.filter(id => markers[id])
  if (whiteMarkers.length < 2) return null

  const whiteXs = whiteMarkers.map(id => markers[id].cx).sort((a, b) => a - b)
  const avgKeyWidth = (whiteXs[whiteXs.length - 1] - whiteXs[0]) / (whiteXs.length - 1)

  const allKeyYs = [...whiteIds, ...blackIds]
    .filter(id => markers[id])
    .map(id => markers[id].cy)
  const markerRowY = allKeyYs.reduce((s, y) => s + y, 0) / allKeyYs.length
  const keyZoneDepth = avgKeyWidth * 2.5

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
