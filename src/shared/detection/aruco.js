// aruco.js — ArUco marker detection with support for multiple dictionaries
// Uses js-aruco2 npm package, bundled by Vite (no more CDN script tags)

let AR = null

const DICT_LOADERS = {
  'ARUCO_4X4_1000': () => import('js-aruco2/src/dictionaries/aruco_4x4_1000.js'),
  'ARUCO_6X6_1000': () => import('js-aruco2/src/dictionaries/aruco_6x6_1000.js'),
}

/**
 * Load the ArUco library and a dictionary.
 *
 * @param {string} dict - Dictionary name (e.g. 'ARUCO_4X4_1000')
 * @throws {Error} If dictionary name is unknown or library fails to load
 */
export async function loadArucoLibrary(dict = 'ARUCO_4X4_1000') {
  const loader = DICT_LOADERS[dict]
  if (!loader) throw new Error(`Unknown ArUco dictionary: ${dict}`)

  if (!AR) {
    const mod = await import('js-aruco2')
    AR = mod.AR || mod.default?.AR
    if (!AR) throw new Error('Failed to load ArUco library')
    // Expose globally so dictionary files can find it via this.AR / window.AR
    window.AR = AR
  }

  if (!AR.DICTIONARIES?.[dict]) {
    await loader()
  }
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
  if (!AR?.Detector) throw new Error('ArUco library not loaded')
  return new AR.Detector({ dictionaryName: dict })
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
