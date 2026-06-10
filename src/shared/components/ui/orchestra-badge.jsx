// src/shared/components/ui/orchestra-badge.jsx

import { useState } from 'react'

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
