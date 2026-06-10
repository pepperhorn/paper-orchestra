# Orchestra Networking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add serverless LAN networking so multiple browser instruments can connect to a single orchestrator, with orchestrator identity (classical composer names), exclusive binding (one orchestrator per instrument), BPM/key sync, and conductor controls.

**Architecture:** A lightweight WebSocket server built into a new `server/` directory in this repo. The teacher's device runs `pnpm orchestra` which starts an Express + ws process on port 3000. Each orchestrator instance gets a random classical composer name as its session ID (e.g. "Debussy"). Instruments discover orchestrators via manual URL entry or LAN broadcast. Once connected, an instrument locks to that orchestrator ID and rejects connections from any other until explicitly reset. BPM, key, and conductor commands flow over WebSocket as JSON-encoded OSC-style messages. Instruments fall back to standalone mode on disconnect.

**Tech Stack:** Node.js, Express, ws (WebSocket), React hooks for client transport, existing Tone.js transport for BPM sync. No external OSC library yet (DAW bridge is Phase 2, deferred).

---

## Conventions

- **No test framework configured** — this project tests live in-browser with camera + printed template. Verification steps use `curl`, `wscat`, browser console, and build checks.
- **pnpm** is the package manager.
- **Path aliases**: `@shared` → `src/shared`, `@instruments` → `src/instruments`.
- **Existing audio hook point**: `synth.onRecord = callback` — already used by the recording engine, can be extended to emit network events.

---

## Task 1: Server Dependencies + Script

**Files:**
- Modify: `package.json`

**Step 1: Add server dependencies and orchestra script**

