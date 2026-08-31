import type { FieldDefinitionRow } from '../types/app'
import { FormRow } from './FormRow'
import { isNameField, type ResolvedItem } from '../lib/itemAutofill'
import { ImageUploader } from './ImageUploader'
import { BarcodeItemInput } from './BarcodeItemInput'
import { CyrixMappingPanel, type CyrixSelection } from './CyrixMappingPanel'

export function DynamicFieldRenderer({
  fields,
  values,
  suggestions,
  autofilled,
  cyrixSelection,
  onCyrixSelectionChange,
  onChange,
  onItemResolved,
}: {
  fields: FieldDefinitionRow[]
  values: Record<string, unknown>
  suggestions?: Record<string, string[]>
  /** Keys of fields filled from the client item master, marked so the tagger can see what to check. */
  autofilled?: string[]
  cyrixSelection: CyrixSelection | null
  onCyrixSelectionChange: (selection: CyrixSelection | null) => void
  onChange: (key: string, value: unknown) => void
  onItemResolved?: (item: ResolvedItem) => void
}) {
  if (fields.length === 0) return null

  // The mapping panel is rendered under the name field, since choosing a Cyrix
  // item is really deciding what this spare is called. It needs both the name
  // (which drives matching) and the Blue Star code field (an accelerator when
  // one was scanned), wherever those sit in the admin-defined field order.
  const barcodeField = fields.find((f) => f.field_type === 'barcode')
  const blueStarCode = barcodeField ? ((values[barcodeField.field_key] as string) ?? '') : ''
  const panelAfter = fields.find(isNameField)
  const spareName = panelAfter ? ((values[panelAfter.field_key] as string) ?? '') : ''

  const panel = (
    <CyrixMappingPanel
      blueStarCode={blueStarCode}
      spareName={spareName}
      selection={cyrixSelection}
      onSelectionChange={onCyrixSelectionChange}
      onResolve={onItemResolved}
    />
  )

  // Rendered as a fragment, not a wrapper: these rows are cells in the form's
  // grid, so two short fields can share a row on a wide screen. A wrapper here
  // would make them one cell and force the single narrow column back.
  return (
    <>
      {fields.map((field) => (
        <FormRow
          key={field.id}
          label={field.label}
          htmlFor={field.field_type === 'image' ? undefined : `field-${field.id}`}
          required={field.required}
          // A photo dropzone, a paragraph, and whichever field carries the
          // Cyrix suggestions all need the full measure; the rest pair up.
          fullWidth={
            panelAfter?.id === field.id || field.field_type === 'image' || field.field_type === 'textarea'
          }
          // Said rather than shown as a lock: a value that came off the
          // client's file is a starting point the tagger is expected to read
          // and correct, not a fact the form is asserting. The input below
          // stays an ordinary editable one, and typing in it drops the badge.
          badge={
            autofilled?.includes(field.field_key) ? (
              <span
                title="Filled from the client item master — edit it if the spare in front of you says otherwise."
                className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
              >
                From client master · editable
              </span>
            ) : undefined
          }
        >
          <FieldInput
            id={`field-${field.id}`}
            field={field}
            value={values[field.field_key]}
            suggestions={suggestions?.[field.field_key]}
            onChange={(v) => onChange(field.field_key, v)}
          />
          {panelAfter?.id === field.id && panel}
        </FormRow>
      ))}

      {/* No name-shaped field to sit under -- fall back to the end of the form
          rather than dropping the mapping UI entirely. */}
      {!panelAfter && <div className="lg:col-span-2">{panel}</div>}
    </>
  )
}

function FieldInput({
  id,
  field,
  value,
  suggestions,
  onChange,
}: {
  id: string
  field: FieldDefinitionRow
  value: unknown
  suggestions?: string[]
  onChange: (value: unknown) => void
}) {
  const baseClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  switch (field.field_type) {
    case 'barcode':
      return <BarcodeItemInput id={id} value={value} onChange={onChange} required={field.required} baseClass={baseClass} />
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
          id={id}
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
          id={id}
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
          id={id}
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
            id={id}
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
          id={id}
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
            id={id}
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
