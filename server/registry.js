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
