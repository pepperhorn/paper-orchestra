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
    <div className="w-full flex gap-1.5 items-center flex-wrap">
      {/* REC arm button */}
      <button
        onClick={onToggleArm}
        className={cn(
          'rounded-md px-2.5 py-0.5 text-[0.68rem] font-bold border cursor-pointer',
          recArmed
            ? 'bg-red-500/25 border-red-500/70 text-red-400'
            : 'bg-red-500/[0.08] border-red-500/30 text-red-300/60'
        )}
      >
        {recArmed ? '● REC' : 'REC'}
      </button>

      {/* Slot buttons */}
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
              'min-w-7 rounded-md px-1.5 py-0.5 text-[0.68rem] font-mono border cursor-pointer',
              isRec && 'bg-red-500/30 border-red-500/70 text-red-400',
              isPlay && 'bg-green-500/25 border-green-500/60 text-green-300',
              !isRec && !isPlay && filled && 'bg-accent/[0.12] border-accent/30 text-accent',
              !isRec && !isPlay && !filled && 'bg-white/[0.05] border-white/10 text-text-faint'
            )}
          >
            {isRec ? '●' : isPlay ? '▶' : i + 1}
          </button>
        )
      })}

      {/* Tap tempo */}
      <div className="ml-auto flex gap-1.5 items-center">
        {metroActive && (
          <span className="text-[0.62rem] font-mono text-success">{bpm} bpm</span>
        )}
        <button
          onClick={onTap}
          className={cn(
            'rounded-md px-2.5 py-0.5 text-[0.68rem] font-bold border cursor-pointer',
            metroActive
              ? 'bg-success/20 border-success/50 text-success'
              : 'bg-white/[0.05] border-white/10 text-text-muted'
          )}
        >
          {metroActive ? '■ TAP' : 'TAP'}
        </button>
      </div>
    </div>
  )
}
