import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HomeIcon, ScanIcon, ClipboardIcon, SettingsIcon, LogOutIcon } from './icons'

const ROLE_LABEL: Record<string, string> = {
  engineer: 'Engineer',
  project_manager: 'Project Manager',
  admin: 'Admin',
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  if (!profile) return null

  const initials = profile.full_name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const navItems = [
    { to: '/', label: 'Home', icon: HomeIcon, show: true },
    { to: '/scan', label: 'Scan', icon: ScanIcon, show: true },
    { to: '/requests', label: 'Requests', icon: ClipboardIcon, show: true },
    { to: '/admin/facilities', label: 'Admin', icon: SettingsIcon, show: profile.role === 'admin' },
  ].filter((item) => item.show)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            BS
          </span>
          <span className="font-semibold text-slate-900">Blue Star</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/account" className="flex items-center gap-2" aria-label="Your account">
            <span className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900 hover:text-brand-700">{profile.full_name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
            </span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {initials}
            </span>
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Sign out"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20 sm:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white sm:hidden">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                isActive ? 'text-brand-700' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <nav className="hidden border-t border-slate-200 bg-white px-4 py-2 sm:flex sm:gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
