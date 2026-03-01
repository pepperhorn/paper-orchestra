import { Link } from 'react-router-dom'

const INSTRUMENTS = [
  { id: 'piano', name: 'Paper Piano', desc: '2-octave keyboard with chords, arps & ribbon', wave: 1, color: '#e8c97a' },
  { id: 'drum', name: 'Paper Drum', desc: 'Colour-ring pad kit with strike detection', wave: 1, color: '#ff6b6b' },
  { id: 'wind', name: 'Paper Wind', desc: 'Whistle & trumpet with breath control', wave: 1, color: '#60c0ff' },
  { id: 'guitar', name: 'Paper Guitar', desc: 'Strum detection on printed fretboard', wave: 2, color: '#7abe8a' },
  { id: 'drum-machine', name: 'Paper Drum Machine', desc: 'Step sequencer with token programming', wave: 2, color: '#d4884a' },
  { id: 'sequencer', name: 'Paper Sequencer', desc: 'Grid-based pattern sequencer', wave: 2, color: '#9090d0' },
  { id: 'string', name: 'Paper String', desc: 'Bowed string instrument with gesture control', wave: 2, color: '#c06888' },
]

export default function Launcher() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center px-4 py-8"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(80,40,120,0.18) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(20,60,100,0.18) 0%, transparent 60%)',
      }}>
      <div className="mb-8 text-center">
        <h1 className="text-3xl tracking-[0.18em] text-accent uppercase font-display">Paper Orchestra</h1>
        <p className="text-sm text-text-dim mt-1 tracking-wide">PepperHorn x CRF — camera-based musical instruments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {INSTRUMENTS.map(inst => {
          const disabled = inst.wave > 1
          const Card = disabled ? 'div' : Link
          const props = disabled ? {} : { to: `/instrument/${inst.id}` }
          return (
            <Card
              key={inst.id}
              {...props}
              className={`group relative rounded-xl border p-5 transition-all duration-200 no-underline ${
                disabled
                  ? 'border-border bg-surface-raised/50 opacity-50 cursor-not-allowed'
                  : 'border-border bg-surface-raised hover:border-accent/40 hover:bg-surface-overlay cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: inst.color, boxShadow: `0 0 8px ${inst.color}40` }}
                />
                <h2 className="text-lg text-text-primary font-display">{inst.name}</h2>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">{inst.desc}</p>
              {disabled && (
                <span className="absolute top-3 right-3 text-[0.6rem] tracking-wider uppercase text-text-faint bg-surface/80 rounded px-2 py-0.5">
                  Wave 2
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
