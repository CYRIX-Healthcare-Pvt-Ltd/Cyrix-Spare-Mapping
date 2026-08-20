import type { FieldDefinitionRow } from '../types/app'

export function formatFieldValue(field: FieldDefinitionRow, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field.field_type === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
