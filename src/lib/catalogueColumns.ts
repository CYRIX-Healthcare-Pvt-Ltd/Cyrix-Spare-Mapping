import { supabase } from './supabaseClient'
import type { CatalogueKey, CatalogueColumnSource, Database } from '../types/database'

export type { CatalogueKey }
export type CatalogueColumn = Database['public']['Tables']['catalogue_columns']['Row']

/**
 * The app's own columns, in their default order.
 *
 * These exist whether or not an uploaded file mentions them: `item_code` and
 * `item_name` are the identity, and on the Blue Star side `cyrix_item`,
 * `tagged` and `status` are computed from tagging rather than read from any
 * sheet -- which is exactly why they can't just be discovered from the file.
 *
 * Kept in step with the seed rows in migration 0026.
 */
export const CORE_COLUMNS: Record<CatalogueKey, { key: string; label: string }[]> = {
  bluestar: [
    { key: 'item_code', label: 'Item code' },
    { key: 'item_name', label: 'Item name' },
    { key: 'cyrix_item', label: 'Cyrix item' },
    { key: 'quantity', label: 'Qty' },
    { key: 'tagged', label: 'Tagged' },
    { key: 'status', label: 'Status' },
  ],
  cyrix: [
    { key: 'item_code', label: 'Item code' },
    { key: 'item_name', label: 'Item name' },
    { key: 'in_stock', label: 'In stock' },
    { key: 'item_cost', label: 'Item cost' },
    { key: 'additional_identifier', label: 'Addl. identifier' },
    { key: 'item_group', label: 'Item group' },
    { key: 'parent_equipment', label: 'Parent equip' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
  ],
}

/**
 * The built-in columns are not a preference.
 *
 * The item code and name identify the row, and Cyrix item, Qty, Tagged and
 * Status are the tagging progress this app exists to report -- switching one
 * off doesn't tidy the table, it removes the point of it. So the choice is
 * only ever over the columns a file brought with it. A check constraint in
 * migration 0028 holds the same line in the database.
 */
export function isChoosable(column: { source: CatalogueColumnSource }): boolean {
  return column.source === 'imported'
}

/**
 * A header as it appears in the file, reduced to a stable key.
 *
 * The same column comes back as "Item Group", "ITEM GROUP" and "Item  Group"
 * across revisions of the same file; without this, each spelling would become
 * a separate column on the site.
 */
export function normalizeKey(header: string): string {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return key || 'column'
}

/* ------------------------------------------------------- header detection --- */

export interface MappableField {
  key: string
  label: string
  required?: boolean
  /** Header spellings seen in the wild, tried in order. */
  aliases: string[]
}

/**
 * The columns the app stores in real database columns rather than in the
 * `attributes` bag, and the header spellings each one answers to.
 *
 * These are guesses, not rules: the upload dialog shows what was matched and
 * lets the admin re-point anything the guess got wrong, so a header nobody
 * anticipated costs a dropdown rather than a failed import.
 */
export const MAPPABLE_FIELDS: Record<CatalogueKey, MappableField[]> = {
  bluestar: [
    {
      key: 'item_code',
      label: 'Item code',
      required: true,
      aliases: [
        'item_code', 'code', 'item', 'item_no', 'item_number', 'itemcode',
        'part_code', 'part_no', 'part_number', 'material', 'material_code',
        'spare_code', 'sku', 'bluestar_item_code', 'blue_star_item_code', 'bs_code',
      ],
    },
    {
      key: 'item_name',
      label: 'Item name',
      required: true,
      aliases: [
        'item_name', 'name', 'description', 'item_description', 'material_description',
        'spare_name', 'part_name', 'particulars', 'desc', 'item_desc',
      ],
    },
    {
      key: 'quantity',
      label: 'Qty',
      aliases: ['quantity', 'qty', 'qty_nos', 'nos', 'units', 'unit_qty', 'stock_qty', 'total_qty', 'count'],
    },
    // No Cyrix fields here on purpose. A unit is linked to a Cyrix item by
    // tagging its QR, one unit at a time -- four units of the same part can
    // legitimately point at two different Cyrix items, which is a fact about
    // the units and not something a single row of a master file can carry.
  ],
  cyrix: [
    {
      key: 'item_code',
      label: 'Item code',
      required: true,
      aliases: ['item_code', 'code', 'item', 'item_no', 'item_number', 'itemcode', 'part_code', 'sku'],
    },
    {
      key: 'item_name',
      label: 'Item name',
      required: true,
      aliases: ['item_name', 'name', 'description', 'item_description', 'particulars', 'desc'],
    },
    { key: 'in_stock', label: 'In stock', aliases: ['in_stock', 'instock', 'stock', 'qty_in_stock', 'available', 'quantity', 'qty'] },
    { key: 'item_cost', label: 'Item cost', aliases: ['item_cost', 'cost', 'rate', 'price', 'unit_cost', 'unit_price'] },
    {
      key: 'additional_identifier',
      label: 'Addl. identifier',
      aliases: ['additional_identifier', 'addl_identifier', 'alt_code', 'alternate_code', 'identifier', 'mfr_part_no'],
    },
    { key: 'item_group', label: 'Item group', aliases: ['item_group', 'group', 'category'] },
    { key: 'parent_equipment', label: 'Parent equip', aliases: ['parent_equipment', 'parent_equip', 'parent', 'equipment'] },
    { key: 'make', label: 'Make', aliases: ['make', 'manufacturer', 'brand'] },
    { key: 'model', label: 'Model', aliases: ['model', 'model_no', 'model_number'] },
  ],
}

/** Field key -> the header it reads from, or null when nothing matched. */
export type FieldMapping = Record<string, string | null>

export function detectMapping(headers: string[], fields: MappableField[]): FieldMapping {
  // First spelling wins for a duplicated header, matching how the reader
  // renames the second one ("Remarks (2)") and so keys it separately.
  const byKey = new Map<string, string>()
  for (const header of headers) {
    const key = normalizeKey(header)
    if (!byKey.has(key)) byKey.set(key, header)
  }

  const claimed = new Set<string>()
  const mapping: FieldMapping = {}
  // Required fields choose first: on a sheet with only "Description", the
  // item name should take it rather than losing it to a looser alias.
  for (const field of [...fields].sort((a, b) => Number(!!b.required) - Number(!!a.required))) {
    const hit = field.aliases.map((a) => byKey.get(a)).find((h) => h && !claimed.has(h))
    mapping[field.key] = hit ?? null
    if (hit) claimed.add(hit)
  }
  return mapping
}

/**
 * The headers no field claimed -- everything the app has no column for, which
 * is exactly what belongs in `attributes`.
 */
export function extraHeaders(headers: string[], mapping: FieldMapping): string[] {
  const claimed = new Set(Object.values(mapping).filter(Boolean) as string[])
  return headers.filter((h) => !claimed.has(h))
}

/**
 * Attribute keys for a set of extra headers.
 *
 * A key that would collide with one of the app's own columns is suffixed
 * rather than allowed to shadow it -- an imported column called "Status"
 * means something different from the tagging status, and the table would
 * otherwise have two columns claiming the same key.
 */
export function attributeKeys(catalogue: CatalogueKey, headers: string[]): Map<string, string> {
  const reserved = new Set(CORE_COLUMNS[catalogue].map((c) => c.key))
  const used = new Set<string>()
  const keys = new Map<string, string>()

  for (const header of headers) {
    const base = normalizeKey(header)
    let key = base
    let n = 2
    while (reserved.has(key) || used.has(key)) key = `${base}_${n++}`
    used.add(key)
    keys.set(header, key)
  }
  return keys
}

// The keys are a pure function of the catalogue, the headers and the mapping,
// but they're needed once per row -- and a big master file is tens of
// thousands of rows. One cached entry is enough: an import works through a
// single file at a time, and a changed mapping simply misses and recomputes.
let cachedKeys: { signature: string; keys: Map<string, string> } | null = null

export function attributeKeysFor(
  catalogue: CatalogueKey,
  headers: string[],
  mapping: FieldMapping
): Map<string, string> {
  const signature = `${catalogue}\u0000${headers.join('\u0001')}\u0000${JSON.stringify(mapping)}`
  if (cachedKeys?.signature === signature) return cachedKeys.keys
  const keys = attributeKeys(catalogue, extraHeaders(headers, mapping))
  cachedKeys = { signature, keys }
  return keys
}

/** The extra cells of one row, keyed for storage. Blanks are left out. */
export function rowAttributes(
  raw: Record<string, string>,
  keys: Map<string, string>
): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const [header, key] of keys) {
    const value = raw[header]?.trim()
    if (value) attributes[key] = value
  }
  return attributes
}

