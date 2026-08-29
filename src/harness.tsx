/*
 * Layout harness — `npm run dev`, then /spare/harness.html.
 *
 * Sign-in lives in the portal, so this app's chrome cannot be rendered
 * locally without an account, and a layout change could only be checked
 * by shipping it. This renders the chrome on its own instead.
 *
 * The bottom bar is a *copy* of Layout.tsx's, which is the thing that can
 * drift — change one and change the other, or this stops telling the
 * truth. Real stylesheet, real icons, real class names.
 *
 * Vite builds index.html only, so none of this ships.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, NavLink } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import {
  HomeIcon, ScanIcon, PackageIcon, ClipboardIcon, SettingsIcon, GridIcon,
} from './components/icons'
import { CyrixLogo } from './components/CyrixLogo'
import Avatar from './components/Avatar'

const navItems = [
  { to: '/', label: 'Home', icon: HomeIcon, activeText: 'text-brand-700', pillBg: 'bg-brand-50' },
  { to: '/scan', label: 'Scan', icon: ScanIcon, activeText: 'text-purple-600', pillBg: 'bg-purple-50' },
  { to: '/tagged', label: 'Inventory', icon: PackageIcon, activeText: 'text-emerald-600', pillBg: 'bg-emerald-50' },
  { to: '/requests', label: 'Requests', icon: ClipboardIcon, activeText: 'text-yellow-600', pillBg: 'bg-yellow-50' },
  { to: '/admin/facilities', label: 'Admin', icon: SettingsIcon, activeText: 'text-red-600', pillBg: 'bg-red-50' },
]

function Harness() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <CyrixLogo height={18} showSubtitle={false} />
        <Avatar name="Kevin Raju" src={null} className="h-8 w-8 text-xs" />
      </header>

      <main className="flex-1 pb-20 sm:pb-6 lg:pb-10">
        <div className="space-y-3 p-4">
          {['Spares tagged', 'Pending approvals', 'Warehouses', 'Item masters',
            'Custom fields', 'Users', 'Settings'].map((t) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-surface p-5">
              <p className="text-sm text-slate-500">{t}</p>
              <p className="text-2xl font-semibold text-slate-900">1</p>
            </div>
          ))}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto overscroll-x-contain border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_50vh_0_var(--color-surface)] sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map(({ to, label, icon: Icon, activeText, pillBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex min-w-[72px] flex-none flex-col items-center gap-1 px-1.5 py-2 text-xs font-medium text-slate-500"
          >
            {({ isActive }) => (
              <>
                <span className={`relative grid h-8 w-11 place-items-center rounded-full transition-colors ${isActive ? pillBg : ''}`}>
                  <Icon className={`h-5 w-5 ${activeText}`} />
                </span>
                <span className={`whitespace-nowrap px-0.5 text-center ${isActive ? activeText : 'text-slate-500'}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        <a
          href="/"
          className="sticky right-0 flex min-w-[72px] flex-none flex-col items-center gap-1 border-l border-slate-200 bg-surface px-1.5 py-2 text-xs font-medium text-slate-500 shadow-[-7px_0_14px_-5px_rgb(0_0_0/0.28)]"
          aria-label="All Cyrix apps"
        >
          <span className="grid h-8 w-11 place-items-center rounded-full">
            <GridIcon className="h-5 w-5" />
          </span>
          <span className="whitespace-nowrap px-0.5 text-center">Apps</span>
        </a>
      </nav>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
)
