import type { FieldDefinitionRow } from '../types/app'

/** What a resolved barcode can contribute to the rest of the form. */
export interface ResolvedItem {
  blueStarItemCode: string | null
  blueStarItemName: string | null
  cyrixItemCode: string | null
  cyrixItemName: string | null
  make: string | null
  model: string | null
  itemGroup: string | null
  parentEquipment: string | null
  additionalIdentifier: string | null
}

/**
 * Which part of a resolved item a given custom field should be filled from.
 *
 * Custom fields are admin-defined with free-text labels, so there's no
 * declared link between a field and the item master. This infers one from
 * the label, which covers the fields these forms actually use. A field it
 * can't place is simply left alone for the engineer to fill in -- and every
 * field stays editable either way, since a barcode is optional and may not
 * resolve at all.
 */
/**
 * Whether a field is the one that holds the item's name. The Cyrix mapping
 * panel is rendered directly beneath it, since choosing a Cyrix item is
 * really choosing what this spare is called.
 */
export function isNameField(field: FieldDefinitionRow): boolean {
  if (field.field_type === 'image' || field.field_type === 'barcode') return false
  const label = `${field.label} ${field.field_key}`.toLowerCase()
  if (/(parent|make|brand|manufacturer|model|group|category|identifier)/.test(label)) return false
  return /(name|description|spare|equipment)/.test(label)
}

export function valueForField(field: FieldDefinitionRow, item: ResolvedItem): string | null {
  // Barcode and image fields are never autofilled: the barcode is the input
  // that produced this item, and photos have to be taken on the spot.
  if (field.field_type === 'image' || field.field_type === 'barcode') return null

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
  // Prefer our own naming over Blue Star's for anything name/description shaped.
  if (has('name', 'description', 'spare', 'equipment')) return item.cyrixItemName ?? item.blueStarItemName

  return null
}

/**
 * Builds the patch to apply to a form's custom_fields after a barcode
 * resolves. Only fills fields that are currently empty, so anything the
 * engineer already typed is never overwritten.
 */
export function buildAutofill(
  fields: FieldDefinitionRow[],
  currentValues: Record<string, unknown>,
  item: ResolvedItem
): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const field of fields) {
    const existing = currentValues[field.field_key]
    const isEmpty = existing === undefined || existing === null || existing === ''
    if (!isEmpty) continue

    const value = valueForField(field, item)
    if (value) patch[field.field_key] = value
  }
  return patch
}
