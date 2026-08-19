import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ScanIcon, ClipboardIcon, BuildingIcon, UsersIcon, SettingsIcon } from '../components/icons'

export default function Dashboard() {
  const { profile } = useAuth()
  const [equipmentCount, setEquipmentCount] = useState<number | null>(null)
  const [requestCount, setRequestCount] = useState<number | null>(null)

  useEffect(() => {
    if (!profile) return

    supabase
      .from('equipment')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => setEquipmentCount(count ?? 0))

    const requestsQuery =
      profile.role === 'engineer'
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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Hi {profile.full_name.split(' ')[0]},</h1>
        <p className="text-sm text-slate-500">Here's what's happening with equipment tracking.</p>
      </div>

      <Link
        to="/scan"
        className="flex items-center gap-4 rounded-2xl bg-brand-700 p-5 text-white shadow-lg shadow-brand-700/20 transition hover:bg-brand-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15">
          <ScanIcon className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold">Scan an equipment QR</p>
          <p className="text-sm text-brand-100">View existing details, or tag a new item</p>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-2xl font-semibold text-slate-900">{equipmentCount ?? '—'}</p>
          <p className="text-sm text-slate-500">Equipment tracked</p>
        </div>
        <Link to="/requests" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-300">
          <p className="text-2xl font-semibold text-slate-900">{requestCount ?? '—'}</p>
          <p className="text-sm text-slate-500">
            {profile.role === 'engineer' ? 'Your pending requests' : 'Pending approvals'}
          </p>
        </Link>
      </div>

      {profile.role === 'admin' && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Admin</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminLink
              to="/admin/facilities"
              icon={BuildingIcon}
              label="Facilities"
              iconClass="text-blue-600"
              hoverClass="hover:border-blue-300 hover:bg-blue-50"
            />
            <AdminLink
              to="/admin/fields"
              icon={ClipboardIcon}
              label="Custom fields"
              iconClass="text-violet-600"
              hoverClass="hover:border-violet-300 hover:bg-violet-50"
            />
            <AdminLink
              to="/admin/users"
              icon={UsersIcon}
              label="Users"
              iconClass="text-orange-600"
              hoverClass="hover:border-orange-300 hover:bg-orange-50"
            />
            <AdminLink
              to="/admin/settings"
              icon={SettingsIcon}
              label="Settings"
              iconClass="text-indigo-600"
              hoverClass="hover:border-indigo-300 hover:bg-indigo-50"
            />
          </div>
        </div>
      )}
    </div>
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
      className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition-colors ${hoverClass}`}
    >
      <Icon className={`h-5 w-5 ${iconClass}`} />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </Link>
  )
}
