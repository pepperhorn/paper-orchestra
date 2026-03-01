import { cn } from '@shared/lib/utils'

export default function MeterBar({
  label,
  value = 0,
  color = '#60c0ff',
  direction = 'vertical',
  className,
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const isVert = direction === 'vertical'

  return (
    <div className={cn('flex items-center gap-1', isVert ? 'flex-col' : 'flex-row', className)}>
      {label && (
        <div className="text-[0.58rem] text-text-muted tracking-wide uppercase">{label}</div>
      )}
      <div
        className={cn(
          'bg-white/[0.07] rounded-lg border border-white/10 relative overflow-hidden',
          isVert ? 'w-5 h-[90px]' : 'h-5 w-[90px]'
        )}
      >
        <div
          className="absolute transition-all duration-[40ms]"
          style={isVert
            ? { bottom: 0, left: 0, right: 0, height: `${pct}%`, background: `linear-gradient(to top, ${color}, transparent)` }
            : { left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(to right, ${color}, transparent)` }
          }
        />
      </div>
      <div className="text-[0.58rem] font-mono text-text-muted">{pct}%</div>
    </div>
  )
}
