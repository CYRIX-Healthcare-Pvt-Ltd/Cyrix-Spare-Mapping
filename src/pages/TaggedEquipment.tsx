import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TrashIcon } from '../components/icons'
import type { EquipmentRow, FieldDefinitionRow } from '../types/app'

interface DisplayRow extends EquipmentRow {
  facilityName: string
  facilityDistrict: string | null
  facilityCity: string | null
  taggerName: string | null
  taggerEcode: string | null
}

export default function TaggedEquipment() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAttribution, setShowAttribution] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmMode, setConfirmMode] = useState<'selected' | 'all' | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
      if (!profile) return
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

      const [{ data: equipmentRows }, { data: fields }] = await Promise.all([
        query,
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
      ])
      const list = equipmentRows ?? []
      setFieldDefs(fields ?? [])

      const facilityIds = [...new Set(list.map((e) => e.facility_id))]
      const creatorIdsSeen = [...new Set(list.map((e) => e.created_by).filter((id): id is string => !!id))]

      const [{ data: facilityRows }, { data: profileRows }] = await Promise.all([
        facilityIds.length
          ? supabase.from('facilities').select('id, name, district, city').in('id', facilityIds)
          : Promise.resolve({ data: [] }),
        attribution && creatorIdsSeen.length
          ? supabase.from('profiles').select('id, full_name, ecode').in('id', creatorIdsSeen)
          : Promise.resolve({ data: [] }),
      ])

      const facilityMap = new Map((facilityRows ?? []).map((f) => [f.id, f]))
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))

      setRows(
        list.map((e) => ({
          ...e,
          facilityName: facilityMap.get(e.facility_id)?.name ?? 'Unknown warehouse',
          facilityDistrict: facilityMap.get(e.facility_id)?.district ?? null,
          facilityCity: facilityMap.get(e.facility_id)?.city ?? null,
          taggerName: e.created_by ? (profileMap.get(e.created_by)?.full_name ?? null) : null,
          taggerEcode: e.created_by ? (profileMap.get(e.created_by)?.ecode ?? null) : null,
        }))
      )
      setLoading(false)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.id)))
  }

  async function performDelete() {
    const ids = confirmMode === 'all' ? rows.map((r) => r.id) : selected
    if (ids.length === 0) return
    setDeleting(true)
    // equipment_history rows cascade on delete (migration 0006); edit_requests
    // cascade too (0001), so removing the equipment row is enough.
    await supabase.from('equipment').delete().in('id', ids)
    setDeleting(false)
    setConfirmMode(null)
    setSelected([])
    await load()
  }

  if (loading || !profile) return null

  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Tagged spares</h1>
      <p className="mb-4 text-sm text-slate-500">
        {profile.role === 'engineer'
          ? "Spares you've scanned and tagged."
          : "Spares tagged by your team, and you."}
      </p>

      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing tagged yet.</p>}

      {isAdmin && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">
            {selected.length > 0 ? `${selected.length} selected` : `${rows.length} tagged`}
          </span>
          <span className="flex-1" />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmMode('selected')}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              <TrashIcon className="h-3.5 w-3.5" /> Delete selected
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmMode('all')}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Delete all
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                {isAdmin && (
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.length === rows.length && rows.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="whitespace-nowrap px-3 py-2 font-medium">District</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">City</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Warehouse</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Scanned code</th>
                {fieldDefs.map((f) => (
                  <th key={f.id} className="whitespace-nowrap px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-medium">Date</th>
                {showAttribution && <th className="whitespace-nowrap px-3 py-2 font-medium">Tagged by</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/equipment/${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                  {isAdmin && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => toggleRow(r.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.facilityDistrict ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.facilityCity ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    <Link to={`/equipment/${r.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.facilityName}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{r.qr_value}</td>
                  {fieldDefs.map((f) => {
                    const raw = r.custom_fields[f.field_key]
                    if (f.field_type === 'image') {
                      const count = Array.isArray(raw) ? raw.length : 0
                      return (
                        <td key={f.id} className="whitespace-nowrap px-3 py-2 text-slate-500">
                          {count === 0 ? '—' : `${count} photo${count === 1 ? '' : 's'}`}
                        </td>
                      )
                    }
                    return (
                      <td key={f.id} className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {formatFieldValue(f, raw)}
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDate(r.created_at)}</td>
                  {showAttribution && (
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {r.taggerName ? `${r.taggerName}${r.taggerEcode ? ` (${r.taggerEcode})` : ''}` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmMode !== null}
        title={
          confirmMode === 'all'
            ? `Delete all ${rows.length} tagged item${rows.length === 1 ? '' : 's'}?`
            : `Delete ${selected.length} selected item${selected.length === 1 ? '' : 's'}?`
        }
        message="Their QR codes become unmapped and can be tagged again. Tag history for these items is removed too. This can't be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={performDelete}
        onCancel={() => setConfirmMode(null)}
      />
    </div>
  )
}
