import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/GymBuddie/',

  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GymBuddie',
        short_name: 'GymBuddie',
        description: 'Dein persönlicher Fortschritts-Tracker für das Fitnessstudio.',
        theme_color: '#f9fafb', // Helles Grau für die Browser-Leiste
        background_color: '#f9fafb',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.png', // Muss im 'public' Ordner liegen
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png', // Muss im 'public' Ordner liegen
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