Add `ws` and `express` as dependencies (they'll be used by the server process). Add a new script `orchestra` to start the server.

In `package.json`, add to `dependencies`:
```json
"express": "^4.21.0",
"ws": "^8.18.0"
```

Add to `scripts`:
```json
"orchestra": "node server/index.js"
```

**Step 2: Install**

Run: `pnpm install`
Expected: `express` and `ws` added successfully.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add express + ws deps and orchestra script"
```

---

## Task 2: Orchestrator Identity — Composer Names

**Files:**
- Create: `server/composers.js`

**Step 1: Create the composer name generator**

This module provides a pool of classical composer surnames. On server start, one is picked at random as the session ID. If a second orchestrator starts on the same network, it gets a different name — instruments use this to distinguish them.

```js
// server/composers.js

const COMPOSERS = [
  'Bach', 'Mozart', 'Beethoven', 'Chopin', 'Debussy',
  'Vivaldi', 'Brahms', 'Schubert', 'Tchaikovsky', 'Handel',
  'Haydn', 'Liszt', 'Dvorak', 'Mahler', 'Ravel',
  'Stravinsky', 'Prokofiev', 'Rachmaninoff', 'Elgar', 'Grieg',
  'Mendelssohn', 'Puccini', 'Verdi', 'Wagner', 'Sibelius',
  'Shostakovich', 'Bartok', 'Satie', 'Faure', 'Holst',
]

export function pickComposerName() {
  const idx = Math.floor(Math.random() * COMPOSERS.length)
  return COMPOSERS[idx]
}

export { COMPOSERS }
```

**Step 2: Commit**

```bash
git add server/composers.js
git commit -m "feat: composer name pool for orchestrator identity"
```

---

## Task 3: WebSocket Server + Session Registry

**Files:**
- Create: `server/index.js`
- Create: `server/registry.js`

**Step 1: Create the player registry**

The registry tracks connected instruments: their ID, name, instrument type, and connection state. Each player gets a unique ID on connect.

```js
// server/registry.js

let nextId = 1

export function createRegistry() {
  const players = new Map()

  return {
    add(ws, info = {}) {
      const id = `player-${nextId++}`
      const player = {
        id,
        ws,
        name: info.name || `Instrument ${nextId - 1}`,
        instrument: info.instrument || 'unknown',
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      }
      players.set(id, player)
      ws._playerId = id
      return player
    },

    remove(ws) {
      const id = ws._playerId
      if (id) players.delete(id)
      return id
    },

    get(id) {
      return players.get(id)
    },

    updateHeartbeat(ws) {
      const id = ws._playerId
      const player = players.get(id)
      if (player) player.lastHeartbeat = Date.now()
    },

    all() {
      return [...players.values()].map(({ ws, ...rest }) => rest)
    },

    get count() {
      return players.size
    },

    broadcast(msg, excludeWs = null) {
      const data = typeof msg === 'string' ? msg : JSON.stringify(msg)
      for (const [, player] of players) {
        if (player.ws !== excludeWs && player.ws.readyState === 1) {
          player.ws.send(data)
        }
      }
    },
  }
}
```

**Step 2: Create the main server**

Express serves a simple status page. WebSocket handles instrument connections. The orchestrator announces its composer name in every welcome message and heartbeat response.

```js
// server/index.js

import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { pickComposerName } from './composers.js'
import { createRegistry } from './registry.js'

const PORT = parseInt(process.env.PORT || '3000', 10)
const orchestratorId = pickComposerName()
const registry = createRegistry()

// Session state (conductor-controlled)
const session = {
  bpm: 120,
  key: 'C',
  scale: 'major',
  conductorId: null, // null = teacher is conductor
}

const app = express()
app.use(express.json())

// Status endpoint
app.get('/', (req, res) => {
  res.json({
    orchestrator: orchestratorId,
    players: registry.count,
    session,
  })
})

// Player list
app.get('/players', (req, res) => {
  res.json({ orchestrator: orchestratorId, players: registry.all() })
})

// Broadcast BPM
app.post('/broadcast/tempo', (req, res) => {
  const { bpm } = req.body
  if (typeof bpm !== 'number' || bpm < 40 || bpm > 240) {
    return res.status(400).json({ error: 'bpm must be 40-240' })
  }
  session.bpm = bpm
  registry.broadcast({ type: 'session/tempo', bpm, orchestrator: orchestratorId })
  res.json({ ok: true, bpm })
})

// Broadcast key
app.post('/broadcast/key', (req, res) => {
  const { key, scale } = req.body
  if (!key) return res.status(400).json({ error: 'key required' })
  session.key = key
  if (scale) session.scale = scale
  registry.broadcast({ type: 'session/key', key, scale: session.scale, orchestrator: orchestratorId })
  res.json({ ok: true, key, scale: session.scale })
})

// Command a specific player
app.post('/command/:playerId', (req, res) => {
  const { command } = req.body
  const player = registry.get(req.params.playerId)
  if (!player) return res.status(404).json({ error: 'player not found' })
  if (player.ws.readyState === 1) {
    player.ws.send(JSON.stringify({
      type: 'session/command',
      command,
      orchestrator: orchestratorId,
    }))
  }
  res.json({ ok: true })
})

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/hub' })

wss.on('connection', (ws) => {
  // Send welcome with orchestrator identity
  ws.send(JSON.stringify({
    type: 'welcome',
    orchestrator: orchestratorId,
    session,
  }))

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'register') {
      const player = registry.add(ws, { name: msg.name, instrument: msg.instrument })
      ws.send(JSON.stringify({
        type: 'registered',
        playerId: player.id,
        orchestrator: orchestratorId,
      }))
      // Announce to teacher / other clients
      registry.broadcast({
        type: 'player/joined',
        player: { id: player.id, name: player.name, instrument: player.instrument },
        orchestrator: orchestratorId,
      }, ws)
      console.log(`  + ${player.name} (${player.instrument}) joined as ${player.id}`)
      return
    }

    if (msg.type === 'heartbeat') {
      registry.updateHeartbeat(ws)
      ws.send(JSON.stringify({ type: 'heartbeat-ack', orchestrator: orchestratorId }))
      return
    }

    // Forward instrument events to all other clients (for teacher UI / monitoring)
    if (msg.type?.startsWith('instrument/')) {
      msg.playerId = ws._playerId
      msg.orchestrator = orchestratorId
      registry.broadcast(msg, ws)
    }
  })

  ws.on('close', () => {
    const id = registry.remove(ws)
    if (id) {
      registry.broadcast({
        type: 'player/left',
        playerId: id,
        orchestrator: orchestratorId,
      })
      console.log(`  - ${id} disconnected`)
    }
  })
})

