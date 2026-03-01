const STATUS_COLORS = {
  loading: '#8090a8',
  scan_needed: '#e8c97a',
  ready: '#7ad890',
  error: '#e87878',
  scanning: '#60c0ff',
}

export default function StatusIndicator({ status = 'loading' }) {
  const color = STATUS_COLORS[status] || '#aaa'
  return (
    <div
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  )
}
