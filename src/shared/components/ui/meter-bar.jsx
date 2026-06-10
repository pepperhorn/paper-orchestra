import { cn } from '@shared/lib/utils'

export default function MeterBar({
  label,
  value = 0,
  direction = 'vertical',
  className,
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const isVert = direction === 'vertical'

  return (
    <div className={cn('flex items-center gap-1.5', isVert ? 'flex-col' : 'flex-row', className)}>
      {label && (
        <div className="text-[0.6rem] text-gray-400 tracking-wide uppercase font-medium min-w-8">{label}</div>
      )}
      <div
        className={cn(
          'bg-gray-100 rounded-full relative overflow-hidden',
          isVert ? 'w-3 h-[72px]' : 'h-2 w-[72px]'
        )}
      >
        <div
          className="absolute bg-gray-500 rounded-full transition-all duration-[40ms]"
          style={isVert
            ? { bottom: 0, left: 0, right: 0, height: `${pct}%` }
            : { left: 0, top: 0, bottom: 0, width: `${pct}%` }
          }
        />
      </div>
      <div className="text-[0.6rem] font-mono text-gray-400 min-w-6">{pct}%</div>
    </div>
  )
}
