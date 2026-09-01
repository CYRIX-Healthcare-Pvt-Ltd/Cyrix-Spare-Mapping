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
 * Whether the admin may reorder or remove this column.
 *
 * Only the file's own columns. A built-in column has a fixed place -- it is
 * seeded at a known sort order and read from a real database column rather
 * than from `attributes`, so there is nothing to remove it *from*.
 */
export function isChoosable(column: { source: CatalogueColumnSource }): boolean {
  return column.source === 'imported'
}

/**
 * Whether the admin may hide this column.
 *
 * Every column but the identity. 0028 pinned all six built-in columns on the
 * reasoning that they are what the catalogue is; that holds for the item
 * code, which is how a row is recognised, selected and deleted, and holds
 * much less well for the rest. A warehouse that doesn't work in quantities
 * was still made to look at a Qty column forever. So the code stays and the
 * rest is the admin's call -- the same line migration 0033 draws in the
 * database.
 */
export function isHideable(column: { key: string }): boolean {
  return column.key !== 'item_code'
}

/**
 * Columns that report tagging progress rather than describe the part.
 *
 * They are computed from the tags, not read from any file, which is why
 * they can't fill in a form field: "2 of 4 tagged" is a fact about the
 * catalogue's state, not about the spare in the engineer's hand.
 */
const COMPUTED_KEYS = new Set(['cyrix_item', 'tagged', 'status'])

/** A client item master column a custom field can be autofilled from. */
export interface AutofillSource {
  key: string
  label: string
  /**
   * Whether this column is shown in the item master table. Carried along
   * because it is also the best available answer to "should the tag form
   * start out asking for this?" -- a file with thirty columns has already
   * been triaged once, and repeating that triage from scratch on the form
   * would be asking the same question twice.
   */
  visible: boolean
}

/**
 * What a custom field can name as its source, in the table's own order.
 *
 * The client's catalogue as it actually stands: the code, the name, the
 * quantity, and every column their uploaded file turned out to carry. That
 * last part is the point -- "Item Group(Material Group)", "HSN/SAC Code" and
 * "Tax Rate" only exist because a file had them, so the list has to be read
 * back from the file rather than written down here.
 *
 * Hidden columns are listed too. Whether a column belongs in the item master
 * table and whether a form field should be filled from it are two different
 * questions, and an admin who hides Tax Rate from a crowded table has not
 * said anything about the tag form.
 */
export async function fetchAutofillSources(): Promise<AutofillSource[]> {
  const columns = await fetchCatalogueColumns('bluestar')
  const rows: AutofillSource[] =
    columns.length > 0
      ? columns.map((c) => ({ key: c.key, label: c.label, visible: c.visible }))
      : CORE_COLUMNS.bluestar.map((c) => ({ key: c.key, label: c.label, visible: true }))
  return rows.filter((c) => !COMPUTED_KEYS.has(c.key))
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

/**
 * The headers the client's own export actually carries, in its own order.
 *
 * Only two of them are columns this app keeps: the code and the name. The
 * other four ride along in `attributes`, the same as any column a file
 * turns out to have — which is exactly why they are named here. A column
 * discovered during an import arrives hidden, on the assumption that a
 * master file has thirty of them and nobody wants thirty columns in a
 * table. These four are not extras found in the file, they *are* the
 * file, so they are shown as soon as they land rather than waiting to be
 * hunted down in the column chooser.
 *
 * Their spelling is the client's, punctuation and all. normalizeKey takes
 * care of the rest: "Item Group(Material Group)" and "ITEM GROUP
 * (MATERIAL GROUP)" reduce to the same key, so a revision of the file
 * that tidies its own headers does not start a second column.
 */
export const CLIENT_SHEET_HEADERS = [
  'Item Code',
  'Item Name',
  'Item Group(Material Group)',
  'Item Group -Description',
  'HSN/SAC Code',
  'Tax Rate',
]

/** One row of it, so the template shows the shape each column comes in. */
export const CLIENT_SHEET_SAMPLE = [
  '1E-006015-50001',
  'BRAVO HANDHELD NETWORK ANALYSER',
  '1EMED001',
  'DIAGNOSTIC IMAGING',
  '90181300',
  '5',
]

/**
 * The ones that become attribute columns — everything above except the
 * code and the name, which have real columns of their own.
 */
export const CLIENT_SHEET_ATTRIBUTE_KEYS = new Set(
  CLIENT_SHEET_HEADERS.map(normalizeKey).filter((k) => k !== 'item_code' && k !== 'item_name')
)

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
 *
 * A caller can ask for a column to arrive shown instead — used for the
 * columns the client's file is known to carry, which are the file rather
 * than surprises found inside it. Only on the first upload: after that
 * `ignoreDuplicates` keeps whatever the admin decided.
 */
export async function registerImportedColumns(
  catalogue: CatalogueKey,
  columns: { key: string; label: string; visible?: boolean }[]
): Promise<void> {
  if (columns.length === 0) return
  await supabase.from('catalogue_columns').upsert(
    columns.map((c, i) => ({
      catalogue,
      key: c.key,
      label: c.label,
      source: 'imported' as CatalogueColumnSource,
      visible: c.visible ?? false,
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
 * The file's columns start at 1000 to stay after the built-in ones, which
 * are seeded at 10..90 and are not reorderable -- so ordering here is
 * ordering among the file's own columns, which all sit to the right of the
 * app's. Built-in rows still go through this call, because their visibility
 * is now a choice too.
 */
export async function saveColumnLayout(columns: CatalogueColumn[]): Promise<string | null> {
  if (columns.length === 0) return null
  // Only the file's own columns are renumbered. A built-in column keeps the
  // sort order it was seeded with -- it can be hidden, but it can't be
  // dragged, and renumbering it here would file the app's own columns in
  // behind the file's on the first save.
  let position = 0
  const { error } = await supabase.from('catalogue_columns').upsert(
    columns.map((c) => ({
      catalogue: c.catalogue,
      key: c.key,
      label: c.label,
      source: c.source,
      visible: c.visible,
      sort_order: isChoosable(c) ? 1000 + position++ * 10 : c.sort_order,
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
