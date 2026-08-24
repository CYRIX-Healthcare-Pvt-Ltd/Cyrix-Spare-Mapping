import { useState } from 'react'
import type { FormEvent } from 'react'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'
import { FacilityPicker } from './FacilityPicker'
import { SpinnerIcon, CheckIcon } from './icons'
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
    <fieldset disabled={disabled} className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FacilityPicker
          facilities={facilities}
          value={values.facility_id}
          onChange={(facility_id) => setValues((v) => ({ ...v, facility_id }))}
          onCreateFacility={onCreateFacility}
        />

        {fieldDefs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
            No custom fields set up yet — an admin can add some in Admin → Custom fields.
          </p>
        ) : (
          <>
            {autofilled.length > 0 && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">
                <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                Filled in {autofilled.length} field{autofilled.length === 1 ? '' : 's'} from the scanned item — edit any of
                them if they're not right.
              </p>
            )}
            <DynamicFieldRenderer
              fields={fieldDefs}
              values={values.custom_fields}
              suggestions={suggestions}
              onChange={handleFieldChange}
              onItemResolved={handleItemResolved}
            />
          </>
        )}

        <button
          type="submit"
          disabled={submitting || disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-650 disabled:opacity-60"
        >
          {submitting && <SpinnerIcon className="h-4 w-4" />}
          {submitLabel}
        </button>
      </form>
    </fieldset>
  )
}
