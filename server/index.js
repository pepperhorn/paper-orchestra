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
