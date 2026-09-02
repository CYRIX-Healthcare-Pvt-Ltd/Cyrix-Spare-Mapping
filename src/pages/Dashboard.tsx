import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ScanIcon, ClipboardIcon, BuildingIcon, UsersIcon, SettingsIcon, PackageIcon, TagIcon } from '../components/icons'
import { taggedCreatorIds } from '../lib/taggedScope'

export default function Dashboard() {
  const { profile } = useAuth()
  const [equipmentCount, setEquipmentCount] = useState<number | null>(null)
  const [requestCount, setRequestCount] = useState<number | null>(null)

  useEffect(() => {
    if (!profile) return

    // Scoped exactly like the tagged list this card links to. Counting every
    // spare the database would hand over told an engineer who had tagged
    // nothing that there was one, and the list they clicked into was empty.
    async function loadTaggedCount() {
      const creatorIds = await taggedCreatorIds(profile!)
      // Retired spares are not tagged spares, and the tile is a door into
      // a list that filters them out — a count that included them would
      // send somebody to a shorter list than the number promised.
      let query = supabase
        .from('equipment')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
      if (creatorIds) query = query.in('created_by', creatorIds)
      const { count } = await query
      setEquipmentCount(count ?? 0)
    }
    loadTaggedCount()

    // isSpareAdmin first: 0069 set an admin's role to 'engineer', so
    // reading the role alone counts them only their own requests and the
    // tile reads zero while a queue waits for them.
    const requestsQuery =
      profile.role === 'engineer' && !profile.isSpareAdmin
        ? supabase
            .from('edit_requests')
            .select('id', { count: 'exact', head: true })
            .eq('requested_by', profile.id)
            .eq('status', 'pending')
        : supabase.from('edit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')

    requestsQuery.then(({ count }) => setRequestCount(count ?? 0))
  }, [profile])

  if (!profile) return null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:max-w-5xl sm:px-6 lg:px-8 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 lg:text-2xl">Hi {profile.full_name.split(' ')[0]},</h1>
        <p className="text-sm text-slate-500">Here's what's happening with spare tracking.</p>
      </div>

      {/* On a phone these stack, because they have to. On a desktop the scan
          panel and the two counts share a row -- otherwise three short cards
          strung down a wide page is exactly the "unfinished" look. */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Link
          to="/scan"
          className="group flex items-center gap-4 rounded-2xl bg-brand-700 p-5 text-on-brand shadow-lg shadow-brand-700/20 transition hover:bg-brand-650 lg:col-span-1 lg:flex-col lg:items-start lg:justify-between lg:gap-6 lg:p-6"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface/15 transition-transform group-hover:scale-105">
            <ScanIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-semibold">Scan a spare QR</span>
            <span className="block text-sm text-brand-100">View existing details, or tag a new item</span>
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
          <StatCard
            to="/tagged"
            value={equipmentCount}
            label={
              profile.role === 'engineer'
                ? "Spares you've tagged"
                : profile.role === 'project_manager'
                  ? 'Tagged by your team'
                  : 'Spares tagged'
            }
            icon={<TagIcon className="h-4 w-4" />}
            accent="text-emerald-600 bg-emerald-50"
          />
          <StatCard
            to="/requests"
            value={requestCount}
            label={profile.role === 'engineer' ? 'Your pending requests' : 'Pending approvals'}
            icon={<ClipboardIcon className="h-4 w-4" />}
            accent="text-yellow-600 bg-yellow-50"
          />
        </div>
      </div>

      {/*
        An admin here maintains the custom fields — the list an engineer
        fills in when tagging a spare, which changes with the work and is
        genuinely Spare's own.

        Warehouses, logins and settings are setting up the software rather
        than running it, so they sit with every other module's setup on
        the shared Administration screen, and appear here only for the
        account that administers it.
      */}
      {profile.isSpareAdmin && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Admin</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <AdminLink
              to="/admin/fields"
              icon={ClipboardIcon}
              label="Custom fields"
              iconClass="text-cyan-600"
              hoverClass="hover:border-cyan-300 hover:bg-cyan-50"
            />
            <AdminLink
              to="/items"
              icon={PackageIcon}
              label="Item masters"
              iconClass="text-teal-600"
              hoverClass="hover:border-teal-300 hover:bg-teal-50"
            />
            {profile.isSwAdmin && (
              <>
                <AdminLink
                  to="/admin/facilities"
                  icon={BuildingIcon}
                  label="Warehouses"
                  iconClass="text-blue-600"
                  hoverClass="hover:border-blue-300 hover:bg-blue-50"
                />
                <AdminLink
                  to="/admin/users"
                  icon={UsersIcon}
                  label="Users"
                  iconClass="text-lime-600"
                  hoverClass="hover:border-lime-300 hover:bg-lime-50"
                />
                <AdminLink
                  to="/admin/settings"
                  icon={SettingsIcon}
                  label="Settings"
                  iconClass="text-indigo-600"
                  hoverClass="hover:border-indigo-300 hover:bg-indigo-50"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  to,
  value,
  label,
  icon,
  accent,
}: {
  to: string
  value: number | null
  label: string
  icon: ReactElement
  accent: string
}) {
  return (
    <Link
      to={to}
      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-surface p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 lg:p-5"
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${accent}`}>{icon}</span>
      <span>
        <span className="block text-2xl font-semibold text-slate-900 lg:text-3xl">{value ?? '—'}</span>
        <span className="block text-sm text-slate-500">{label}</span>
      </span>
    </Link>
  )
}

function AdminLink({
  to,
  icon: Icon,
  label,
  iconClass,
  hoverClass,
}: {
  to: string
  icon: (props: { className?: string }) => ReactElement
  label: string
  iconClass: string
  hoverClass: string
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-surface p-4 text-center transition-colors ${hoverClass}`}
    >
      <Icon className={`h-5 w-5 ${iconClass}`} />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </Link>
  )
}
