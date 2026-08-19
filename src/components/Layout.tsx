import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HomeIcon, ScanIcon, ClipboardIcon, TagIcon, SettingsIcon, LogOutIcon } from './icons'
import { CyrixLogo } from './CyrixLogo'
import { BlueStarLogo } from './BlueStarLogo'

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

  // Each tab gets its own active color rather than one uniform brand tint,
  // so the row reads at a glance instead of just "on vs off": Scan matches
  // the scanner's own red laser theme, Tagged is the positive/done green,
  // Requests is the pending-attention amber used on its badges elsewhere.
  const navItems = [
    { to: '/', label: 'Home', icon: HomeIcon, show: true, activeText: 'text-brand-700', pillBg: 'bg-brand-50', activeBg: 'bg-brand-50 text-brand-700' },
    { to: '/scan', label: 'Scan', icon: ScanIcon, show: true, activeText: 'text-purple-600', pillBg: 'bg-purple-50', activeBg: 'bg-purple-50 text-purple-600' },
    { to: '/tagged', label: 'Tagged', icon: TagIcon, show: true, activeText: 'text-emerald-600', pillBg: 'bg-emerald-50', activeBg: 'bg-emerald-50 text-emerald-600' },
    { to: '/requests', label: 'Requests', icon: ClipboardIcon, show: true, activeText: 'text-amber-600', pillBg: 'bg-amber-50', activeBg: 'bg-amber-50 text-amber-600' },
    {
      to: '/admin/facilities',
      label: 'Admin',
      icon: SettingsIcon,
      show: profile.role === 'admin',
      activeText: 'text-indigo-600',
      pillBg: 'bg-indigo-50',
      activeBg: 'bg-indigo-50 text-indigo-600',
    },
  ].filter((item) => item.show)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <CyrixLogo className="text-[9px]" subtitle={false} />
          <span className="h-5 w-px bg-slate-200" />
          <BlueStarLogo className="text-[7px]" />
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
        {navItems.map(({ to, label, icon: Icon, activeText, pillBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-slate-500"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-8 w-11 place-items-center rounded-full transition-colors ${
                    isActive ? pillBg : ''
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? activeText : 'text-slate-500'}`} />
                </span>
                <span className={isActive ? activeText : 'text-slate-500'}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <nav className="hidden border-t border-slate-200 bg-white px-4 py-2 sm:flex sm:gap-1">
        {navItems.map(({ to, label, icon: Icon, activeBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? activeBg : 'text-slate-600 hover:bg-slate-100'
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
