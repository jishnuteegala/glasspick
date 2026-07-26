import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'GlassPick — provably fair winner picker',
        short_name: 'GlassPick',
        description:
          'Open-source, provably fair giveaway winner picker. Commit-reveal draws seeded by the drand public randomness beacon, verifiable by anyone.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#4f46e5',
        background_color: '#f7f8fa',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
