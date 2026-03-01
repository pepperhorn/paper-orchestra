import { Suspense, lazy } from 'react'
import { useParams, Link } from 'react-router-dom'

const instruments = {
  piano: lazy(() => import('@instruments/piano/PaperPiano')),
  drum: lazy(() => import('@instruments/drum/PaperDrum')),
  wind: lazy(() => import('@instruments/wind/PaperWind')),
  guitar: lazy(() => import('@instruments/guitar/PaperGuitar')),
  'drum-machine': lazy(() => import('@instruments/drum-machine/PaperDrumMachine')),
  sequencer: lazy(() => import('@instruments/sequencer/PaperSequencer')),
  string: lazy(() => import('@instruments/string/PaperString')),
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-text-muted text-sm tracking-wide animate-pulse">Loading instrument...</div>
    </div>
  )
}

export default function InstrumentPage() {
  const { id } = useParams()
  const Component = instruments[id]

  if (!Component) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <p className="text-error text-lg">Instrument "{id}" not found</p>
        <Link to="/" className="text-accent text-sm hover:underline">Back to launcher</Link>
      </div>
    )
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Component />
    </Suspense>
  )
}
