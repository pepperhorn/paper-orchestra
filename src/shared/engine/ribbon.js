export function getRibbon(px, py, markers) {
  const ribbonIds = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
  const ribbonMkrs = ribbonIds
    .filter(id => markers[id])
    .map(id => ({ id, ...markers[id] }))
  if (ribbonMkrs.length < 2) return null

  ribbonMkrs.sort((a, b) => a.cy - b.cy) // top (small Y) to bottom (large Y)
  const ribbonX = ribbonMkrs.reduce((s, m) => s + m.cx, 0) / ribbonMkrs.length

  if (Math.abs(px - ribbonX) > 30) return null

  const topY = ribbonMkrs[0].cy
  const botY = ribbonMkrs[ribbonMkrs.length - 1].cy
  if (botY - topY < 10) return null

  return 1 - Math.max(0, Math.min(1, (py - topY) / (botY - topY))) // 1 at top, 0 at bottom
}