server.listen(PORT, () => {
  console.log()
  console.log(`  Paper Orchestra Hub`)
  console.log(`  ───────────────────────────────────`)
  console.log(`  Orchestrator:  ${orchestratorId}`)
  console.log(`  Hub:           ws://localhost:${PORT}/hub`)
  console.log(`  Status:        http://localhost:${PORT}/`)
  console.log(`  Players:       http://localhost:${PORT}/players`)
  console.log()
  console.log(`  Instruments connect to ws://{your-ip}:${PORT}/hub`)
  console.log()
})
```

**Step 3: Verify server starts**

Run: `pnpm orchestra`
Expected:
```
  Paper Orchestra Hub
  ───────────────────────────────────
  Orchestrator:  Debussy
  Hub:           ws://localhost:3000/hub
  ...
```

**Step 4: Verify status endpoint**

Run: `curl http://localhost:3000/`
Expected: JSON with `orchestrator`, `players: 0`, `session`.

**Step 5: Commit**

```bash
git add server/index.js server/registry.js
git commit -m "feat: WebSocket orchestrator hub with composer identity and player registry"
```

---

## Task 4: Client Transport Layer — Exclusive Orchestrator Binding

**Files:**
- Create: `src/shared/network/transport.js`

**Step 1: Create the client-side WebSocket transport**

This is the critical piece. It handles:
- Connecting to an orchestrator by URL
- Locking to an orchestrator ID on first `welcome` message
- **Rejecting** any future connection to a different orchestrator ID until `reset()`
- Reconnection with exponential backoff
- Graceful fallback to standalone on disconnect
- Emitting received session updates (BPM, key, commands)

```js
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
```

**Step 2: Commit**

```bash
git add src/shared/network/transport.js
git commit -m "feat: client transport with exclusive orchestrator binding (composer ID lock)"
```

---

## Task 5: React Hook — useOrchestra

**Files:**
- Create: `src/shared/hooks/use-orchestra.js`

**Step 1: Create the React hook wrapping the transport**

This hook provides the orchestra connection state to React components. It handles connecting/disconnecting, applying session updates (BPM override), and exposing mode state.

```js
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
```

**Step 2: Commit**

```bash
git add src/shared/hooks/use-orchestra.js
git commit -m "feat: useOrchestra React hook with mode/orchestrator state"
```

---

## Task 6: Orchestra Connection UI — Mode Indicator + Hub Entry

**Files:**
- Create: `src/shared/components/ui/orchestra-badge.jsx`

**Step 1: Create the orchestra badge component**

This renders in the instrument shell header. Shows current mode (standalone/ensemble), orchestrator name, player count, and provides a connect/disconnect interface.

