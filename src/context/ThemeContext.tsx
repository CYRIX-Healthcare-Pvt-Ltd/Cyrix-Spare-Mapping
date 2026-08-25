import { createContext, useContext, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'blue-star-theme'

/** Where the switch was pressed, so the new theme can spread out from it. */
export interface ThemeOrigin {
  x: number
  y: number
}

interface ThemeValue {
  theme: Theme
  toggle: (origin?: ThemeOrigin) => void
}

const ThemeContext = createContext<ThemeValue>({ theme: 'light', toggle: () => {} })

/** Whatever was chosen last, falling back to what the OS is already set to. */
function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    // The class goes on <html>, not <body>, so it also covers anything
    // portalled outside the app root and the browser's own form controls
    // (via color-scheme, set alongside it in index.css).
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  /**
   * Switches theme as a circular reveal spreading from the switch itself,
   * using the View Transitions API: the browser holds a snapshot of the old
   * theme while the new one is clipped in over it, so every colour in the app
   * crosses over together instead of each element transitioning on its own.
   *
   * The radius is the distance to the furthest corner, so the circle always
   * finishes by covering the screen no matter which corner the switch is in.
   * Where the API is missing, or the reader asked for less motion, the theme
   * simply changes -- the reveal is decoration, never the mechanism.
   */
  function toggle(origin?: ThemeOrigin) {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof document.startViewTransition !== 'function') {
      setTheme(next)
      return
    }

    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    const root = document.documentElement
    root.style.setProperty('--theme-x', `${x}px`)
    root.style.setProperty('--theme-y', `${y}px`)
    root.style.setProperty('--theme-r', `${radius}px`)

    // flushSync is required: startViewTransition snapshots the DOM when its
    // callback returns, and a normal React update would not have landed yet.
    document.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext)
}
