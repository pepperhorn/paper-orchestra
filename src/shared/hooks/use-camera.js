import { useState, useCallback, useRef, useEffect } from 'react'
import { initCamera, stopCamera } from '@shared/detection/camera'

export function useCamera(videoRef) {
  const [camReady, setCamReady] = useState(false)
  const [error, setError] = useState(null)
  const streamRef = useRef(null)

  const startCamera = useCallback(async (options) => {
    if (!videoRef.current) return
    try {
      streamRef.current = await initCamera(videoRef.current, options)
      setCamReady(true)
      setError(null)
    } catch (err) {
      setError(err.message)
      setCamReady(false)
    }
  }, [videoRef])

  const stop = useCallback(() => {
    if (videoRef.current) stopCamera(videoRef.current)
    streamRef.current = null
    setCamReady(false)
  }, [videoRef])

  useEffect(() => {
    return () => {
      if (videoRef.current) stopCamera(videoRef.current)
    }
  }, [videoRef])

  return { startCamera, stopCamera: stop, camReady, error }
}
