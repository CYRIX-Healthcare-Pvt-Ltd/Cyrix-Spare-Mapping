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
