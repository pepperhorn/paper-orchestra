const STATUS_COLORS = {
  loading: '#9ca3af',
  scan_needed: '#f59e0b',
  ready: '#22c55e',
  error: '#ef4444',
  scanning: '#3b82f6',
}

export default function StatusIndicator({ status = 'loading' }) {
  const color = STATUS_COLORS[status] || '#9ca3af'
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}
