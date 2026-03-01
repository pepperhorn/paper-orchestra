import { useReducer, useCallback } from 'react'

const MAX_ROLL = 64
const NOTE_COLORS = {
  'C': '#e8c97a', 'C#': '#d4884a', 'D': '#b8d4e8', 'D#': '#9090d0',
  'E': '#7abe8a', 'F': '#e87878', 'F#': '#c06888', 'G': '#78c8d8',
  'G#': '#a898e0', 'A': '#d8b878', 'A#': '#90c898', 'B': '#e8a878',
}

function rollReducer(state, action) {
  if (action.type === 'ADD') {
    return [{ id: Date.now() + Math.random(), note: action.note, vel: action.vel }, ...state].slice(0, MAX_ROLL)
  }
  if (action.type === 'CLEAR') return []
  return state
}

export function usePianoRoll() {
  const [roll, dispatch] = useReducer(rollReducer, [])
  const addNote = useCallback((note, vel) => dispatch({ type: 'ADD', note, vel }), [])
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])
  return { roll, addNote, clear }
}

export default function PianoRoll({ roll = [] }) {
  return (
    <div className="bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/[0.07] h-16 overflow-hidden">
      <div className="text-[0.58rem] text-text-dim tracking-wider mb-0.5">ROLL</div>
      <div className="flex gap-0.5 items-end h-[42px] overflow-x-hidden">
        {roll.map(e => {
          const base = e.note.replace(/[#']/g, '')[0] + (e.note.includes('#') ? '#' : '')
          const color = NOTE_COLORS[base] || '#aaa'
          return (
            <div
              key={e.id}
              className="rounded-sm shrink-0 flex items-center justify-center text-[0.42rem] font-mono text-[#111] font-bold"
              style={{
                background: color,
                opacity: 0.85,
                width: Math.max(7, e.vel * 15),
                height: Math.max(10, e.vel * 38),
              }}
            >
              {e.note}
            </div>
          )
        })}
        {!roll.length && (
          <span className="text-text-faint text-[0.68rem] italic">no notes yet</span>
        )}
      </div>
    </div>
  )
}
