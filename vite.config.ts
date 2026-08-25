import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Cyrix Blue Star — Equipment Tracker',
        short_name: 'Blue Star',
        description: 'Scan a QR tag to view or record hospital equipment details.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // An old precache can keep a client booting the previous deploy: its
        // index.html points at asset hashes that no longer exist, and the page
        // then renders with no CSS at all. These make the new worker take over
        // on the next load and bin what it replaced.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // The navigation fallback must never answer a request for a real file.
        // index.html served where a stylesheet was expected arrives as 200 OK
        // and fails silently, which is far worse than a 404.
        navigateFallbackDenylist: [/^\/auth/, /^\/assets\//, /^\/icons\//, /\.[a-zA-Z0-9]+$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
