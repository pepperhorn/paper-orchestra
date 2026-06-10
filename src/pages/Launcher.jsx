import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const INSTRUMENTS = [
  { id: 'piano', name: 'Paper Piano', desc: '2-octave keyboard with chords, arps & ribbon', wave: 1 },
  { id: 'drum', name: 'Paper Drum', desc: 'Colour-ring pad kit with strike detection', wave: 1 },
  { id: 'wind', name: 'Paper Wind', desc: 'Whistle & trumpet with breath control', wave: 1 },
  { id: 'guitar', name: 'Paper Guitar', desc: 'Strum detection on printed fretboard', wave: 2 },
  { id: 'drum-machine', name: 'Paper Drum Machine', desc: 'Step sequencer with token programming', wave: 2 },
  { id: 'sequencer', name: 'Paper Sequencer', desc: 'Grid-based pattern sequencer', wave: 2 },
  { id: 'string', name: 'Paper String', desc: 'Bowed string instrument with gesture control', wave: 2 },
]

export default function Launcher() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Paper Orchestra</h1>
        <p className="text-sm text-gray-400 mt-1.5">Camera-based musical instruments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
        {INSTRUMENTS.map(inst => {
          const disabled = inst.wave > 1
          const Card = disabled ? 'div' : Link
          const props = disabled ? {} : { to: `/instrument/${inst.id}` }
          return (
            <Card
              key={inst.id}
              {...props}
              className={`group relative rounded-lg border px-4 py-3.5 transition-colors no-underline ${
                disabled
                  ? 'border-gray-100 bg-gray-50/50 opacity-40 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-900">{inst.name}</h2>
                {!disabled && (
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{inst.desc}</p>
              {disabled && (
                <span className="absolute top-3 right-3 text-[0.6rem] tracking-wider uppercase text-gray-300 font-medium">
                  soon
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