/* ------------------------------------------------------------- persistence --- */

export async function fetchCatalogueColumns(catalogue: CatalogueKey): Promise<CatalogueColumn[]> {
  const { data } = await supabase
    .from('catalogue_columns')
    .select('*')
    .eq('catalogue', catalogue)
    .order('sort_order')
    .order('label')
  return data ?? []
}

/**
 * Records the columns an upload just introduced.
 *
 * They arrive hidden. A master file routinely runs to thirty columns, and
 * showing all of them turns the table into something nobody can read across --
 * so the file decides what is *available* and the admin decides what is shown.
 *
 * `ignoreDuplicates` is the other half of that: a re-upload must not reset
 * visibility or ordering the admin has since chosen, so a column that is
 * already known is left exactly as it is.
 */
export async function registerImportedColumns(
  catalogue: CatalogueKey,
  columns: { key: string; label: string }[]
): Promise<void> {
  if (columns.length === 0) return
  await supabase.from('catalogue_columns').upsert(
    columns.map((c, i) => ({
      catalogue,
      key: c.key,
      label: c.label,
      source: 'imported' as CatalogueColumnSource,
      visible: false,
      // Newly discovered columns sort after everything already placed, so an
      // upload never reshuffles a layout someone has arranged.
      sort_order: 1000 + i,
    })),
    { onConflict: 'catalogue,key', ignoreDuplicates: true }
  )
}

/**
 * Writes the file columns' layout in one request, so it can't half-apply.
 *
 * They start at 1000 to stay after the built-in columns, which are seeded at
 * 10..90 and are not reorderable -- so ordering here is ordering among the
 * file's own columns, which all sit to the right of the app's.
 */
export async function saveColumnLayout(columns: CatalogueColumn[]): Promise<string | null> {
  if (columns.length === 0) return null
  const { error } = await supabase.from('catalogue_columns').upsert(
    columns.map((c, i) => ({
      catalogue: c.catalogue,
      key: c.key,
      label: c.label,
      source: c.source,
      visible: c.visible,
      sort_order: 1000 + i * 10,
    })),
    { onConflict: 'catalogue,key' }
  )
  return error?.message ?? null
}

export async function deleteImportedColumn(catalogue: CatalogueKey, key: string): Promise<string | null> {
  const { error } = await supabase
    .from('catalogue_columns')
    .delete()
    .eq('catalogue', catalogue)
    .eq('key', key)
    .eq('source', 'imported')
  return error?.message ?? null
}
