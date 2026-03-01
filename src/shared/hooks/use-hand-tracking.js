import { useState, useRef, useCallback, useEffect } from 'react'
import { loadMediaPipeHands, createHandTracker } from '@shared/detection/hands'

export function useHandTracking(videoRef, onResults) {
  const [isReady, setIsReady] = useState(false)
  const [handCount, setHandCount] = useState(0)
  const [fps, setFps] = useState(0)
  const fpsRef = useRef({ n: 0, last: Date.now() })
  const trackerRef = useRef(null)
  const onResultsRef = useRef(onResults)

  // Keep callback ref fresh without restarting tracker
  useEffect(() => { onResultsRef.current = onResults }, [onResults])

  const start = useCallback(async (options = {}) => {
    if (!videoRef.current) return
    try {
      await loadMediaPipeHands()
      trackerRef.current = createHandTracker(
        videoRef.current,
        (results) => {
          // FPS tracking
          fpsRef.current.n++
          const now = Date.now()
          if (now - fpsRef.current.last >= 1000) {
            setFps(fpsRef.current.n)
            fpsRef.current = { n: 0, last: now }
          }
          setHandCount(results.multiHandLandmarks?.length || 0)
          onResultsRef.current?.(results)
        },
        options
      )
      setIsReady(true)
    } catch (err) {
      console.warn('Hand tracking init failed:', err)
    }
  }, [videoRef])

  return { start, handCount, fps, isReady }
}
