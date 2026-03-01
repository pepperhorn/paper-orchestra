import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PaperString() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 text-text-primary"
      style={{ backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(80,40,120,0.18) 0%, transparent 60%)' }}>
      <div className="w-3 h-3 rounded-full" style={{ background: '#c06888', boxShadow: '0 0 12px #c06888' }} />
      <h1 className="text-2xl tracking-[0.18em] text-accent uppercase">Paper String</h1>
      <p className="text-text-muted text-sm">Bowed string instrument with gesture control</p>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-6 py-3 text-text-dim text-sm tracking-wider">
        Coming in Wave 2
      </div>
      <Link to="/" className="flex items-center gap-1 text-text-dim text-sm hover:text-accent mt-4 no-underline">
        <ArrowLeft size={14} /> Back to launcher
      </Link>
    </div>
  )
}
