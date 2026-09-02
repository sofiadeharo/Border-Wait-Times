import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works on GitHub Pages,
// Netlify, Render static sites, or a plain file server without extra config.
export default defineConfig({
  plugins: [react()],
  base: './',
})
