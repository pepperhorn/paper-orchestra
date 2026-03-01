import { Routes, Route } from 'react-router-dom'
import Launcher from './pages/Launcher'
import InstrumentPage from './pages/InstrumentPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Launcher />} />
      <Route path="/instrument/:id" element={<InstrumentPage />} />
    </Routes>
  )
}
