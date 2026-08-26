import { supabase } from './supabaseClient'
import { normalizeItemName } from './itemMatch'

/** A Cyrix item that this spare name has already been linked to before. */
export interface PriorMapping {
  cyrixItemCode: string
  cyrixItemName: string | null
  /** How many tagged units of parts with this name point at it. */
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
 * of them. Matching is on the Blue Star item's normalised name, so "Ecg Cable 12
 * Pin" and "ecg cable 12pin" count as the same decision already taken.
 *
 * Deliberately reported rather than applied: a name is not proof two spares
 * are the same part, so the tagger still confirms. Where the name has been
 * linked to more than one Cyrix item, all of them come back -- that
 * disagreement is exactly what someone needs to see.
 */
export async function findPriorMappings(spareName: string, limit = 3): Promise<PriorMapping[]> {
  const normalized = normalizeItemName(spareName)
  if (!normalized) return []

  // Answered from the tags, since that is where a mapping is recorded now,
  // and through a definer function so the counts span every warehouse rather
  // than only the ones this person can see.
  const { data } = await supabase.rpc('cyrix_mappings_for_name', { p_name_normalized: normalized })
  const rows = (data ?? []) as {
    cyrix_item_code: string
    cyrix_item_name: string | null
    tag_count: number
    last_mapped_by: string | null
    last_mapped_at: string | null
  }[]
  if (rows.length === 0) return []

  const performerIds = [...new Set(rows.map((r) => r.last_mapped_by).filter((v): v is string => !!v))]
  const { data: people } = performerIds.length
    ? await supabase.from('profiles').select('id, full_name, ecode').in('id', performerIds)
    : { data: [] }
  const personById = new Map((people ?? []).map((p) => [p.id, p]))

  return rows
    .map((r) => {
      const person = r.last_mapped_by ? personById.get(r.last_mapped_by) : null
      return {
        cyrixItemCode: r.cyrix_item_code,
        cyrixItemName: r.cyrix_item_name,
        itemCount: Number(r.tag_count),
        lastMappedBy: person ? `${person.full_name}${person.ecode ? ` (${person.ecode})` : ''}` : null,
        lastMappedAt: r.last_mapped_at,
      }
    })
    .sort((a, b) => {
      // Most agreement first: the link the greatest number of units already
      // point at is the one most likely to be right.
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount

      // Equally supported, so the most recent decision leads -- if people are
      // split, what they concluded latest is the better guide. A link with no
      // recorded date sorts last, since there is nothing to say it is recent.
      const aAt = a.lastMappedAt ? Date.parse(a.lastMappedAt) : 0
      const bAt = b.lastMappedAt ? Date.parse(b.lastMappedAt) : 0
      return bAt - aAt
    })
    .slice(0, limit)
}