```jsx
// src/shared/components/ui/orchestra-badge.jsx

import { useState } from 'react'
import { cn } from '@shared/lib/utils'

export default function OrchestraBadge({
  mode,
  orchestrator,
  connected,
  playerCount,
  rejected,
  onConnect,
  onDisconnect,
  onReset,
}) {
  const [hubUrl, setHubUrl] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [name, setName] = useState('')

  function handleConnect(e) {
    e.preventDefault()
    if (!hubUrl.trim()) return
    const url = hubUrl.startsWith('ws') ? hubUrl : `ws://${hubUrl}/hub`
    onConnect(url, { name: name || undefined })
    setShowInput(false)
  }

  return (
    <div className="w-full max-w-[600px]">
      {/* Mode indicator */}
      <div className="flex items-center gap-2 text-[0.68rem]">
        {connected ? (
          <>
            <div className="flex items-center gap-1.5 bg-success/15 border border-success/40 rounded-md px-2.5 py-1">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-success font-bold tracking-wider">ENSEMBLE</span>
              <span className="text-success/70 font-mono">{orchestrator}</span>
              <span className="text-success/50">{playerCount} players</span>
            </div>
            <button
              onClick={onDisconnect}
              className="text-text-muted hover:text-error text-[0.6rem] cursor-pointer bg-transparent border-none"
            >
              disconnect
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-md px-2.5 py-1">
              <div className="w-2 h-2 rounded-full bg-text-faint" />
              <span className="text-text-muted tracking-wider">STANDALONE</span>
            </div>
            <button
              onClick={() => setShowInput(s => !s)}
              className="text-info text-[0.6rem] cursor-pointer bg-transparent border-none hover:underline"
            >
              {showInput ? 'cancel' : 'join orchestra'}
            </button>
          </>
        )}
      </div>

      {/* Rejected warning */}
      {rejected && (
        <div className="mt-1 text-[0.6rem] text-warning bg-warning/10 border border-warning/30 rounded px-2 py-0.5">
          Rejected: already locked to <strong>{rejected.locked}</strong>,
          cannot join <strong>{rejected.attempted}</strong>.
          <button onClick={onReset} className="ml-1 text-accent underline cursor-pointer bg-transparent border-none">
            Reset lock
          </button>
        </div>
      )}

      {/* Connect form */}
      {showInput && !connected && (
        <form onSubmit={handleConnect} className="mt-1.5 flex gap-1.5 items-end">
          <div className="flex-1">
            <label className="text-[0.52rem] text-text-dim block mb-0.5">Hub address</label>
            <input
              type="text"
              value={hubUrl}
              onChange={e => setHubUrl(e.target.value)}
              placeholder="192.168.1.x:3000"
              className="w-full bg-surface-raised border border-white/10 rounded px-2 py-1 text-[0.72rem] text-text-primary font-mono outline-none focus:border-info/50"
            />
          </div>
          <div>
            <label className="text-[0.52rem] text-text-dim block mb-0.5">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="optional"
              className="w-24 bg-surface-raised border border-white/10 rounded px-2 py-1 text-[0.72rem] text-text-primary outline-none focus:border-info/50"
            />
          </div>
          <button
            type="submit"
            className="rounded px-3 py-1 text-[0.68rem] bg-info/20 border border-info/40 text-info cursor-pointer font-bold"
          >
            Join
          </button>
        </form>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/shared/components/ui/orchestra-badge.jsx
git commit -m "feat: OrchestraBadge UI component for mode display and hub connection"
```

---

## Task 7: Integrate Orchestra into InstrumentShell

**Files:**
- Modify: `src/shared/components/ui/instrument-shell.jsx`

**Step 1: Add orchestra slot to InstrumentShell**

Add an optional `orchestraBadge` prop rendered between the status bar and the camera area. This keeps the integration non-breaking — instruments that don't pass it render exactly as before.

In `instrument-shell.jsx`, add `orchestraBadge` to the props destructuring, then render it after the status bar div and before the camera/sidebar section:

```jsx
// After the status bar div (the one with statusMessage), add:
{orchestraBadge}
```

The prop is just a ReactNode, so instruments pass `<OrchestraBadge ...props />`.

**Step 2: Commit**

```bash
git add src/shared/components/ui/instrument-shell.jsx
git commit -m "feat: add orchestraBadge slot to InstrumentShell"
```

---

## Task 8: Wire Orchestra into Paper Piano

**Files:**
- Modify: `src/instruments/piano/PaperPiano.jsx`

**Step 1: Add orchestra hook and badge to PaperPiano**

Import `useOrchestra` and `OrchestraBadge`. Wire BPM sync from orchestrator → local state. Forward note events to the orchestrator transport.

Add imports:
```js
import { useOrchestra } from '@shared/hooks/use-orchestra'
import OrchestraBadge from '@shared/components/ui/orchestra-badge'
```

Inside the component, after the existing `useTransport()` call, add:
```js
const orchestra = useOrchestra({
  onBpmChange: (newBpm) => setBpm(newBpm),
  onKeyChange: (key, scale) => { /* future: transpose */ },
  onCommand: (cmd) => {
    if (cmd === 'mute') synthRef.current?.allNotesOff()
  },
})
```

In the `ensureAudio` function, after creating the synth, wrap `synth.noteOn` and `synth.noteOff` to also send note events to the orchestrator:
```js
// After synthRef.current = synth, add:
const origNoteOn = synth.noteOn.bind(synth)
const origNoteOff = synth.noteOff.bind(synth)
synth.noteOn = (id, freq, vel, time) => {
  origNoteOn(id, freq, vel, time)
  orchestra.sendNoteEvent(id, freq, vel, 'on')
}
synth.noteOff = (id, time) => {
  origNoteOff(id, time)
  orchestra.sendNoteEvent(id, 0, 0, 'off')
}
```

Pass the orchestra badge to InstrumentShell:
```jsx
<InstrumentShell
  ...existing props...
  orchestraBadge={
    <OrchestraBadge
      mode={orchestra.mode}
      orchestrator={orchestra.orchestrator}
      connected={orchestra.connected}
      playerCount={orchestra.playerCount}
      rejected={orchestra.rejected}
      onConnect={(url, info) => orchestra.connect(url, { ...info, instrument: 'piano' })}
      onDisconnect={orchestra.disconnect}
      onReset={orchestra.reset}
    />
  }
>
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/instruments/piano/PaperPiano.jsx
git commit -m "feat: wire Paper Piano to orchestra with BPM sync and note forwarding"
```

---

## Task 9: Wire Orchestra into Drum + Wind

**Files:**
- Modify: `src/instruments/drum/PaperDrum.jsx`
- Modify: `src/instruments/wind/PaperWind.jsx`

**Step 1: Wire PaperDrum**

Same pattern as Piano: import `useOrchestra` + `OrchestraBadge`, add hook, pass badge to shell. Drum note events fire from `triggerSample` — add `orchestra.sendNoteEvent(padIndex, 0, vel, 'on')` there.

**Step 2: Wire PaperWind**

Same pattern. Wind note events fire from `playNote` — add `orchestra.sendNoteEvent('wind', freq, dynamics, 'on')` there, and in `stopNote` send `'off'`.

**Step 3: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/instruments/drum/PaperDrum.jsx src/instruments/wind/PaperWind.jsx
git commit -m "feat: wire Drum and Wind instruments to orchestra"
```

---

## Task 10: Vite Path Alias for Network Module

**Files:**
- Modify: `vite.config.js`

**Step 1: Ensure the `@shared` alias already covers `src/shared/network/`**

The existing alias `@shared` → `src/shared` already covers `src/shared/network/transport.js`. Verify by checking that `import { createOrchestraTransport } from '@shared/network/transport'` resolves correctly in the build.

Run: `pnpm build`
Expected: No import resolution errors.

If it works, no changes needed to vite.config.js — skip to commit.

**Step 2: Commit (if any changes)**

```bash
git add vite.config.js
git commit -m "chore: verify network alias resolution"
```

---

## Task 11: End-to-End Verification

**Step 1: Start the orchestrator**

Run: `pnpm orchestra`
Expected: Server starts, prints composer name.

**Step 2: Test WebSocket with wscat**

Run: `npx wscat -c ws://localhost:3000/hub`
Send: `{"type":"register","name":"Test","instrument":"piano"}`
Expected: Receive `welcome` then `registered` messages with orchestrator name.

**Step 3: Test exclusive binding (second orchestrator rejection)**

Start a second server on a different port (PORT=3001). Connect an instrument to the first server. Then try to connect the same transport instance to the second server — it should reject because the orchestrator ID is different.

This is verified by the client transport logic: `lockedOrchestrator` is set on first `welcome`, and any message with a different `orchestrator` field triggers close with code 4001.

**Step 4: Test REST endpoints**

Run: `curl -X POST http://localhost:3000/broadcast/tempo -H 'Content-Type: application/json' -d '{"bpm":140}'`
Expected: All connected WebSocket clients receive `{"type":"session/tempo","bpm":140,...}`.

**Step 5: Start dev server and test in browser**

Run: `pnpm dev` (in a separate terminal)
Open: `http://localhost:5173`
Navigate to Paper Piano. The OrchestraBadge should show "STANDALONE" with a "join orchestra" link.
Click "join orchestra", enter `localhost:3000`, click Join.
Badge should switch to "ENSEMBLE [ComposerName]".

**Step 6: Verify BPM sync**

While connected, POST a tempo change via curl:
```bash
curl -X POST http://localhost:3000/broadcast/tempo -H 'Content-Type: application/json' -d '{"bpm":180}'
```
Piano's BPM should update to 180 in the UI.

**Step 7: Commit**

No code changes in this task — just verification.

---

## Task 12: Update CLAUDE.md + Build Plan

**Files:**
- Modify: `CLAUDE.md`
- Modify: `build-plans/orchestra/BUILD_PLAN.md`

**Step 1: Add networking section to CLAUDE.md**

Add after the "Key Constraints" section:

```markdown
### Networking (Orchestra Mode)

Server: `pnpm orchestra` starts Express + WebSocket on port 3000. Each orchestrator gets a random classical composer name as session ID. Instruments connect via `ws://{ip}:3000/hub`.

**Exclusive binding**: Instruments lock to the first orchestrator they connect to (by composer name). Connections to a different orchestrator are rejected with close code 4001 until the instrument explicitly resets.

**Data flow**: Instruments → hub (note events as JSON). Hub → instruments (BPM, key, commands as JSON broadcasts). No OSC/DAW bridge yet (Phase 2).

**Key files**:
- `server/index.js` — Express + WebSocket hub
- `server/registry.js` — player tracking
- `server/composers.js` — orchestrator name pool
- `src/shared/network/transport.js` — client WebSocket transport with exclusive binding
- `src/shared/hooks/use-orchestra.js` — React hook for mode/connection state
- `src/shared/components/ui/orchestra-badge.jsx` — mode indicator + connect UI
```

**Step 2: Add orchestrator ID section to BUILD_PLAN.md**

After the "Two Operating Modes" section, add a new section:

```markdown
### Orchestrator Identity

Each orchestrator instance is assigned a random classical composer surname (e.g. "Debussy", "Bach", "Stravinsky") on startup. This name:
- Is displayed in the console on server start
- Is sent in every WebSocket message as the `orchestrator` field
- Is shown in the instrument UI when connected

**Exclusive binding**: When an instrument first connects to an orchestrator, it records that composer name as its `lockedOrchestrator`. All subsequent messages are checked against this ID. If a message arrives from a different orchestrator (e.g. a second hub started on the network), the instrument closes the connection with code 4001 and shows a rejection warning. The lock persists until the user explicitly clicks "Reset lock" in the UI.

This prevents instruments from accidentally connecting to the wrong session when multiple orchestrators exist on the same network.
```

**Step 3: Commit**

```bash
git add CLAUDE.md build-plans/orchestra/BUILD_PLAN.md
git commit -m "docs: add networking architecture and orchestrator identity to CLAUDE.md and BUILD_PLAN"
```

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `server/index.js` | Express + WebSocket hub, orchestrator identity, REST API |
| `server/registry.js` | Player tracking, broadcast |
| `server/composers.js` | Classical composer name pool |
| `src/shared/network/transport.js` | Client WebSocket transport with exclusive orchestrator binding |
| `src/shared/hooks/use-orchestra.js` | React hook for orchestra mode/connection |
| `src/shared/components/ui/orchestra-badge.jsx` | Mode indicator + hub connection UI |

## Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `express`, `ws` deps + `orchestra` script |
| `vite.config.js` | Verify alias (likely no change needed) |
| `src/shared/components/ui/instrument-shell.jsx` | Add `orchestraBadge` prop slot |
| `src/instruments/piano/PaperPiano.jsx` | Wire orchestra hook + badge + note forwarding |
| `src/instruments/drum/PaperDrum.jsx` | Wire orchestra hook + badge |
| `src/instruments/wind/PaperWind.jsx` | Wire orchestra hook + badge |
| `CLAUDE.md` | Document networking architecture |
| `build-plans/orchestra/BUILD_PLAN.md` | Document orchestrator identity + exclusive binding |

## What's Deferred (Future Work)

- **OSC/DAW bridge** (UDP out to Ableton/Max/SC) — Phase 2, requires `node-osc`
- **Teacher control UI** (React dashboard with channel strips) — Phase 3
- **mDNS auto-discovery** — instruments auto-find hub without typing IP
- **Session recording on server** (JSON-lines capture + replay) — Phase 2
- **Conductor role delegation** (student promoted to conductor) — Phase 3
- **Key/scale enforcement** (transpose instruments to match conductor key) — Phase 2
