import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
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
          facilityName: facilityMap.get(e.facility_id)?.name ?? 'Unknown facility',
          facilityDistrict: facilityMap.get(e.facility_id)?.district ?? null,
          facilityCity: facilityMap.get(e.facility_id)?.city ?? null,
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
    <div className="mx-auto max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Tagged equipment</h1>
      <p className="mb-4 text-sm text-slate-500">
        {profile.role === 'engineer'
          ? "Equipment you've scanned and tagged."
          : "Equipment tagged by your team, and you."}
      </p>

      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing tagged yet.</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">District</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">City</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Facility</th>
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
    </div>
  )
}
