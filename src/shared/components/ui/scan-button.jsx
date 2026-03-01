import { cn } from '@shared/lib/utils'

export default function ScanButton({ scanning, status, onScan, onReset }) {
  return (
    <div className="flex gap-1.5">
      {(status === 'ready' || status === 'scan_needed') && (
        <button
          onClick={onScan}
          className={cn(
            'rounded-md px-2.5 py-0.5 text-[0.68rem] border cursor-pointer',
            scanning
              ? 'bg-success/20 border-success/40 text-success animate-pulse'
              : 'bg-success/10 border-success/40 text-success'
          )}
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      )}
      {status === 'ready' && (
        <button
          onClick={onReset}
          className="rounded-md px-2.5 py-0.5 text-[0.68rem] border bg-error/10 border-error/30 text-error/80 cursor-pointer"
        >
          Reset
        </button>
      )}
    </div>
  )
}
