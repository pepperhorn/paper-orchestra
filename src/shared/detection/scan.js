// scan.js — Marker scan session workflow with localStorage persistence

/**
 * Create a scan session that collects ArUco marker positions over a timed window.
 *
 * @param {Object} options - Scan configuration
 * @param {string} options.storageKey - localStorage key for saving markers (default 'airpiano_v3_markers')
 * @param {number} options.minMarkers - Minimum markers required for a successful scan (default 8)
 * @param {number} options.duration - Scan window duration in ms (default 2000)
 * @returns {Object} Scan session API
 */
export function createScanSession(options = {}) {
  const {
    storageKey = 'airpiano_v3_markers',
    minMarkers = 8,
    duration = 2000,
  } = options

  let markers = {}
  let scanning = false
  let onUpdate = null

  return {
    get scanning() { return scanning },
    get markers() { return markers },
    get markerCount() { return Object.keys(markers).length },

    /**
     * Start the scan window. After `duration` ms, scanning stops and
     * markers are saved to localStorage if enough were detected.
     */
    start() {
      scanning = true
      markers = {}
      setTimeout(() => {
        scanning = false
        const n = Object.keys(markers).length
        if (n >= minMarkers) {
          try { localStorage.setItem(storageKey, JSON.stringify(markers)) } catch (_) {}
        }
        onUpdate?.({ scanning: false, markers, count: n, success: n >= minMarkers })
      }, duration)
    },

    /**
     * Feed detected markers into the scan session.
     * Only accumulates while scanning is active.
     *
     * @param {Array} detected - Array of detected markers with id and corners
     */
    feedMarkers(detected) {
      if (!scanning) return
      for (const m of detected) {
        const cx = m.corners.reduce((s, p) => s + p.x, 0) / 4
        const cy = m.corners.reduce((s, p) => s + p.y, 0) / 4
        markers[m.id] = { cx, cy }
      }
    },

    /**
     * Register a callback for when the scan completes.
     *
     * @param {Function} fn - Callback receiving { scanning, markers, count, success }
     */
    onComplete(fn) { onUpdate = fn },
  }
}

/**
 * Load previously saved markers from localStorage.
 *
 * @param {string} storageKey - localStorage key (default 'airpiano_v3_markers')
 * @returns {Object|null} Saved marker positions or null if none/insufficient
 */
export function loadSavedMarkers(storageKey = 'airpiano_v3_markers') {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && Object.keys(saved).length >= 8) return saved
  } catch (_) {}
  return null
}

/**
 * Clear saved markers from localStorage.
 *
 * @param {string} storageKey - localStorage key (default 'airpiano_v3_markers')
 */
export function clearSavedMarkers(storageKey = 'airpiano_v3_markers') {
  try { localStorage.removeItem(storageKey) } catch (_) {}
}
