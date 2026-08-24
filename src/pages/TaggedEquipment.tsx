import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TrashIcon, SearchIcon, TagIcon } from '../components/icons'
import type { EquipmentRow, FieldDefinitionRow } from '../types/app'

interface DisplayRow extends EquipmentRow {
  facilityName: string
  facilityDistrict: string | null
  facilityCity: string | null
  taggerName: string | null
  taggerEcode: string | null
  cyrixItemCode: string | null
  cyrixItemName: string | null
}

const th = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
const td = 'px-3 py-2.5 align-middle'

export default function TaggedEquipment() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAttribution, setShowAttribution] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmMode, setConfirmMode] = useState<'selected' | 'all' | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    if (!profile) return
    const attribution = profile.role === 'project_manager' || profile.role === 'admin'
    setShowAttribution(attribution)

    let creatorIds: string[] | null = [profile.id]
    if (profile.role === 'project_manager') {
      const { data: reports } = await supabase.from('profiles').select('id').eq('reports_to', profile.id)
      creatorIds = [profile.id, ...(reports ?? []).map((r) => r.id)]
    } else if (profile.role === 'admin') {
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
    // Every tagged spare is a Blue Star item, and its Cyrix link is recorded
    // on that catalogue row -- so the mapping is read from there, not from
    // the equipment row.
    const itemIds = [...new Set(list.map((e) => e.bluestar_item_id).filter((id): id is string => !!id))]

    const [{ data: facilityRows }, { data: profileRows }, { data: itemRows }] = await Promise.all([
      facilityIds.length
        ? supabase.from('facilities').select('id, name, district, city').in('id', facilityIds)
        : Promise.resolve({ data: [] }),
      attribution && creatorIdsSeen.length
        ? supabase.from('profiles').select('id, full_name, ecode').in('id', creatorIdsSeen)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? supabase.from('bluestar_item_master').select('id, cyrix_item_code, cyrix_item_name').in('id', itemIds)
        : Promise.resolve({ data: [] }),
    ])

    const facilityMap = new Map((facilityRows ?? []).map((f) => [f.id, f]))
    const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))
    const itemMap = new Map((itemRows ?? []).map((i) => [i.id, i]))

    setRows(
      list.map((e) => {
        const item = e.bluestar_item_id ? itemMap.get(e.bluestar_item_id) : null
        return {
          ...e,
          facilityName: facilityMap.get(e.facility_id)?.name ?? 'Unknown warehouse',
          facilityDistrict: facilityMap.get(e.facility_id)?.district ?? null,
          facilityCity: facilityMap.get(e.facility_id)?.city ?? null,
          taggerName: e.created_by ? (profileMap.get(e.created_by)?.full_name ?? null) : null,
          taggerEcode: e.created_by ? (profileMap.get(e.created_by)?.ecode ?? null) : null,
          cyrixItemCode: item?.cyrix_item_code ?? null,
          cyrixItemName: item?.cyrix_item_name ?? null,
        }
      })
    )
    setLoading(false)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.facilityName,
        r.facilityCity,
        r.facilityDistrict,
        r.qr_value,
        r.cyrixItemCode,
        r.cyrixItemName,
        r.taggerName,
        r.taggerEcode,
        ...Object.values(r.custom_fields).map((v) => (typeof v === 'string' ? v : null)),
      ].some((v) => v?.toLowerCase().includes(q))
    )
  }, [rows, search])

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === visible.length ? [] : visible.map((r) => r.id)))
  }

  async function performDelete() {
    const ids = confirmMode === 'all' ? visible.map((r) => r.id) : selected
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
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 lg:text-xl">Tagged spares</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {profile.role === 'engineer'
              ? "Blue Star spares you've scanned and tagged."
              : 'Blue Star spares tagged by your team, and you.'}
          </p>
        </div>

        {rows.length > 0 && (
          <div className="mt-3 flex items-center gap-2 sm:mt-0">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spare, code, warehouse…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
          <TagIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">Nothing tagged yet.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">
              {selected.length > 0
                ? `${selected.length} selected`
                : `${visible.length}${visible.length === rows.length ? '' : ` of ${rows.length}`} tagged`}
            </span>
            <span className="flex-1" />
            {isAdmin && selected.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmMode('selected')}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Delete selected
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmMode('all')}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Delete all
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {isAdmin && (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.length === visible.length && visible.length > 0}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        aria-label="Select all"
                      />
                    </th>
                  )}
                  <th className={th}>District</th>
                  <th className={th}>City</th>
                  <th className={th}>Warehouse</th>
                  <th className={th}>Cyrix code</th>
                  {fieldDefs.map((f) => (
                    <th key={f.id} className={th}>
                      {f.label}
                    </th>
                  ))}
                  <th className={th}>Cyrix item</th>
                  <th className={th}>Date</th>
                  {showAttribution && <th className={th}>Tagged by</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={20} className="px-3 py-10 text-center text-sm text-slate-400">
                      Nothing matches that search.
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/equipment/${r.id}`)}
                    className="cursor-pointer transition-colors hover:bg-brand-50/60"
                  >
                    {isAdmin && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => toggleRow(r.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                          aria-label={`Select ${r.name}`}
                        />
                      </td>
                    )}
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{r.facilityDistrict ?? '—'}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{r.facilityCity ?? '—'}</td>
                    <td className={`${td} whitespace-nowrap font-medium text-slate-900`}>{r.facilityName}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-sm text-slate-500`}>{r.qr_value}</td>
                    {fieldDefs.map((f) => {
                      const raw = r.custom_fields[f.field_key]
                      if (f.field_type === 'image') {
                        const count = Array.isArray(raw) ? raw.length : 0
                        return (
                          <td key={f.id} className={`${td} whitespace-nowrap text-slate-500`}>
                            {count === 0 ? '—' : `${count} photo${count === 1 ? '' : 's'}`}
                          </td>
                        )
                      }
                      return (
                        <td key={f.id} className={`${td} whitespace-nowrap text-slate-700`}>
                          {formatFieldValue(f, raw)}
                        </td>
                      )
                    })}
                    <td className={`${td} whitespace-nowrap`}>
                      {r.cyrixItemCode ? (
                        <span className="text-slate-700">
                          <span className="font-mono text-sm text-slate-500">{r.cyrixItemCode}</span>
                          {r.cyrixItemName && ` · ${r.cyrixItemName}`}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Not linked
                        </span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{formatDate(r.created_at)}</td>
                    {showAttribution && (
                      <td className={`${td} whitespace-nowrap text-slate-500`}>
                        {r.taggerName ? `${r.taggerName}${r.taggerEcode ? ` (${r.taggerEcode})` : ''}` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmMode !== null}
        title={
          confirmMode === 'all'
            ? `Delete all ${visible.length} tagged item${visible.length === 1 ? '' : 's'}?`
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
