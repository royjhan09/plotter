import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Plotter: main (Electron + sign-in + model calls), preload (the window's only door), renderer (React). */
export default defineConfig({
  main: {
    build: {
      outDir: resolve('out/main'),
      rollupOptions: { input: { index: resolve('main/index.ts') } }
    }
  },
  preload: {
    build: {
      outDir: resolve('out/preload'),
      rollupOptions: { input: { index: resolve('preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve('renderer'),
    server: { port: 5173, strictPort: true },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: { index: resolve('renderer/index.html') } }
    },
    plugins: [react()]
  }
})
