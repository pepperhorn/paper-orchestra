// hands.js — MediaPipe Hands loading and tracker creation

const MP_HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
const MP_CAMERA_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils'

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
 * Load MediaPipe Hands and Camera Utils scripts from CDN.
 */
export async function loadMediaPipeHands() {
  await loadScript(`${MP_HANDS_CDN}/hands.js`)
  await loadScript(`${MP_CAMERA_CDN}/camera_utils.js`)
}

/**
 * Create a MediaPipe hand tracker with camera loop.
 *
 * @param {HTMLVideoElement} videoEl - Video element for camera input
 * @param {Function} onResults - Callback receiving hand tracking results
 * @param {Object} options - Tracker configuration
 * @param {number} options.maxHands - Maximum hands to track (default 2)
 * @param {number} options.complexity - Model complexity 0-2 (default 0)
 * @param {number} options.detection - Min detection confidence (default 0.72)
 * @param {number} options.tracking - Min tracking confidence (default 0.55)
 * @param {number} options.width - Camera width (default 640)
 * @param {number} options.height - Camera height (default 480)
 * @returns {{ hands: Object, camera: Object }} MediaPipe Hands and Camera instances
 */
export function createHandTracker(videoEl, onResults, options = {}) {
  const {
    maxHands = 2,
    complexity = 0,
    detection = 0.72,
    tracking = 0.55,
    width = 640,
    height = 480,
  } = options

  // eslint-disable-next-line no-undef
  const hands = new Hands({ locateFile: f => `${MP_HANDS_CDN}/${f}` })
  hands.setOptions({
    maxNumHands: maxHands,
    modelComplexity: complexity,
    minDetectionConfidence: detection,
    minTrackingConfidence: tracking,
  })
  hands.onResults(onResults)

  // eslint-disable-next-line no-undef
  const camera = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }) },
    width,
    height,
  })
  camera.start()

  return { hands, camera }
}

/** MediaPipe landmark indices for fingertips: thumb, index, middle, ring, pinky */
export const FINGERTIP_IDS = [4, 8, 12, 16, 20]
