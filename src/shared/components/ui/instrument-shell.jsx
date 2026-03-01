import { cn } from '@shared/lib/utils'
import StatusIndicator from './status-indicator'

export default function InstrumentShell({
  name,
  version,
  fps = 0,
  handCount = 0,
  status = 'loading',
  statusMessage = '',
  sidebar,
  children,
  settings,
  onClickCapture,
  className,
}) {
  return (
    <div
      onClick={onClickCapture}
      className={cn(
        'min-h-screen bg-surface text-text-primary font-display',
        'flex flex-col items-center px-2.5 py-3 gap-2.5',
        className
      )}
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(80,40,120,0.18) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(20,60,100,0.18) 0%, transparent 60%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-[600px]">
        <div>
          <div className="text-xl tracking-[0.18em] text-accent uppercase">{name}</div>
          {version && (
            <div className="text-[0.6rem] text-text-dim tracking-wide">{version}</div>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-[0.58rem] font-mono text-text-faint text-right leading-relaxed">
            <div>{fps} fps</div>
            <div>{handCount} {handCount === 1 ? 'hand' : 'hands'}</div>
          </div>
          <StatusIndicator status={status} />
        </div>
      </div>

      {/* Status bar */}
      <div
        className="w-full max-w-[600px] bg-white/[0.04] rounded-md px-3 py-1.5 text-[0.76rem] text-text-muted"
        style={{ borderColor: `var(--status-color, rgba(255,255,255,0.08))`, borderWidth: 1, borderStyle: 'solid' }}
      >
        {statusMessage || (status === 'loading' && 'Loading libraries...') || ''}
      </div>

      {/* Camera + sidebar */}
      {sidebar ? (
        <div className="w-full max-w-[600px] flex gap-2 items-start">
          <div className="flex-1">{children}</div>
          <div className="flex flex-col gap-2 items-center">{sidebar}</div>
        </div>
      ) : (
        <div className="w-full max-w-[600px]">{children}</div>
      )}

      {/* Settings */}
      {settings}
    </div>
  )
}
