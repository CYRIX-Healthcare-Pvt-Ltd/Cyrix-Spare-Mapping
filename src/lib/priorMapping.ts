import { supabase } from './supabaseClient'
import { normalizeItemName } from './itemMatch'

/** A Cyrix item that this spare name has already been linked to before. */
export interface PriorMapping {
  cyrixItemCode: string
  cyrixItemName: string | null
  /** How many Blue Star items with this name point at it. */
  itemCount: number
  /** Who made the most recent of those links, when it is known. */
  lastMappedBy: string | null
  lastMappedAt: string | null
}

/**
 * What this spare name has been linked to before, by anyone.
 *
 * Without this, two engineers tagging the same part on different days each
 * pick from fuzzy suggestions on their own, and the same spare ends up
 * against two different Cyrix items -- with nothing on screen to warn either
 * of them. Matching on the normalised name means "Ecg Cable 12 Pin" and
 * "ecg cable 12pin" are recognised as the same decision already taken.
 *
 * Deliberately reported rather than applied: a name is not proof two spares
 * are the same part, so the tagger still confirms. Where the name has been
 * linked to more than one Cyrix item, all of them come back -- that
 * disagreement is exactly what someone needs to see.
 */
export async function findPriorMappings(spareName: string, limit = 3): Promise<PriorMapping[]> {
  const normalized = normalizeItemName(spareName)
  if (!normalized) return []

  const { data: items } = await supabase
    .from('bluestar_item_master')
    .select('id, cyrix_item_code, cyrix_item_name')
    .eq('name_normalized', normalized)
    .not('cyrix_item_code', 'is', null)
    .limit(50)

  if (!items || items.length === 0) return []

  // One entry per Cyrix item, carrying how many spares agree on it.
  const byCode = new Map<string, { name: string | null; ids: string[] }>()
  for (const item of items) {
    if (!item.cyrix_item_code) continue
    const entry = byCode.get(item.cyrix_item_code) ?? { name: item.cyrix_item_name, ids: [] }
    entry.ids.push(item.id)
    byCode.set(item.cyrix_item_code, entry)
  }

  // Who decided this, from the mapping history -- the whole point is that the
  // next person can see it was someone's call and whose.
  const allIds = [...byCode.values()].flatMap((e) => e.ids)
  const { data: history } = await supabase
    .from('bluestar_item_mapping_history')
    .select('to_cyrix_item_code, performed_by, performed_at')
    .in('bluestar_item_id', allIds)
    .not('to_cyrix_item_code', 'is', null)
    .order('performed_at', { ascending: false })

  const performerIds = [...new Set((history ?? []).map((h) => h.performed_by).filter((v): v is string => !!v))]
  const { data: people } = performerIds.length
    ? await supabase.from('profiles').select('id, full_name, ecode').in('id', performerIds)
    : { data: [] }
  const personById = new Map((people ?? []).map((p) => [p.id, p]))

  const latestForCode = new Map<string, { by: string | null; at: string }>()
  for (const h of history ?? []) {
    // Ordered newest first, so the first sighting of a code is its latest.
    if (!h.to_cyrix_item_code || latestForCode.has(h.to_cyrix_item_code)) continue
    const person = h.performed_by ? personById.get(h.performed_by) : null
    latestForCode.set(h.to_cyrix_item_code, {
      by: person ? `${person.full_name}${person.ecode ? ` (${person.ecode})` : ''}` : null,
      at: h.performed_at,
    })
  }

  return [...byCode.entries()]
    .map(([cyrixItemCode, entry]) => ({
      cyrixItemCode,
      cyrixItemName: entry.name,
      itemCount: entry.ids.length,
      lastMappedBy: latestForCode.get(cyrixItemCode)?.by ?? null,
      lastMappedAt: latestForCode.get(cyrixItemCode)?.at ?? null,
    }))
    .sort((a, b) => {
      // Most agreement first: the link the greatest number of spares already
      // point at is the one most likely to be right.
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount

      // Equally supported, so the most recent decision leads -- if people are
      // split, what they concluded latest is the better guide. A link with no
      // recorded date (one that arrived in an uploaded master file rather than
      // from tagging) sorts last, since there is nothing to say it is recent.
      const aAt = a.lastMappedAt ? Date.parse(a.lastMappedAt) : 0
      const bAt = b.lastMappedAt ? Date.parse(b.lastMappedAt) : 0
      return bAt - aAt
    })
    .slice(0, limit)
}
