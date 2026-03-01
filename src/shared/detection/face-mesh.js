// face-mesh.js — MediaPipe FaceMesh loading and tracker creation
// Used by wind instruments for lip/breath detection

const MP_FACE_MESH_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619'

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
 * Load FaceMesh script from CDN.
 */
export async function loadFaceMesh() {
  await loadScript(`${MP_FACE_MESH_CDN}/face_mesh.js`)
}

/**
 * Create a FaceMesh tracker instance.
 *
 * @param {HTMLVideoElement} videoEl - Video element (unused directly, but available for caller's camera loop)
 * @param {Function} onResults - Callback receiving face mesh results
 * @returns {Object} FaceMesh instance
 */
export function createFaceMeshTracker(videoEl, onResults) {
  // eslint-disable-next-line no-undef
  const faceMesh = new FaceMesh({
    locateFile: f => `${MP_FACE_MESH_CDN}/${f}`,
  })
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  })
  faceMesh.onResults(onResults)
  return faceMesh
}
