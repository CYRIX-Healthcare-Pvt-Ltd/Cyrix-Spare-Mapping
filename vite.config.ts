import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
/**
 * Served from app.cyrix.in/spare, not from the root. Vite writes the
 * prefix into index.html, React Router strips it off every route, and
 * the manifest tells an installed copy which corner of the origin it
 * owns — all three have to agree.
 *
 * outDir matches base because base only rewrites URLs, it does not move
 * files: building to plain dist/ ships a page asking for
 * /spare/assets/… while the file sits at /assets/… and every bundle
 * 404s with nothing in the console to explain it.
 */
export default defineConfig({
  base: '/spare/',
  build: { outDir: 'dist/spare', emptyOutDir: true },
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
        start_url: '/spare/',
        scope: '/spare/',
        icons: [
          { src: '/spare/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/spare/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/spare/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
