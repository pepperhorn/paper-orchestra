import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AirPiano from './AirPiano.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AirPiano />
  </StrictMode>
)
