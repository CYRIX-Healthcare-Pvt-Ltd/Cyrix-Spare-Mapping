import { formatFieldValue } from './fieldFormat'
import type { EquipmentRow, FacilityRow, FieldDefinitionRow } from '../types/app'

export interface ChangeDetail {
  label: string
  value: string
}

function isPair(raw: unknown): raw is { from?: unknown; to: unknown } {
  return !!raw && typeof raw === 'object' && 'to' in raw
}

function formatCustomValue(field: FieldDefinitionRow | undefined, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field?.field_type === 'image') {
    const count = Array.isArray(value) ? value.length : 0
    return `${count} photo${count === 1 ? '' : 's'}`
  }
  return field ? formatFieldValue(field, value) : String(value)
}

function facilityName(id: unknown, facilities: FacilityRow[]): string {
  if (typeof id !== 'string' || !id) return '—'
  return facilities.find((f) => f.id === id)?.name ?? 'Unknown warehouse'
}

/**
 * Renders a diff for display, showing "from → to" whenever a prior value is
 * known, and just the new value otherwise (the original tag has nothing to
 * compare against). Handles two sources with the same underlying shape:
 *  - an equipment_history row's `changes`, which since 0009 already carries
 *    {from, to} per changed key (older rows, from before that migration,
 *    are a flat new-value-only shape and fall back to showing just `to`)
 *  - a still-pending edit_request's flat `proposed_changes`, given the
 *    equipment's current row as `current` to source "from" values live
 */
export function describeChanges(
  changes: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  facilities: FacilityRow[],
  current?: EquipmentRow
): ChangeDetail[] {
  const out: ChangeDetail[] = []

  /*
   * A replaced sticker (0064). Both codes, because the old one is the only
   * thing that connects this row to the label somebody threw away — a
   * timeline showing only the new code cannot answer "what happened to
   * QR-00412".
   */
  if ('qr_value' in changes) {
    const raw = changes.qr_value
    const to = isPair(raw) ? raw.to : raw
    const from = isPair(raw) ? raw.from : current?.qr_value
    out.push({
      label: 'QR code',
      value: from && from !== to ? `${String(from)} → ${String(to)}` : String(to ?? '—'),
    })
  }

  // Why a spare was retired, when whoever asked for it said.
  if (typeof changes.reason === 'string' && changes.reason.trim()) {
    out.push({ label: 'Reason', value: changes.reason.trim() })
  }

  /*
   * Which Cyrix item this unit was decided to be.
   *
   * The single most asked question of this history, and it was the one
   * thing not rendered: the row carried it, nothing looked for it, so an
   * approved mapping showed as "Edited" with an empty body.
   *
   * Code and name are stored as two keys and shown as one line -- they
   * are one fact, and "I-108619 → not set" over "Micro Controller → not
   * set" is the same sentence twice. The name is only decoration on the
   * code, so the code decides whether anything is shown at all.
   */
  if ('cyrix_item_code' in changes) {
    const rawCode = changes.cyrix_item_code
    const rawName = changes.cyrix_item_name
    const toCode = isPair(rawCode) ? rawCode.to : rawCode
    const fromCode = isPair(rawCode) ? rawCode.from : current?.cyrix_item_code
    const toName = isPair(rawName) ? rawName.to : rawName
    const fromName = isPair(rawName) ? rawName.from : current?.cyrix_item_name

    // "not set" rather than an em dash: unlinking is a decision somebody
    // made, and a dash reads as a value that failed to load.
    const show = (code: unknown, name: unknown) =>
      !code ? 'not set' : name ? `${String(code)} · ${String(name)}` : String(code)

    const to = show(toCode, toName)
    const from = fromCode ? show(fromCode, fromName) : null
    out.push({ label: 'Cyrix item', value: from && from !== to ? `${from} → ${to}` : to })
  }

  if ('facility_id' in changes) {
    const raw = changes.facility_id
    const toId = isPair(raw) ? raw.to : raw
    const fromId = isPair(raw) ? raw.from : current?.facility_id
    const to = facilityName(toId, facilities)
    const from = fromId ? facilityName(fromId, facilities) : null
    out.push({ label: 'Warehouse', value: from && from !== to ? `${from} → ${to}` : to })
  }

  const customFields = changes.custom_fields
  if (customFields && typeof customFields === 'object') {
    for (const [key, raw] of Object.entries(customFields as Record<string, unknown>)) {
      const field = fieldDefs.find((f) => f.field_key === key)
      const toVal = isPair(raw) ? raw.to : raw
      const fromVal = isPair(raw) ? raw.from : current?.custom_fields[key]

      const to = formatCustomValue(field, toVal)
      const from = fromVal !== undefined ? formatCustomValue(field, fromVal) : null
      out.push({ label: field?.label ?? key, value: from && from !== to && from !== '—' ? `${from} → ${to}` : to })
    }
  }

  return out
}
