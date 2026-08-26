import { supabase } from './supabaseClient'
import type { MappingHistoryRow } from '../types/app'

/**
 * Records the Cyrix item chosen for one tagged unit.
 *
 * Per tag, not per part: four units of the same Blue Star item can legitimately
 * be mapped differently, and one engineer's later choice must not silently
 * rewrite what an earlier engineer recorded for a different unit. Goes through
 * the RPC so the change lands in the mapping history naming the unit.
 */
export async function setTagCyrixMapping(
  equipmentId: string,
  cyrixItemCode: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_tag_cyrix_mapping', {
    p_equipment_id: equipmentId,
    p_cyrix_code: cyrixItemCode,
  })
  return { error: error ? error.message : null }
}

export interface MappingHistoryEntry extends MappingHistoryRow {
  performerName: string | null
  performerEcode: string | null
}

export async function fetchMappingHistory(itemId: string): Promise<MappingHistoryEntry[]> {
  const { data } = await supabase
    .from('bluestar_item_mapping_history')
    .select('*')
    .eq('bluestar_item_id', itemId)
    .order('performed_at', { ascending: true })

  const rows = data ?? []
  const ids = [...new Set(rows.map((r) => r.performed_by).filter((v): v is string => !!v))]
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, full_name, ecode').in('id', ids)
    : { data: [] }
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((r) => ({
    ...r,
    performerName: r.performed_by ? (byId.get(r.performed_by)?.full_name ?? null) : null,
    performerEcode: r.performed_by ? (byId.get(r.performed_by)?.ecode ?? null) : null,
  }))
}
