import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

import { resolveBasePath } from './scripts/base-path.ts'

const base = resolveBasePath()

export default defineConfig({
  base,

  build: {
    // Vite 8 defaults to Safari 16.4. Keep supporting iOS 15.4+ (the floor Tailwind's CSS
    // fallbacks allow): without this, breakpoint media queries ship in range syntax, which
    // older Safari ignores. CSS uses the same target.
    target: ['chrome111', 'edge111', 'firefox114', 'safari15.4', 'ios15.4'],
  },

  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        // A relative id resolves against the origin, which other Pages sites share; use the app path.
        id: base,
        name: 'GymBuddie',
        short_name: 'GymBuddie',
        description: 'Dein persönlicher Fortschritts-Tracker für das Fitnessstudio.',
        lang: 'de-DE',
        categories: ['fitness', 'health', 'sports'],
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
