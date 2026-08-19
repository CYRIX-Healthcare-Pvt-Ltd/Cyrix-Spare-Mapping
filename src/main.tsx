import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted rather than loaded from a CDN: this is an installable PWA
// field engineers open on patchy hospital wifi, and a webfont that fails
// to arrive would fall back mid-session. Matches Cyrix-KPI's approach.
import '@fontsource-variable/space-grotesk'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
