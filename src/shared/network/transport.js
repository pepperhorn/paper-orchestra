// src/shared/network/transport.js

const RECONNECT_BASE = 1000
const RECONNECT_MAX = 10000
const HEARTBEAT_INTERVAL = 5000

export function createOrchestraTransport() {
  let ws = null
  let lockedOrchestrator = null // Once set, reject all others
  let playerId = null
  let url = null
  let reconnectTimer = null
  let heartbeatTimer = null
  let reconnectDelay = RECONNECT_BASE
  let intentionalClose = false
  let listeners = {
    onConnect: null,
    onDisconnect: null,
    onSessionUpdate: null,
    onCommand: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    onRejected: null,
  }

  function connect(hubUrl, info = {}) {
    if (ws && ws.readyState <= 1) return // already connected or connecting

    intentionalClose = false
    url = hubUrl

    try {
      ws = new WebSocket(hubUrl)
    } catch (err) {
      listeners.onDisconnect?.({ reason: err.message })
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE
      // Send registration
      ws.send(JSON.stringify({
        type: 'register',
        name: info.name || 'Instrument',
        instrument: info.instrument || 'unknown',
      }))
      startHeartbeat()
    }

    ws.onmessage = (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }

      // ── Orchestrator identity check ──
      if (msg.orchestrator) {
        if (lockedOrchestrator === null) {
          // First connection: lock to this orchestrator
          lockedOrchestrator = msg.orchestrator
        } else if (msg.orchestrator !== lockedOrchestrator) {
          // REJECT: different orchestrator
          listeners.onRejected?.({
            locked: lockedOrchestrator,
            attempted: msg.orchestrator,
          })
          intentionalClose = true
          ws.close(4001, `Locked to ${lockedOrchestrator}`)
          return
        }
      }

      switch (msg.type) {
        case 'welcome':
          listeners.onConnect?.({
            orchestrator: msg.orchestrator,
            session: msg.session,
          })
          break
        case 'registered':
          playerId = msg.playerId
          break
        case 'session/tempo':
          listeners.onSessionUpdate?.({ bpm: msg.bpm })
          break
        case 'session/key':
          listeners.onSessionUpdate?.({ key: msg.key, scale: msg.scale })
          break
        case 'session/command':
          listeners.onCommand?.(msg.command)
          break
        case 'player/joined':
          listeners.onPlayerJoined?.(msg.player)
          break
        case 'player/left':
          listeners.onPlayerLeft?.(msg.playerId)
          break
      }
    }

    ws.onclose = () => {
      stopHeartbeat()
      listeners.onDisconnect?.({ orchestrator: lockedOrchestrator })
      if (!intentionalClose) scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }

  function disconnect() {
    intentionalClose = true
    clearTimeout(reconnectTimer)
    stopHeartbeat()
    if (ws) { ws.close(1000, 'user disconnect'); ws = null }
  }

  function reset() {
    disconnect()
    lockedOrchestrator = null
    playerId = null
    url = null
  }

  function scheduleReconnect() {
    if (intentionalClose || !url) return
    reconnectTimer = setTimeout(() => {
      connect(url)
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX)
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'heartbeat' }))
      }
    }, HEARTBEAT_INTERVAL)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  }

  function send(msg) {
    if (ws?.readyState === 1) {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  function sendNoteEvent(id, freq, vel, type = 'on') {
    send({
      type: 'instrument/note',
      note: { id, freq, vel, eventType: type },
      t: Date.now(),
    })
  }

  return {
    connect,
    disconnect,
    reset,
    send,
    sendNoteEvent,

    get connected() { return ws?.readyState === 1 },
    get orchestrator() { return lockedOrchestrator },
    get playerId() { return playerId },
    get mode() { return ws?.readyState === 1 ? 'ensemble' : 'standalone' },

    on(event, fn) { listeners[event] = fn },
    off(event) { listeners[event] = null },
  }
}
