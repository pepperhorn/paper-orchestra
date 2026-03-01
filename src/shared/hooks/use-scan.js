import { useState, useCallback, useRef } from 'react'
import { createScanSession, loadSavedMarkers, clearSavedMarkers } from '@shared/detection/scan'

export function useScan(options = {}) {
  const { storageKey, minMarkers, duration } = options
  const [scanning, setScanning] = useState(false)
  const [markers, setMarkers] = useState(() => loadSavedMarkers(storageKey) || {})
  const [status, setStatus] = useState(() => {
    const saved = loadSavedMarkers(storageKey)
    return saved ? 'ready' : 'scan_needed'
  })
  const [message, setMessage] = useState(() => {
    const saved = loadSavedMarkers(storageKey)
    if (saved) return `Restored ${Object.keys(saved).length} markers from last session.`
    return 'Point camera at template and click Scan.'
  })
  const sessionRef = useRef(null)

  const startScan = useCallback(() => {
    const session = createScanSession({ storageKey, minMarkers, duration })
    sessionRef.current = session

    session.onComplete(({ markers: m, count, success }) => {
      setScanning(false)
      if (success) {
        setMarkers(m)
        setStatus('ready')
        setMessage(`Scan complete: ${count} markers learned.`)
      } else {
        setMessage(`Only ${count} markers found — need at least ${minMarkers || 8}. Try again.`)
      }
    })

    session.start()
    setScanning(true)
    setMessage('Scanning... keep template visible for 2 seconds.')
  }, [storageKey, minMarkers, duration])

  const feedMarkers = useCallback((detected) => {
    sessionRef.current?.feedMarkers(detected)
  }, [])

  const resetScan = useCallback(() => {
    clearSavedMarkers(storageKey)
    setMarkers({})
    setStatus('scan_needed')
    setMessage('Markers cleared. Point camera at template and click Scan.')
    sessionRef.current = null
  }, [storageKey])

  return {
    scanning,
    startScan,
    resetScan,
    feedMarkers,
    markers,
    markerCount: Object.keys(markers).length,
    status,
    message,
    setStatus,
    setMessage,
    setMarkers,
  }
}
