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
      // manifest.json Konfiguration (Metadaten deiner App)
      manifest: {
        name: 'App für meinen Freund', // Der volle Name der App
        short_name: 'FreundsApp', // Kürzerer Name für den Homescreen
        description: 'Eine coole App, die ich für dich gemacht habe',
        theme_color: '#ffffff', // Die Farbe der Browser-Leiste
        // Hier definierst du die App-Icons
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
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
