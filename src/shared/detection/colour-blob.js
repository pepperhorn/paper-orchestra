// colour-blob.js — Grid variance analysis, blob clustering, and colour signature tracking
// Used for template detection and drum pad colour-based detection

const GRID_COLS = 48
const GRID_ROWS = 28
const VAR_THRESHOLD = 420

/**
 * Compute luminance variance per grid cell and return cells that exceed the threshold.
 * High-variance cells indicate areas with visual features (printed patterns, edges).
 *
 * @param {ImageData} imageData - Canvas image data
 * @param {number} w - Image width
 * @param {number} h - Image height
 * @returns {Array<{ gx: number, gy: number, cx: number, cy: number }>} Hot cells exceeding variance threshold
 */
export function computeGridVariances(imageData, w, h) {
  const cw = Math.floor(w / GRID_COLS)
  const ch = Math.floor(h / GRID_ROWS)
  const hot = []

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const x0 = gx * cw, y0 = gy * ch
      let sum = 0, sq = 0, n = 0
      for (let sy = 0; sy < ch; sy += 2) {
        for (let sx = 0; sx < cw; sx += 2) {
          const idx = ((y0 + sy) * w + (x0 + sx)) * 4
          const lum = 0.299 * imageData.data[idx] + 0.587 * imageData.data[idx + 1] + 0.114 * imageData.data[idx + 2]
          sum += lum; sq += lum * lum; n++
        }
      }
      const mean = sum / n
      const variance = sq / n - mean * mean
      if (variance > VAR_THRESHOLD) {
        hot.push({ gx, gy, cx: x0 + cw / 2, cy: y0 + ch / 2 })
      }
    }
  }
  return hot
}

/**
 * Cluster adjacent hot cells into blobs using flood-fill.
 * Only blobs with 2+ cells are returned.
 *
 * @param {Array<{ gx: number, gy: number, cx: number, cy: number }>} hotCells - High-variance grid cells
 * @returns {Array<{ cx: number, cy: number, size: number }>} Clustered blobs with center and cell count
 */
export function clusterBlobs(hotCells) {
  const cellSet = new Set(hotCells.map(c => c.gy * GRID_COLS + c.gx))
  const visited = new Set()
  const blobs = []

  for (const cell of hotCells) {
    const key = cell.gy * GRID_COLS + cell.gx
    if (visited.has(key)) continue
    const queue = [cell]
    const blob = []
    visited.add(key)
    while (queue.length) {
      const cur = queue.shift()
      blob.push(cur)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nk = (cur.gy + dy) * GRID_COLS + (cur.gx + dx)
          if (!visited.has(nk) && cellSet.has(nk)) {
            visited.add(nk)
            const nc = hotCells.find(c => c.gy * GRID_COLS + c.gx === nk)
            if (nc) queue.push(nc)
          }
        }
      }
    }
    if (blob.length >= 2) {
      const cx = blob.reduce((s, c) => s + c.cx, 0) / blob.length
      const cy = blob.reduce((s, c) => s + c.cy, 0) / blob.length
      blobs.push({ cx, cy, size: blob.length })
    }
  }
  return blobs
}

/**
 * Sample the average RGB colour in a circular region around a point.
 *
 * @param {ImageData} imageData - Canvas image data
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} radius - Sampling radius in pixels
 * @param {number} w - Image width
 * @returns {number[]|null} Average [R, G, B] or null if no samples
 */
export function sampleColourSignature(imageData, cx, cy, radius, w) {
  const samples = []
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue
      const px = Math.round(cx + dx), py = Math.round(cy + dy)
      if (px < 0 || py < 0 || px >= w || py >= imageData.height) continue
      const idx = (py * w + px) * 4
      samples.push([imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2]])
    }
  }
  if (!samples.length) return null
  const avg = [0, 0, 0]
  for (const [r, g, b] of samples) { avg[0] += r; avg[1] += g; avg[2] += b }
  return avg.map(v => v / samples.length)
}

/**
 * Track whether a colour signature is still present at a given location.
 * Returns a ratio (0-1) of pixels matching the signature within threshold.
 *
 * @param {ImageData} imageData - Canvas image data
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} radius - Sampling radius in pixels
 * @param {number[]} signature - Reference [R, G, B] colour to match against
 * @param {number} w - Image width
 * @param {number} threshold - Maximum summed RGB distance for a match (default 60)
 * @returns {number} Match ratio (0-1)
 */
export function trackColourPresence(imageData, cx, cy, radius, signature, w, threshold = 60) {
  let matches = 0, total = 0
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      if (dx * dx + dy * dy > r2) continue
      const px = Math.round(cx + dx), py = Math.round(cy + dy)
      if (px < 0 || py < 0 || px >= w || py >= imageData.height) continue
      const idx = (py * w + px) * 4
      const dist = Math.abs(imageData.data[idx] - signature[0])
        + Math.abs(imageData.data[idx + 1] - signature[1])
        + Math.abs(imageData.data[idx + 2] - signature[2])
      if (dist < threshold) matches++
      total++
    }
  }
  return total > 0 ? matches / total : 0
}
