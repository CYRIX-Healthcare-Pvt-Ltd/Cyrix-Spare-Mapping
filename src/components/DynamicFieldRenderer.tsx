import { useState } from 'react'
import type { FieldDefinitionRow } from '../types/app'
import { ImageUploader } from './ImageUploader'
import { QRScanner } from './QRScanner'
import { ScanIcon, XIcon } from './icons'

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
      return <BarcodeInput value={value} onChange={onChange} required={field.required} baseClass={baseClass} />
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

// For a value that's itself scanned off a barcode/QR already stuck on the
// equipment (e.g. a manufacturer serial number) -- distinct from the QR the
// app uses to identify the record. Always has a manual-entry fallback in
// case the sticker is worn, dirty, or otherwise won't scan.
function BarcodeInput({
  value,
  onChange,
  required,
  baseClass,
}: {
  value: unknown
  onChange: (value: unknown) => void
  required?: boolean
  baseClass: string
}) {
  const [scanning, setScanning] = useState(false)

  return (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          className={`${baseClass} flex-1`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-label="Scan barcode"
        >
          <ScanIcon className="h-4 w-4" />
        </button>
      </div>

      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm font-medium text-white">Scan barcode</p>
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="rounded-lg p-1.5 text-white hover:bg-white/10"
              aria-label="Close scanner"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 items-center">
            <QRScanner
              onDecode={(text) => {
                onChange(text)
                setScanning(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
