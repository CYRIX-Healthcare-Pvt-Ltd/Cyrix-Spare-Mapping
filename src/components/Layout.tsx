import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { HomeIcon, ScanIcon, ClipboardIcon, SettingsIcon, LogOutIcon, PanelLeftIcon, SunIcon, MoonIcon, PackageIcon, GridIcon } from './icons'
import { useTheme } from '../context/ThemeContext'
import { CyrixLogo } from './CyrixLogo'
import Avatar from './Avatar'

const ROLE_LABEL: Record<string, string> = {
  engineer: 'Engineer',
  project_manager: 'Project Manager',
  purchase: 'Purchase',
  admin: 'Admin',
}

interface NavItem {
  to: string
  /**
   * Sibling routes this tab also covers. NavLink decides `isActive` from
   * `to` alone, so a section reached by two paths goes dark on one of them
   * without this.
   */
  also?: string[]
  label: string
  icon: (props: { className?: string }) => ReactElement
  show: boolean
  activeText: string
  pillBg: string
  accentBg: string
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [pendingCount, setPendingCount] = useState(0)
  const { theme, toggle } = useTheme()
  // Starts collapsed to a rail. Opening it is deliberate; clicking into the
  // page puts it away again, so it never sits over the content you went there
  // to read. Clicking a nav item leaves it open -- you're still navigating.
  const [expanded, setExpanded] = useState(false)

  // Re-fetched on every route change (not just once) so approving/rejecting
  // a request elsewhere in the app is reflected here without a full reload.
  useEffect(() => {
    if (!profile) return
    /*
     * The badge counts what this person can actually do something about.
     *
     * An engineer sees their own open requests — waiting on somebody
     * else. A manager or admin sees everything waiting on them. Purchase
     * sees only the mapping requests: they are the queue purchase clears,
     * and a badge reading 3 when two of them cannot be actioned is a
     * number that sends somebody looking for work that is not theirs.
     */
    const base = supabase.from('edit_requests').select('id', { count: 'exact', head: true })
    const query =
      profile.role === 'engineer'
        ? base.eq('requested_by', profile.id).eq('status', 'pending')
        : profile.role === 'purchase'
          ? base.eq('status', 'pending').eq('kind', 'mapping')
          : base.eq('status', 'pending')
    query.then(({ count }) => setPendingCount(count ?? 0))
  }, [profile, location.pathname])

  if (!profile) return null

  // Each tab gets its own active color rather than one uniform brand tint,
  // so the row reads at a glance instead of just "on vs off": Scan matches
  // the scanner's own purple laser theme, Tagged is the positive/done green,
  // Requests is a dark yellow, Admin uses the Cyrix brand red.
  // A tab stays lit on the sibling routes it covers; NavLink only knows `to`.
  const alsoActive = (also?: string[]) =>
    (also ?? []).some((p) => location.pathname.startsWith(p))

  const navItems: NavItem[] = [
    // accentBg is spelled out rather than derived from activeText: Tailwind
    // only generates classes it can find literally in the source, so a name
    // built at runtime ("text-" swapped for "bg-") would never exist.
    { to: '/', label: 'Home', icon: HomeIcon, show: true, activeText: 'text-brand-700', pillBg: 'bg-brand-50', accentBg: 'bg-brand-700' },
    { to: '/scan', label: 'Scan', icon: ScanIcon, show: true, activeText: 'text-purple-600', pillBg: 'bg-purple-50', accentBg: 'bg-purple-600' },
    // Tagged spares and the item masters are one section with two views.
    // They ask the same question from opposite ends -- what is on this tag,
    // and what does the catalogue call it -- so they were two taps apart for
    // no reason, and on a phone they cost two of the five slots that fit.
    // `also` keeps the tab lit on the sibling route, which `to` alone cannot.
    {
      to: '/tagged', also: ['/items'], label: 'Inventory', icon: PackageIcon, show: true,
      activeText: 'text-emerald-600', pillBg: 'bg-emerald-50', accentBg: 'bg-emerald-600',
    },
    { to: '/requests', label: 'Requests', icon: ClipboardIcon, show: true, activeText: 'text-yellow-600', pillBg: 'bg-yellow-50', accentBg: 'bg-yellow-600' },
    {
      // The custom fields are what an admin has here; warehouses and the
      // rest are the software's setup and live on the shared
      // Administration screen. Pointing this at facilities would have
      // sent a plain admin to a page the route guard turns them away from.
      to: '/admin/fields',
      also: ['/admin/'],
      label: 'Admin',
      icon: SettingsIcon,
      show: profile.role === 'admin',
      activeText: 'text-red-600',
      pillBg: 'bg-red-50',
      accentBg: 'bg-red-600',
    },
  ].filter((item) => item.show)

