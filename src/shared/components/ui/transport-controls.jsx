import { cn } from '@shared/lib/utils'

export default function TransportControls({
  recordings = [],
  recArmed = false,
  recSlot = null,
  playSlot = null,
  bpm = 120,
  metroActive = false,
  onToggleArm,
  onSlotClick,
  onSlotClear,
  onTap,
  onBpmChange,
}) {
  return (
    <div className="w-full flex gap-2 items-center flex-wrap">
      <button
        onClick={onToggleArm}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors',
          recArmed
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
        )}
      >
        {recArmed ? '● REC' : 'REC'}
      </button>

      {recordings.map((rec, i) => {
        const isRec = recSlot === i
        const isPlay = playSlot === i
        const filled = !!rec
        return (
          <button
            key={i}
            onClick={() => onSlotClick(i)}
            onContextMenu={e => { e.preventDefault(); if (filled) onSlotClear(i) }}
            className={cn(
              'min-w-7 rounded-md px-1.5 py-1.5 text-xs font-mono border cursor-pointer transition-colors',
              isRec && 'bg-gray-900 border-gray-900 text-white',
              isPlay && 'bg-gray-600 border-gray-600 text-white',
              !isRec && !isPlay && filled && 'bg-gray-100 border-gray-300 text-gray-700',
              !isRec && !isPlay && !filled && 'bg-white border-gray-200 text-gray-300'
            )}
          >
            {isRec ? '●' : isPlay ? '▶' : i + 1}
          </button>
        )
      })}

      <div className="ml-auto flex gap-2 items-center">
        {metroActive && (
          <span className="text-xs font-mono text-gray-500">{bpm} bpm</span>
        )}
        <button
          onClick={onTap}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors',
            metroActive
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
          )}
        >
          {metroActive ? '■ TAP' : 'TAP'}
        </button>
      </div>
    </div>
  )
}
