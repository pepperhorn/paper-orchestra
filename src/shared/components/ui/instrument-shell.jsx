import { cn } from '@shared/lib/utils'
import StatusIndicator from './status-indicator'

export default function InstrumentShell({
  name,
  fps = 0,
  handCount = 0,
  status = 'loading',
  statusMessage = '',
  children,
  onClickCapture,
  className,
}) {
  return (
    <div
      onClick={onClickCapture}
      className={cn(
        'min-h-screen bg-white text-gray-900',
        'flex flex-col items-center px-3 py-3 gap-2',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-5xl">
        <h1 className="text-sm font-medium tracking-wide">{name}</h1>
        <div className="flex gap-2 items-center">
          <span className="text-[0.65rem] font-mono text-gray-400">
            {fps} fps · {handCount} {handCount === 1 ? 'hand' : 'hands'}
          </span>
          <StatusIndicator status={status} />
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="w-full max-w-5xl text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
          {statusMessage}
        </div>
      )}

      {/* Content */}
      <div className="w-full max-w-5xl flex-1 min-h-0 flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}