  async function handleSignOut() {
    await signOut()
    // The portal owns the session, so signing out here signs you out of
    // every module. Leave the router entirely: navigate() would resolve
    // this under the /spare basename and land you back inside the app it
    // just signed you out of.
    window.location.assign('/')
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-canvas transition-[padding] duration-[var(--dur-ui)] ease-[var(--ease-out)] ${
        expanded ? 'lg:pl-60' : 'lg:pl-16'
      }`}
    >
      {/* Desktop gets a real app shell rather than the phone layout stretched
          wide: a fixed sidebar carrying the brand, navigation and who you're
          signed in as, leaving each page's own header to do nothing but
          introduce that page. Below `lg` the top bar and tab rows below take
          over, which is what actually fits a phone. */}
      <aside
        // Anywhere on the closed rail opens it, not just the little toggle --
        // the rail is mostly empty space and that space is the easiest thing
        // to hit. Clicks that landed on a link or button are left alone: those
        // already mean something, and expanding after you have just navigated
        // would be the opposite of what you asked for. Only one way round, so
        // that selecting a name in the open sidebar doesn't shut it.
        onClick={(e) => {
          if (expanded) return
          if ((e.target as Element).closest('a, button')) return
          setExpanded(true)
        }}
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-surface transition-[width] duration-[var(--dur-ui)] ease-[var(--ease-out)] lg:flex ${
          expanded ? 'w-60' : 'w-16 cursor-pointer'
        }`}
      >
        {/* Everything in the rail lines up on one 16px gutter -- the toggle,
            each nav icon, and the avatar all share the same left edge, so
            collapsing doesn't shift anything sideways. */}
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={expanded}
            title={expanded ? 'Collapse menu' : 'Expand menu'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <PanelLeftIcon className={`h-4.5 w-4.5 transition-transform duration-[var(--dur-ui)] ${expanded ? '' : 'rotate-180'}`} />
          </button>
          <span
            className={`flex min-w-0 flex-col gap-1.5 overflow-hidden transition-opacity duration-[var(--dur-fast)] ${
              expanded ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* Back to the portal's tiles. A plain anchor, not a router
                Link: the portal sits above this app's /spare basename, so
                <Link to="/"> would resolve to /spare/ and go nowhere. */}
            <a href="/" aria-label="All Cyrix apps" title="All Cyrix apps">
              <CyrixLogo height={18} showSubtitle={false} />
            </a>
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3">
          {navItems.map(({ to, also, label, icon: Icon, activeText, pillBg, accentBg }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={expanded ? undefined : label}
              className={({ isActive }) =>
                `relative flex h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium transition-colors ${
                  (isActive || alsoActive(also)) ? `${pillBg} ${activeText}` : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* A short accent bar on the active item, so the current
                      page is legible from the edge of the screen. */}
                  <span
                    className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-opacity ${accentBg} ${
                      (isActive || alsoActive(also)) ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <span className="relative grid w-4.5 shrink-0 place-items-center">
                    <Icon className={`h-4.5 w-4.5 ${(isActive || alsoActive(also)) ? activeText : 'text-slate-400'}`} />
                    {to === '/requests' && pendingCount > 0 && (
                      <span className="absolute -right-2 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold leading-none text-white">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                  <span
                    className={`truncate transition-opacity duration-[var(--dur-fast)] ${
                      expanded ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* The way out to the other Cyrix modules. The mark at the top of
              the rail reaches the same place, but a clickable logo is a
              convention you have to already know, and the rail is collapsed
              to icons most of the time — so this says the word once it is
              open. A plain anchor: the portal is above this app's /spare
              basename and a router link would resolve back inside it. */}
          <a
            href="/"
            title={expanded ? undefined : 'All Cyrix apps'}
            aria-label="All Cyrix apps"
            className="relative flex h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="relative grid w-4.5 shrink-0 place-items-center">
              <GridIcon className="h-4.5 w-4.5 text-slate-400" />
            </span>
            <span
              className={`truncate transition-opacity duration-[var(--dur-fast)] ${
                expanded ? 'opacity-100' : 'opacity-0'
              }`}
            >
              Apps
            </span>
          </a>
        </nav>

        <div className="space-y-1 border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={(e) => toggle({ x: e.clientX, y: e.clientY })}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {/* Both icons are always mounted and cross-fade, so the switch
                reads as one control changing state rather than two swapping. */}
            <span className="relative grid h-4.5 w-4.5 shrink-0 place-items-center">
              <SunIcon
                className={`absolute h-4.5 w-4.5 text-amber-500 transition-all duration-[var(--dur-ui)] ${
                  theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
                }`}
              />
              <MoonIcon
                className={`absolute h-4.5 w-4.5 text-indigo-400 transition-all duration-[var(--dur-ui)] ${
                  theme === 'dark' ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
                }`}
              />
            </span>
            <span className={`truncate transition-opacity duration-[var(--dur-fast)] ${expanded ? 'opacity-100' : 'opacity-0'}`}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          {/* Account and sign-out are separate rows rather than a name with a
              button tucked beside it, so signing out is reachable in the rail
              too -- and every row in the rail is then the same shape. The
              avatar's centre sits on the same gutter as the icons above it. */}
          <Link
            to="/account"
            title={expanded ? undefined : profile.full_name}
            className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-2 hover:bg-slate-100"
          >
            <Avatar
              name={profile.full_name}
              src={profile.avatar}
              className="h-6.5 w-6.5 text-[10px]"
            />
            <span
              className={`min-w-0 transition-opacity duration-[var(--dur-fast)] ${expanded ? 'opacity-100' : 'opacity-0'}`}
            >
              <span className="block truncate text-sm font-medium text-slate-900">{profile.full_name}</span>
              <span className="block truncate text-xs text-slate-500">{ROLE_LABEL[profile.role]}</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
          >
            <span className="grid w-4.5 shrink-0 place-items-center">
              <LogOutIcon className="h-4.5 w-4.5" />
            </span>
            <span
              className={`truncate transition-opacity duration-[var(--dur-fast)] ${expanded ? 'opacity-100' : 'opacity-0'}`}
            >
              Sign out
            </span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <a href="/" aria-label="All Cyrix apps" title="All Cyrix apps">
            <CyrixLogo height={18} showSubtitle={false} />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/account" className="flex items-center gap-2" aria-label="Your account">
            <span className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900 hover:text-brand-700">{profile.full_name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
            </span>
            <Avatar name={profile.full_name} src={profile.avatar} className="h-8 w-8 text-xs" />
          </Link>
          <button
            onClick={(e) => toggle({ x: e.clientX, y: e.clientY })}
            className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <SunIcon
              className={`absolute h-5 w-5 text-amber-500 transition-all duration-[var(--dur-ui)] ${
                theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
              }`}
            />
            <MoonIcon
              className={`absolute h-5 w-5 text-indigo-400 transition-all duration-[var(--dur-ui)] ${
                theme === 'dark' ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
              }`}
            />
          </button>
          <button
            onClick={handleSignOut}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Sign out"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <nav className="sticky top-[57px] z-20 hidden border-b border-slate-200 bg-surface px-4 py-2 sm:flex sm:gap-1 lg:hidden">
        {navItems.map(({ to, also, label, icon: Icon, activeText, pillBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                (isActive || alsoActive(also)) ? `${pillBg} ${activeText}` : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <span className="relative">
              <Icon className={`h-4 w-4 ${activeText}`} />
              {to === '/requests' && pendingCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-3 min-w-3 place-items-center rounded-full bg-red-600 px-0.5 text-[8px] font-bold leading-none text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <main onClick={() => setExpanded(false)} className="flex-1 pb-20 sm:pb-6 lg:pb-10">
        <Outlet />
      </main>

      {/*
        Six cells on a 375px screen is about nine characters each, so sharing
        the width equally turned Inventory and Requests into "Invento…" and
        "Reque…". The row scrolls instead and every cell takes the width its
        own name needs.

        The shadow paints the bar's colour below itself: pinch out and the
        visual viewport grows past the layout viewport a fixed element is
        pinned to, so the page reappears in the strip underneath.
      */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto overscroll-x-contain border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_50vh_0_var(--color-surface)] sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {navItems.map(({ to, also, label, icon: Icon, activeText, pillBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex min-w-[72px] flex-none flex-col items-center gap-1 px-1.5 py-2 text-xs font-medium text-slate-500"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`relative grid h-8 w-11 place-items-center rounded-full transition-colors ${
                    (isActive || alsoActive(also)) ? pillBg : ''
                  }`}
                >
                  <Icon className={`h-5 w-5 ${activeText}`} />
                  {to === '/requests' && pendingCount > 0 && (
                    <span className="absolute right-1.5 top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold leading-none text-white">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </span>
                <span className={`whitespace-nowrap px-0.5 text-center ${(isActive || alsoActive(also)) ? activeText : "text-slate-500"}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Last, so the tabs to its left keep the positions people already
            know. A plain anchor: the portal is above this app's /spare
            basename and a router link would resolve back inside it.

            Pinned to the right edge rather than scrolling away with them —
            the way out of the app should not be something you have to go
            looking for. Sticky rather than lifted out of the row, so it
            stays the last of the same set of destinations for a keyboard
            and a screen reader.

            Raised, because it is: the tabs travel underneath it, and a
            cast shadow to the left of the edge is what says so. The border
            alone reads as a seam between two flat things, which is the one
            thing this cell is not. */}
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
