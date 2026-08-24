import type { FieldDefinitionRow } from '../types/app'
import { ImageUploader } from './ImageUploader'
import { BarcodeItemInput } from './BarcodeItemInput'

export function DynamicFieldRenderer({
  fields,
  values,
  suggestions,
  onChange,
}: {
  fields: FieldDefinitionRow[]
  values: Record<string, unknown>
  suggestions?: Record<string, string[]>
  onChange: (key: string, value: unknown) => void
}) {
  if (fields.length === 0) return null

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.id}>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
          <FieldInput
            field={field}
            value={values[field.field_key]}
            suggestions={suggestions?.[field.field_key]}
            onChange={(v) => onChange(field.field_key, v)}
          />
        </div>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  suggestions,
  onChange,
}: {
  field: FieldDefinitionRow
  value: unknown
  suggestions?: string[]
  onChange: (value: unknown) => void
}) {
  const baseClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  switch (field.field_type) {
    case 'barcode':
      return <BarcodeItemInput value={value} onChange={onChange} required={field.required} baseClass={baseClass} />
    case 'image':
      return (
        <ImageUploader
          value={(value as string[]) ?? []}
          onChange={onChange}
          max={field.image_max_count ?? 3}
        />
      )
    case 'textarea':
      return (
        <textarea
          className={baseClass}
          rows={3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          className={baseClass}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          required={field.required}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className={baseClass}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Yes
        </label>
      )
    case 'dropdown':
      return (
        <select
          className={baseClass}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="" disabled>
            Select…
          </option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    default: {
      // Text fields get suggestions drawn from values already used for this
      // same field on other equipment — e.g. once one engineer types
      // "Ventilator", the next one sees it offered instead of retyping (and
      // risking "ventilator", "Vent", etc. fragmenting what's really one
      // piece of equipment type).
      const listId = suggestions?.length ? `suggestions-${field.field_key}` : undefined
      return (
        <>
          <input
            type="text"
            list={listId}
            className={baseClass}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
          {listId && (
            <datalist id={listId}>
              {suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )
    }
  }
}
