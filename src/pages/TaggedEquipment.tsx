import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { MapPinIcon } from '../components/icons'
import { formatDate } from '../lib/formatDate'
import type { EquipmentRow } from '../types/app'

interface DisplayRow extends EquipmentRow {
  facilityName: string
  taggerName: string | null
  taggerEcode: string | null
}

export default function TaggedEquipment() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAttribution, setShowAttribution] = useState(false)

  useEffect(() => {
    if (!profile) return

    async function load() {
      const attribution = profile!.role === 'project_manager' || profile!.role === 'admin'
      setShowAttribution(attribution)

      let creatorIds: string[] | null = [profile!.id]
      if (profile!.role === 'project_manager') {
        const { data: reports } = await supabase.from('profiles').select('id').eq('reports_to', profile!.id)
        creatorIds = [profile!.id, ...(reports ?? []).map((r) => r.id)]
      } else if (profile!.role === 'admin') {
        creatorIds = null // no filter -- admin sees every tagged item
      }

      let query = supabase.from('equipment').select('*').order('created_at', { ascending: false })
      if (creatorIds) query = query.in('created_by', creatorIds)
      const { data: equipmentRows } = await query
      const list = equipmentRows ?? []

      const facilityIds = [...new Set(list.map((e) => e.facility_id))]
      const creatorIdsSeen = [...new Set(list.map((e) => e.created_by).filter((id): id is string => !!id))]

      const [{ data: facilityRows }, { data: profileRows }] = await Promise.all([
        facilityIds.length ? supabase.from('facilities').select('id, name').in('id', facilityIds) : Promise.resolve({ data: [] }),
        attribution && creatorIdsSeen.length
          ? supabase.from('profiles').select('id, full_name, ecode').in('id', creatorIdsSeen)
          : Promise.resolve({ data: [] }),
      ])

      const facilityMap = new Map((facilityRows ?? []).map((f) => [f.id, f.name]))
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))

      setRows(
        list.map((e) => ({
          ...e,
          facilityName: facilityMap.get(e.facility_id) ?? 'Unknown facility',
          taggerName: e.created_by ? (profileMap.get(e.created_by)?.full_name ?? null) : null,
          taggerEcode: e.created_by ? (profileMap.get(e.created_by)?.ecode ?? null) : null,
        }))
      )
      setLoading(false)
    }
    load()
  }, [profile])

  if (loading || !profile) return null

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Tagged equipment</h1>
      <p className="mb-4 text-sm text-slate-500">
        {profile.role === 'engineer'
          ? "Equipment you've scanned and tagged."
          : "Equipment tagged by your team, and you."}
      </p>

      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing tagged yet.</p>}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to={`/equipment/${r.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-300"
            >
              <p className="font-medium text-slate-900">{r.name}</p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <MapPinIcon className="h-3 w-3 shrink-0" /> {r.facilityName}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {formatDate(r.created_at)}
                {showAttribution && r.taggerName && (
                  <>
                    {' '}
                    · tagged by {r.taggerName}
                    {r.taggerEcode && ` (${r.taggerEcode})`}
                  </>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
