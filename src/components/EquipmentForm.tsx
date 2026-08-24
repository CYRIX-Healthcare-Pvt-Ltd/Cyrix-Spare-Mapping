import { useState } from 'react'
import type { FormEvent } from 'react'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'
import { FacilityPicker } from './FacilityPicker'
import { SpinnerIcon } from './icons'
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(values)
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
          <DynamicFieldRenderer
            fields={fieldDefs}
            values={values.custom_fields}
            suggestions={suggestions}
            onChange={(key, val) =>
              setValues((v) => ({ ...v, custom_fields: { ...v.custom_fields, [key]: val } }))
            }
          />
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
