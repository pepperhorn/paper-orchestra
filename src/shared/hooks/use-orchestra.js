// src/shared/hooks/use-orchestra.js

import { useState, useCallback, useRef, useEffect } from 'react'
import { createOrchestraTransport } from '@shared/network/transport'

export function useOrchestra({ onBpmChange, onKeyChange, onCommand } = {}) {
  const transportRef = useRef(null)
  const [mode, setMode] = useState('standalone') // standalone | ensemble
  const [orchestrator, setOrchestrator] = useState(null) // composer name
  const [connected, setConnected] = useState(false)
  const [playerCount, setPlayerCount] = useState(0)
  const [rejected, setRejected] = useState(null) // { locked, attempted }

  // Stable refs for callbacks
  const cbRefs = useRef({ onBpmChange, onKeyChange, onCommand })
  useEffect(() => { cbRefs.current = { onBpmChange, onKeyChange, onCommand } })

  // Initialize transport once
  if (!transportRef.current) {
    const t = createOrchestraTransport()

    t.on('onConnect', ({ orchestrator: name, session }) => {
      setConnected(true)
      setMode('ensemble')
      setOrchestrator(name)
      setRejected(null)
      // Apply session state from orchestrator
      if (session?.bpm) cbRefs.current.onBpmChange?.(session.bpm)
      if (session?.key) cbRefs.current.onKeyChange?.(session.key, session.scale)
    })

    t.on('onDisconnect', () => {
      setConnected(false)
      setMode('standalone')
    })

    t.on('onSessionUpdate', (update) => {
      if (update.bpm) cbRefs.current.onBpmChange?.(update.bpm)
      if (update.key) cbRefs.current.onKeyChange?.(update.key, update.scale)
    })

    t.on('onCommand', (cmd) => {
      cbRefs.current.onCommand?.(cmd)
    })

    t.on('onPlayerJoined', () => setPlayerCount(c => c + 1))
    t.on('onPlayerLeft', () => setPlayerCount(c => Math.max(0, c - 1)))

    t.on('onRejected', (info) => {
      setRejected(info)
      setTimeout(() => setRejected(null), 5000) // Clear after 5s
    })

    transportRef.current = t
  }

  const connect = useCallback((hubUrl, info) => {
    transportRef.current.connect(hubUrl, info)
  }, [])

  const disconnect = useCallback(() => {
    transportRef.current.disconnect()
  }, [])

  const reset = useCallback(() => {
    transportRef.current.reset()
    setOrchestrator(null)
    setConnected(false)
    setMode('standalone')
    setRejected(null)
    setPlayerCount(0)
  }, [])

  const sendNoteEvent = useCallback((id, freq, vel, type) => {
    transportRef.current.sendNoteEvent(id, freq, vel, type)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => transportRef.current?.disconnect()
  }, [])

  return {
    mode,
    orchestrator,
    connected,
    playerCount,
    rejected,
    connect,
    disconnect,
    reset,
    sendNoteEvent,
    transport: transportRef.current,
  }
}
