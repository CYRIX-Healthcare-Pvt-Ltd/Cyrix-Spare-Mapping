import { supabase } from './supabaseClient'
import type { BlueStarItemRow, MappingHistoryRow } from '../types/app'

/**
 * Points a Blue Star item at a Cyrix item (or clears it with null).
 *
 * Always goes through the set_cyrix_mapping RPC rather than updating the row
 * directly: the function writes the audit row and applies the change in one
 * transaction, so a mapping can't be changed without leaving a trace, and
 * non-admins can change the mapping without being able to touch anything
 * else on the catalogue row.
 */
export async function setCyrixMapping(
  itemId: string,
  cyrixItemCode: string | null
): Promise<{ item: BlueStarItemRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('set_cyrix_mapping', {
    item_id: itemId,
    new_cyrix_code: cyrixItemCode,
  })
  if (error) return { item: null, error: error.message }
  return { item: data as BlueStarItemRow, error: null }
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
