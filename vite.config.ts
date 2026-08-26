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
        name: 'Cyrix — Spare Tracker',
        short_name: 'Cyrix',
        description: 'Scan a QR tag to view or record warehouse spare details.',
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

        // Fonts are part of how the app looks, so they belong in the precache
        // alongside the stylesheet that asks for them.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],

        // The HTML is deliberately NOT served from the precache.
        //
        // The default for a single-page app is to answer every navigation with
        // the precached index.html. That is what made a normal refresh break
        // while a hard refresh worked: the refresh got last deploy's HTML out
        // of the cache, which names asset hashes that no longer exist, whereas
        // a hard refresh bypasses the worker and fetches the current HTML.
        // Going to the network first means an online refresh always gets the
        // HTML that matches the assets actually on the server; the cached copy
        // is only reached when the network does not answer.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html',
              // Short, so a flaky warehouse connection falls back to the
              // cached page rather than hanging on a blank screen.
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 16 },
            },
          },
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
