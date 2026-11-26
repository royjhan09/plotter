import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Private parts (Claude Code chats, the Market, PDF export, picture tools) live in ./private: a separate,
 * git-ignored repo. When it is there, '@private/…' resolves to it; when it isn't (a public checkout), it
 * resolves to ./private-stub, small stand-ins that switch those features off. Same app, same speed.
 */
const privateDir = existsSync(resolve('private/main')) ? resolve('private') : resolve('private-stub')
const alias = { '@private': privateDir }

/** Plotter: main (Electron + sign-in + model calls), preload (the window's only door), renderer (React). */
export default defineConfig({
  main: {
    resolve: { alias },
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
    resolve: { alias },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: { index: resolve('renderer/index.html') } }
    },
    plugins: [react()]
  }
})
