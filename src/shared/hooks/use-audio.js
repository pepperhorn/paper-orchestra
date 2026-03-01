import { useState, useCallback } from 'react'
import { audioManager } from '@shared/audio/manager'

export function useAudio() {
  const [isReady, setIsReady] = useState(audioManager.started)

  const ensureAudio = useCallback(async () => {
    await audioManager.ensure()
    setIsReady(true)
  }, [])

  return { ensureAudio, isReady, audioManager }
}
