// aruco.js — ArUco marker detection with support for multiple dictionaries

const DICT_URLS = {
  'ARUCO_4X4_1000': [
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/aruco.min.js',
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/dictionaries/aruco_4x4_1000.js',
  ],
  'ARUCO_4X4_50': [
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/aruco.min.js',
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/dictionaries/aruco_4x4_50.js',
  ],
  'ARUCO_6X6_250': [
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/aruco.min.js',
    'https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/dictionaries/aruco_6x6_250.js',
  ],
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = resolve; s.onerror = reject
    document.body.appendChild(s)
  })
}

/**
 * Load the ArUco library scripts for a given dictionary.
 *
 * @param {string} dict - Dictionary name (e.g. 'ARUCO_4X4_1000')
 * @throws {Error} If dictionary name is unknown
 */
export async function loadArucoLibrary(dict = 'ARUCO_4X4_1000') {
  const urls = DICT_URLS[dict]
  if (!urls) throw new Error(`Unknown ArUco dictionary: ${dict}`)
  for (const url of urls) await loadScript(url)
}

/**
 * Create an ArUco detector instance for a given dictionary.
 * Must call loadArucoLibrary() first.
 *
 * @param {string} dict - Dictionary name
 * @returns {Object} AR.Detector instance
 * @throws {Error} If library is not loaded
 */
export function createDetector(dict = 'ARUCO_4X4_1000') {
  if (!window.AR?.Detector) throw new Error('ArUco library not loaded')
  return new window.AR.Detector({ dictionaryName: dict })
}

/**
 * Detect markers in a canvas.
 *
 * @param {Object} detector - AR.Detector instance
 * @param {HTMLCanvasElement} canvas - Canvas with the current video frame
 * @returns {Array} Detected markers with id and corners
 */
export function detectMarkers(detector, canvas) {
  if (!detector) return []
  try {
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return detector.detect(imageData) || []
  } catch {
    return []
  }
}

/**
 * Compute the center point of a marker from its 4 corners.
 *
 * @param {Object} marker - Marker with corners array
 * @returns {{ cx: number, cy: number }} Center coordinates
 */
export function markerCenter(marker) {
  const cx = marker.corners.reduce((s, p) => s + p.x, 0) / 4
  const cy = marker.corners.reduce((s, p) => s + p.y, 0) / 4
  return { cx, cy }
}
