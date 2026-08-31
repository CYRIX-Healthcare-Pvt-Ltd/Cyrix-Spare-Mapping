import type { FieldDefinitionRow } from '../types/app'

/**
 * What a resolved client item code can contribute to the rest of the form.
 *
 * Two catalogues feed this. The client's own master row is what a scanned
 * code resolves to directly, and it carries whatever columns their file had
 * -- code, name, quantity, and every other column in `attributes`. The Cyrix
 * row only arrives once a Cyrix item has been linked, and carries our own
 * naming for the same part.
 */
export interface ResolvedItem {
  blueStarItemCode: string | null
  blueStarItemName: string | null
  /** Quantity from the client's master file, when their sheet carried one. */
  blueStarQuantity: number | null
  /**
   * Every other column the client's file brought with it, keyed the way the
   * item master table keys them. This is where "Item Group(Material Group)",
   * "HSN/SAC Code" and "Tax Rate" live -- the columns no heuristic will ever
   * place, and the reason a field can name its source outright.
   */
  blueStarAttributes: Record<string, string>
  cyrixItemCode: string | null
  cyrixItemName: string | null
  make: string | null
  model: string | null
  itemGroup: string | null
  parentEquipment: string | null
  additionalIdentifier: string | null
}

/**
 * Whether a field is the one that holds the item's name. The Cyrix mapping
 * panel is rendered directly beneath it, since choosing a Cyrix item is
 * really choosing what this spare is called.
 */
export function isNameField(field: FieldDefinitionRow): boolean {
  if (field.field_type === 'image' || field.field_type === 'barcode') return false
  if (field.autofill_source) return field.autofill_source === 'item_name'
  const label = `${field.label} ${field.field_key}`.toLowerCase()
  if (/(parent|make|brand|manufacturer|model|group|category|identifier)/.test(label)) return false
  return /(name|description|spare|equipment)/.test(label)
}

/**
 * A named client item master column, read off the resolved row.
 *
 * The three real columns are spelled out; everything else is a key in the
 * `attributes` bag, which is exactly the set of columns an uploaded file
 * turned out to carry. An admin picks one of these per field in
 * Admin -> Custom fields, so a column nobody anticipated costs a dropdown
 * rather than a code change.
 */
function fromClientColumn(key: string, item: ResolvedItem): string | null {
  if (key === 'item_code') return item.blueStarItemCode
  if (key === 'item_name') return item.blueStarItemName
  if (key === 'quantity') return item.blueStarQuantity == null ? null : String(item.blueStarQuantity)
  const value = item.blueStarAttributes[key]
  return value?.trim() ? value : null
}

/**
 * Which part of a resolved item a given field should be filled from.
 *
 * A field that names its source is filled from it, full stop. A field that
 * doesn't falls back to reading its label, which is how this worked before
 * the source could be declared and is what every field defined back then
 * still relies on.
 */
export function valueForField(field: FieldDefinitionRow, item: ResolvedItem): string | null {
  // Image fields are never autofilled: photos have to be taken on the spot.
  // The code field is the input that produced this item, so filling it from
  // the item it resolved to would only ever write back what is already there.
  if (field.field_type === 'image' || field.field_type === 'barcode') return null

  if (field.autofill_source) return fromClientColumn(field.autofill_source, item)

  const label = `${field.label} ${field.field_key}`.toLowerCase()
  const has = (...words: string[]) => words.some((w) => label.includes(w))

  // Most specific first -- "parent equipment" also contains "equip", and
  // "model" can appear alongside "name" in a label like "model name".
  if (has('parent')) return item.parentEquipment
  if (has('make', 'brand', 'manufacturer')) return item.make
  if (has('model')) return item.model
  if (has('group', 'category')) return item.itemGroup
  if (has('item code', 'item_code', 'cyrix code')) return item.cyrixItemCode ?? item.blueStarItemCode
  if (has('identifier', 'part no', 'part number')) return item.additionalIdentifier
  // Prefer our own naming over the client's for anything name/description shaped.
  if (has('name', 'description', 'spare', 'equipment')) return item.cyrixItemName ?? item.blueStarItemName

  return null
}

/** The patch a resolve produces, and the keys it should stop claiming. */
export interface Autofill {
  /** Values to write. */
  patch: Record<string, string>
  /** Keys previously filled from a scan that this item has nothing for. */
  cleared: string[]
}

/**
 * Builds the change to apply to a form's custom_fields after a code resolves.
 *
 * Two rules, and the difference between them is the whole point:
 *
 *  * A field the tagger typed into is never touched. Their answer beats the
 *    file's, and once they edit a field it stops counting as autofilled.
 *  * A field that is empty, or that still holds a value from an earlier
 *    scan, is refilled. Correcting a mistyped code has to replace the last
 *    item's details rather than leave them stranded in the form -- which is
 *    what "only fill empty fields" quietly did.
 *
 * Anything the new item has no value for is cleared for the same reason, so
 * the form never shows a mix of two different spares.
 */
export function buildAutofill(
  fields: FieldDefinitionRow[],
  currentValues: Record<string, unknown>,
  item: ResolvedItem,
  autofilledKeys: readonly string[] = []
): Autofill {
  const owned = new Set(autofilledKeys)
  const patch: Record<string, string> = {}
  const cleared: string[] = []

  for (const field of fields) {
    const existing = currentValues[field.field_key]
    const isEmpty = existing === undefined || existing === null || existing === ''
    // Not empty and not ours to overwrite -- the tagger put it there.
    if (!isEmpty && !owned.has(field.field_key)) continue

    const value = valueForField(field, item)
    if (value) {
      if (value !== existing) patch[field.field_key] = value
    } else if (owned.has(field.field_key) && !isEmpty) {
      cleared.push(field.field_key)
    }
  }

  return { patch, cleared }
}
