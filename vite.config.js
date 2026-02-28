import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow camera access on local network (e.g. from Chromebook to dev machine)
    // Vite localhost is treated as secure context by browsers so camera works fine
    port: 5173,
  }
})
