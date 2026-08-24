import { supabase } from './supabaseClient'
import type { CyrixItemRow } from '../types/app'

/** Mirrors the `name_normalized` generated column in migration 0012. */
export function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function bigrams(s: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

/**
 * 0..1 similarity between two item names, ignoring case and punctuation, so
 * "abc" and "ab -c" score 1. Below that it's a Sorensen-Dice coefficient over
 * character bigrams -- forgiving of small spelling and word-order differences
 * without needing a full edit-distance pass over a large catalogue.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeItemName(a)
  const nb = normalizeItemName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const ga = bigrams(na)
  const gb = bigrams(nb)
  let shared = 0
  let totalA = 0
  for (const [gram, count] of ga) {
    totalA += count
    const other = gb.get(gram)
    if (other) shared += Math.min(count, other)
  }
  let totalB = 0
  for (const count of gb.values()) totalB += count

  return (2 * shared) / (totalA + totalB)
}

export interface ScoredItem {
  item: CyrixItemRow
  score: number
}

/** Anything at or above this is worth showing as a suggestion. */
export const SUGGESTION_THRESHOLD = 0.4

// Filler words match almost everything, so they'd crowd real candidates out
// of the shortlist without narrowing anything.
const STOPWORDS = new Set(['and', 'for', 'the', 'with', 'without', 'from', 'set', 'kit', 'type', 'new'])

function searchTokens(name: string): string[] {
  return [...new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t)))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
}

/**
 * Finds Cyrix items that plausibly match a BPL item name.
 *
 * Narrowing happens in Postgres (against the indexed normalized column) and
 * only the shortlist is scored in the browser -- these catalogues run to
 * thousands of rows, so downloading all of them to rank client-side isn't
 * viable. Callers still get a manual search as a fallback for the cases
 * where nothing scores well enough.
 */
export async function findCyrixMatches(bplItemName: string, limit = 5): Promise<ScoredItem[]> {
  const normalized = normalizeItemName(bplItemName)
  if (!normalized) return []

  // Normalized values are alphanumeric only, so they can't break out of
  // PostgREST's comma/dot-delimited `or` filter syntax.
  const filters = [`name_normalized.like.*${normalized}*`]
  for (const token of searchTokens(bplItemName)) {
    filters.push(`name_normalized.like.*${normalizeItemName(token)}*`)
  }

  // Exact matches are fetched separately rather than folded into the broad
  // `or` below. A single capped, unordered candidate query can drop the exact
  // match entirely when a common token (e.g. "humidifier") matches more rows
  // than the cap -- which is precisely the row that must never be missed.
  const [{ data: exact }, { data: fuzzy }] = await Promise.all([
    supabase.from('cyrix_item_master').select('*').eq('active', true).eq('name_normalized', normalized).limit(10),
    supabase.from('cyrix_item_master').select('*').eq('active', true).or(filters.join(',')).limit(50),
  ])

  const byId = new Map<string, CyrixItemRow>()
  for (const row of [...(exact ?? []), ...(fuzzy ?? [])]) byId.set(row.id, row)

  return rankCyrixMatches(bplItemName, [...byId.values()], limit)
}

/**
 * Orders suggestions the way a tagger needs to read them.
 *
 * Name similarity is what qualifies a candidate at all, and an exact
 * normalized name match always leads -- a weak match that happens to be in
 * stock shouldn't outrank the item that is demonstrably the same part.
 * Below that tier, items actually held in stock come first, since those are
 * the ones the tagger is realistically looking at on the shelf.
 */
export function rankCyrixMatches(bplItemName: string, candidates: CyrixItemRow[], limit = 5): ScoredItem[] {
  const stockOf = (item: CyrixItemRow) => (typeof item.in_stock === 'number' ? item.in_stock : 0)

  return candidates
    .map((item) => ({ item, score: similarity(bplItemName, item.item_name) }))
    .filter((m) => m.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => {
      const exact = Number(b.score === 1) - Number(a.score === 1)
      if (exact !== 0) return exact

      const inStock = Number(stockOf(b.item) > 0) - Number(stockOf(a.item) > 0)
      if (inStock !== 0) return inStock

      if (b.score !== a.score) return b.score - a.score
      return stockOf(b.item) - stockOf(a.item)
    })
    .slice(0, limit)
}

/** Free-text search over the Cyrix catalogue, for when no suggestion fits. */
export async function searchCyrixItems(term: string, limit = 20): Promise<CyrixItemRow[]> {
  const clean = term.trim()
  if (!clean) return []
  const pattern = `%${clean}%`
  const { data } = await supabase
    .from('cyrix_item_master')
    .select('*')
    .eq('active', true)
    .or(`item_code.ilike.${pattern},item_name.ilike.${pattern}`)
    .order('item_code')
    .limit(limit)
  return data ?? []
}
