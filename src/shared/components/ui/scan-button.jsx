export default function ScanButton({ scanning, status, onScan, onReset }) {
  return (
    <div className="flex gap-2">
      {(status === 'ready' || status === 'scan_needed') && (
        <button
          onClick={onScan}
          className={`rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors ${
            scanning
              ? 'bg-gray-900 border-gray-900 text-white animate-pulse'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      )}
      {status === 'ready' && (
        <button
          onClick={onReset}
          className="rounded-md px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-400 cursor-pointer hover:bg-gray-50 hover:text-gray-600"
        >
          Reset
        </button>
      )}
    </div>
  )
}
