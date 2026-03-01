// camera.js — Pure JS camera initialization with environment→user→any fallback chain

/**
 * Initialize camera on a video element, trying environment-facing first,
 * then user-facing, then any available camera.
 *
 * @param {HTMLVideoElement} videoEl - The video element to attach the stream to
 * @param {Object} options - Optional configuration
 * @param {number} options.width - Requested video width (default 640)
 * @param {number} options.height - Requested video height (default 480)
 * @returns {Promise<MediaStream>} The active media stream
 * @throws {Error} If no camera can be accessed
 */
export async function initCamera(videoEl, options = {}) {
  const { width = 640, height = 480 } = options
  const modes = [{ facingMode: 'environment' }, { facingMode: 'user' }, {}]
  for (const mode of modes) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width, height, ...mode },
      })
      videoEl.srcObject = stream
      await videoEl.play()
      return stream
    } catch (_) {}
  }
  throw new Error('Camera access denied')
}

/**
 * Stop camera and release all tracks.
 *
 * @param {HTMLVideoElement} videoEl - The video element to detach
 */
export function stopCamera(videoEl) {
  const stream = videoEl?.srcObject
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    videoEl.srcObject = null
  }
}
