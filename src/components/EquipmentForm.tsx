import { useState } from 'react'
import type { FormEvent } from 'react'
import { ImageUploader } from './ImageUploader'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'
import { SpinnerIcon } from './icons'
import type { EquipmentFormValues, FacilityRow, FieldDefinitionRow } from '../types/app'

export function EquipmentForm({
  facilities,
  fieldDefs,
  initialValues,
  submitLabel,
  submitting,
  disabled,
  onSubmit,
}: {
  facilities: FacilityRow[]
  fieldDefs: FieldDefinitionRow[]
  initialValues: EquipmentFormValues
  submitLabel: string
  submitting: boolean
  disabled?: boolean
  onSubmit: (values: EquipmentFormValues) => void
}) {
  const [values, setValues] = useState<EquipmentFormValues>(initialValues)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(values)
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-500'

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Facility *</label>
          <select
            required
            value={values.facility_id}
            onChange={(e) => setValues((v) => ({ ...v, facility_id: e.target.value }))}
            className={inputClass}
          >
            <option value="" disabled>
              Select a facility…
            </option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Equipment name *</label>
          <input
            required
            type="text"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className={inputClass}
            placeholder="e.g. Infusion Pump"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Location *</label>
          <input
            required
            type="text"
            value={values.location}
            onChange={(e) => setValues((v) => ({ ...v, location: e.target.value }))}
            className={inputClass}
            placeholder="e.g. 3rd Floor, ICU Bay 2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Photos</label>
          <ImageUploader value={values.images} onChange={(images) => setValues((v) => ({ ...v, images }))} />
        </div>

        <DynamicFieldRenderer
          fields={fieldDefs}
          values={values.custom_fields}
          onChange={(key, val) =>
            setValues((v) => ({ ...v, custom_fields: { ...v.custom_fields, [key]: val } }))
          }
        />

        <button
          type="submit"
          disabled={submitting || disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {submitting && <SpinnerIcon className="h-4 w-4" />}
          {submitLabel}
        </button>
      </form>
    </fieldset>
  )
}
