import { useState } from 'react'
import type { FormEvent } from 'react'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'
import { FacilityPicker } from './FacilityPicker'
import { SpinnerIcon } from './icons'
import { buildAutofill, type ResolvedItem } from '../lib/itemAutofill'
import type { EquipmentFormValues, FacilityRow, FieldDefinitionRow } from '../types/app'

export function EquipmentForm({
  facilities,
  fieldDefs,
  initialValues,
  submitLabel,
  submitting,
  disabled,
  suggestions,
  onSubmit,
  onCreateFacility,
}: {
  facilities: FacilityRow[]
  fieldDefs: FieldDefinitionRow[]
  initialValues: EquipmentFormValues
  submitLabel: string
  submitting: boolean
  disabled?: boolean
  suggestions?: Record<string, string[]>
  onSubmit: (values: EquipmentFormValues) => void
  onCreateFacility?: (input: { name: string; district: string | null; city: string | null }) => Promise<FacilityRow>
}) {
  const [values, setValues] = useState<EquipmentFormValues>(initialValues)
  const [autofilled, setAutofilled] = useState<string[]>([])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(values)
  }

  // A resolved barcode fills in whatever it can. Only empty fields are
  // touched, so anything already typed survives, and every field stays
  // editable afterwards -- the barcode is optional and may not resolve.
  function handleItemResolved(item: ResolvedItem) {
    setValues((v) => {
      const patch = buildAutofill(fieldDefs, v.custom_fields, item)
      const keys = Object.keys(patch)
      if (keys.length === 0) return v
      setAutofilled((prev) => [...new Set([...prev, ...keys])])
      return { ...v, custom_fields: { ...v.custom_fields, ...patch } }
    })
  }

  function handleFieldChange(key: string, val: unknown) {
    // Once the engineer edits a field themselves it's no longer "autofilled".
    setAutofilled((prev) => prev.filter((k) => k !== key))
    setValues((v) => ({ ...v, custom_fields: { ...v.custom_fields, [key]: val } }))
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* One grid for the warehouse picker and every custom field, so short
            controls pair up two-across once there's room. Stays a single
            column below `lg`, where two inputs side by side would be cramped. */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
          <FacilityPicker
            facilities={facilities}
            value={values.facility_id}
            onChange={(facility_id) => setValues((v) => ({ ...v, facility_id }))}
            onCreateFacility={onCreateFacility}
          />

          {fieldDefs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 lg:col-span-2">
              No custom fields set up yet — an admin can add some in Admin → Custom fields.
            </p>
          ) : (
            <DynamicFieldRenderer
              fields={fieldDefs}
              values={values.custom_fields}
              suggestions={suggestions}
              autofilled={autofilled}
              cyrixSelection={
                values.cyrix_item_code
                  ? { code: values.cyrix_item_code, name: values.cyrix_item_name ?? values.cyrix_item_code }
                  : null
              }
              onCyrixSelectionChange={(selection) =>
                setValues((v) => ({
                  ...v,
                  cyrix_item_code: selection?.code ?? null,
                  cyrix_item_name: selection?.name ?? null,
                }))
              }
              onChange={handleFieldChange}
              onItemResolved={handleItemResolved}
            />
          )}
        </div>

        {/* Full-width thumb target on a phone; on a desktop a full-width
            primary button across a wide form reads as a banner, so it sits
            right-aligned at its natural size instead. */}
        <div className="flex pt-1 sm:justify-end">
          <button
            type="submit"
            disabled={submitting || disabled}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-650 disabled:opacity-60 sm:w-auto sm:px-8"
          >
            {submitting && <SpinnerIcon className="h-4 w-4" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </fieldset>
  )
}
