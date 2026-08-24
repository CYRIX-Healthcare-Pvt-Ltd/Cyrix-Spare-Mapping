import { supabase } from './supabaseClient'
import { isNameField } from './itemAutofill'
import type { BlueStarItemRow, FieldDefinitionRow } from '../types/app'

/**
 * Finds the Blue Star item a scanned code refers to.
 *
 * Blue Star's barcode is what's physically stuck on the spare, so that's
 * tried first; the same string is then tried as an item code, because the
 * master file and the label don't always agree on which of the two is
 * printed. Returns null when the code isn't in the catalogue yet -- that's a
 * normal case, not an error: tagging it is what puts it there.
 */
export async function lookupBlueStarItem(code: string): Promise<BlueStarItemRow | null> {
  const clean = code.trim()
  if (!clean) return null

  const { data: byBarcode } = await supabase
    .from('bluestar_item_master')
    .select('*')
    .eq('barcode', clean)
    .order('created_at')
    .limit(1)
  if (byBarcode?.[0]) return byBarcode[0]

  const { data: byCode } = await supabase
    .from('bluestar_item_master')
    .select('*')
    .eq('item_code', clean)
    .limit(1)
  return byCode?.[0] ?? null
}

/**
 * Records a tagged spare in Blue Star's catalogue and applies its Cyrix link.
 *
 * Every tagged spare is one of Blue Star's items, so tagging one has to leave
 * a row in their catalogue -- otherwise the mapping made while tagging has
 * nowhere to live and the item list never reflects the work. Goes through the
 * definer RPC (migration 0018) because engineers can't write to the catalogue
 * directly, and because the Cyrix link has to land in the mapping history.
 */
export async function upsertTaggedBlueStarItem(input: {
  itemCode: string
  itemName: string | null
  barcode: string | null
  cyrixCode: string | null
}): Promise<{ item: BlueStarItemRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('upsert_tagged_bluestar_item', {
    p_item_code: input.itemCode,
    p_item_name: input.itemName ?? '',
    p_barcode: input.barcode,
    p_cyrix_code: input.cyrixCode,
  })
  if (error) return { item: null, error: error.message }
  return { item: data as BlueStarItemRow, error: null }
}

/**
 * Works out which Blue Star item a filled-in tag form describes.
 *
 * The spare's name and Blue Star code are admin-defined custom fields, so
 * which keys hold them is inferred the same way the form infers where to put
 * the mapping panel. When no Blue Star code was scanned the Cyrix QR stuck on
 * the spare stands in as the item code -- every tagged spare has to be
 * identifiable in the catalogue, and that sticker is the one identifier that
 * always exists.
 */
export function blueStarIdentityFromForm(
  fields: FieldDefinitionRow[],
  customFields: Record<string, unknown>,
  qrValue: string
): { itemCode: string; itemName: string | null; barcode: string | null } {
  const text = (key: string | undefined) => {
    if (!key) return null
    const raw = customFields[key]
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  }

  const barcode = text(fields.find((f) => f.field_type === 'barcode')?.field_key)
  const itemName = text(fields.find(isNameField)?.field_key)

  return { itemCode: barcode ?? qrValue, itemName, barcode }
}
