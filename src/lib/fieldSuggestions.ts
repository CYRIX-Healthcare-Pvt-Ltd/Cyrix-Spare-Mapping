import { supabase } from './supabaseClient'

/**
 * Distinct previously-used values per text-type custom field key, so one
 * engineer typing "Ventilator" means the next one sees it offered instead
 * of retyping it (and risking "ventilator" / "Vent" fragmenting what's
 * really the same equipment type across records).
 */
export async function fetchFieldSuggestions(): Promise<Record<string, string[]>> {
  const { data } = await supabase.from('equipment').select('custom_fields').limit(500)

  const sets: Record<string, Set<string>> = {}
  for (const row of data ?? []) {
    for (const [key, val] of Object.entries(row.custom_fields ?? {})) {
      if (typeof val === 'string' && val.trim()) {
        ;(sets[key] ??= new Set()).add(val.trim())
      }
    }
  }

  const result: Record<string, string[]> = {}
  for (const [key, set] of Object.entries(sets)) {
    result[key] = [...set].sort()
  }
  return result
}
