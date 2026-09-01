import { supabase } from './supabaseClient'
import { fetchAutofillSources } from './catalogueColumns'
import type { FieldDefinitionRow } from '../types/app'

/**
 * The client's catalogue columns, as fields on the tag form.
 *
 * Adding them one at a time was the wrong shape of work. The columns are
 * already known -- an upload put them in `catalogue_columns`, spelled the way
 * the client spells them -- so asking an admin to retype each one as a custom
 * field, and to remember which column it maps to, is asking them to copy out a
 * list the site is holding. They are provisioned instead, and what is left is
 * the part only a person can answer: which of them an engineer should be asked
 * for, and in what order.
 *
 * They are ordinary `field_definitions` rows, so the tag form, the autofill,
 * the tagged-list columns and the edit-approval flow all keep working on one
 * kind of thing rather than two.
 */

/** Marks a field as one the client's catalogue provisioned, not a person. */
const CLIENT_PREFIX = 'client_'

/**
 * Namespaced deliberately. `field_key` is what every equipment row stores its
 * value under, and a site that already has a hand-made "Item Code" field must
 * not have it silently collide with the client column of the same name.
 */
export function clientFieldKey(columnKey: string): string {
  return `${CLIENT_PREFIX}${columnKey}`
}

export function isClientColumnField(field: { field_key: string }): boolean {
  return field.field_key.startsWith(CLIENT_PREFIX)
}

/** The client column that identifies a part, and so carries the scanner. */
const CODE_COLUMN = 'item_code'

export interface SyncResult {
  added: number
  /** Set when the code column was skipped because a scan field already exists. */
  keptExistingScanner: boolean
}

/**
 * Creates a field for every client column that hasn't got one yet.
 *
 * Insert-only, and that is the whole contract. An admin who unticks a column
 * is answering "should the form ask for this", and a later sync that flipped
 * it back on would be overruling them with a default -- so a column that is
 * already known is left exactly as it is, ticked or not.
 *
 * The code column becomes the scan field, but only if the form hasn't already
 * got one: the mapping panel and the item lookup both resolve the scanned code
 * by finding *the* barcode field, and a second one would make that a coin toss.
 */
export async function syncClientColumnFields(existing: FieldDefinitionRow[]): Promise<SyncResult> {
  const sources = await fetchAutofillSources()
  if (sources.length === 0) return { added: 0, keptExistingScanner: false }

  const known = new Set(existing.map((f) => f.field_key))
  const hasScanner = existing.some((f) => f.field_type === 'barcode')
  let order = existing.length ? Math.max(...existing.map((f) => f.display_order)) + 1 : 0

  const rows = []
  let keptExistingScanner = false

  for (const source of sources) {
    const isCode = source.key === CODE_COLUMN
    if (isCode && hasScanner) {
      // The form already has a scan field; that IS the item code.
      keptExistingScanner = true
      continue
    }
    const field_key = clientFieldKey(source.key)
    if (known.has(field_key)) continue

    rows.push({
      field_key,
      label: source.label,
      // The code is scanned off the part, so it gets the scanner. Everything
      // else is filled from what that scan resolves to, and stays text the
      // engineer can correct.
      field_type: isCode ? ('barcode' as const) : ('text' as const),
      // The code field is the input to the lookup rather than an output of
      // it, so it names no source.
      autofill_source: isCode ? null : source.key,
      required: false,
      display_order: order++,
      active: source.visible,
    })
  }

  if (rows.length === 0) return { added: 0, keptExistingScanner }

  const { error } = await supabase.from('field_definitions').insert(rows)
  if (error) throw new Error(error.message)
  return { added: rows.length, keptExistingScanner }
}
