import { useReducer, useCallback } from 'react'

const MAX_ROLL = 64

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
    <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 h-16 overflow-hidden">
      <div className="text-[0.6rem] text-gray-400 tracking-wider font-medium mb-0.5 uppercase">Roll</div>
      <div className="flex gap-px items-end h-[42px] overflow-x-hidden">
        {roll.map(e => (
          <div
            key={e.id}
            className="rounded-sm shrink-0 flex items-center justify-center text-[0.42rem] font-mono text-white font-medium bg-gray-800"
            style={{
              width: Math.max(7, e.vel * 15),
              height: Math.max(10, e.vel * 38),
            }}
          >
            {e.note}
          </div>
        ))}
        {!roll.length && (
          <span className="text-gray-300 text-xs">no notes yet</span>
        )}
      </div>
    </div>
  )
}
