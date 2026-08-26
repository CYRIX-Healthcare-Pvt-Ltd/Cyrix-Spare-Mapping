import { supabase } from './supabaseClient'
import { isNameField } from './itemAutofill'
import type { BlueStarItemRow, FieldDefinitionRow } from '../types/app'

/**
 * Finds the Blue Star item a scanned code refers to.
 *
 * The item code is the only link. Blue Star identifies a part by its code
 * and nothing else, so a code that isn't in the catalogue simply isn't in it.
 *
 * Returns null when nothing matches, which is a real answer rather than an
 * error: the catalogue is Blue Star's reference data and tagging never adds
 * to it.
 */
export async function lookupBlueStarItem(code: string): Promise<BlueStarItemRow | null> {
  const clean = code.trim()
  if (!clean) return null

  const { data } = await supabase
    .from('bluestar_item_master')
    .select('*')
    .eq('item_code', clean)
    .limit(1)
  return data?.[0] ?? null
}

/** The Blue Star code a filled-in tag form is claiming, if any. */
export function blueStarCodeFromForm(
  fields: FieldDefinitionRow[],
  customFields: Record<string, unknown>
): string | null {
  const key = fields.find((f) => f.field_type === 'barcode')?.field_key
  if (!key) return null
  const raw = customFields[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/** The spare name a filled-in tag form carries, used for matching. */
export function spareNameFromForm(
  fields: FieldDefinitionRow[],
  customFields: Record<string, unknown>
): string | null {
  const key = fields.find(isNameField)?.field_key
  if (!key) return null
  const raw = customFields[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/**
 * How many QR codes have been tagged against each of these catalogue items.
 *
 * Goes through a definer function rather than counting equipment rows in the
 * browser: equipment is readable only for the warehouses you're assigned to,
 * so a client-side count would say "1 of 4" to one person and "3 of 4" to
 * another. The function returns counts and nothing else.
 */
export async function fetchTagCounts(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map()
  const { data } = await supabase.rpc('bluestar_tag_counts', { item_ids: itemIds })
  const rows = (data ?? []) as { bluestar_item_id: string; tagged_count: number }[]
  return new Map(rows.map((r) => [r.bluestar_item_id, Number(r.tagged_count)]))
}

export type TaggingStatus = 'pending' | 'partial' | 'complete' | 'unknown'

/**
 * Where an item stands: nothing tagged yet, some of its units tagged, or all
 * of them. Without a quantity there is no denominator, so the honest answer
 * is that the status isn't known rather than a guess.
 *
 * More tags than the quantity still counts as complete -- it means the master
 * file is behind, not that the work is unfinished.
 */
export function taggingStatus(tagged: number, quantity: number | null): TaggingStatus {
  if (quantity == null || quantity <= 0) return 'unknown'
  if (tagged <= 0) return 'pending'
  return tagged >= quantity ? 'complete' : 'partial'
}

/** One Cyrix item that a part's units point at, and how many of them do. */
export interface MappingShare {
  cyrixItemCode: string
  cyrixItemName: string | null
  tagCount: number
}

/**
 * What each catalogue item's tags actually add up to.
 *
 * The mapping lives on the tag, so a part with four units can legitimately
 * point at two different Cyrix items -- two engineers, two readings of the
 * same shelf. This reports every distinct answer with its count rather than
 * picking one, because a split is the thing worth seeing.
 *
 * Definer-backed for the same reason the tag counts are: equipment is
 * readable only for the warehouses you're assigned to, so counting in the
 * browser would give each person a different picture of the same part.
 */
export async function fetchMappingSummary(itemIds: string[]): Promise<Map<string, MappingShare[]>> {
  if (itemIds.length === 0) return new Map()
  const { data } = await supabase.rpc('bluestar_mapping_summary', { item_ids: itemIds })
  const rows = (data ?? []) as {
    bluestar_item_id: string
    cyrix_item_code: string
    cyrix_item_name: string | null
    tag_count: number
  }[]

  const byItem = new Map<string, MappingShare[]>()
  for (const r of rows) {
    const list = byItem.get(r.bluestar_item_id) ?? []
    list.push({ cyrixItemCode: r.cyrix_item_code, cyrixItemName: r.cyrix_item_name, tagCount: Number(r.tag_count) })
    byItem.set(r.bluestar_item_id, list)
  }
  return byItem
}
