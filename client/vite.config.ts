import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const VENDOR_REACT = new Set(['react', 'react-dom', 'scheduler'])
const VENDOR_MOTION = new Set(['framer-motion', 'motion-dom', 'motion-utils'])
const VENDOR_UTILS = new Set(['ky', 'dompurify', 'uuid', 'zustand'])

function pickVendorChunk(id: string): string | null {
  const name = id.split('/node_modules/').pop()?.split('/')[0] ?? id
  if (VENDOR_REACT.has(name)) return 'vendor-react'
  if (VENDOR_MOTION.has(name)) return 'vendor-motion'
  if (VENDOR_UTILS.has(name)) return 'vendor-utils'
  return null
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks: pickVendorChunk,
      },
    },
  },
})
