import { useState } from 'react'
import type { FormEvent } from 'react'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'
import { SpinnerIcon } from './icons'
import { buildAutofill, type ResolvedItem } from '../lib/itemAutofill'
import type { EquipmentFormValues, FieldDefinitionRow } from '../types/app'

/**
 * No warehouse picker.
 *
 * It used to lead this form and was the only question on it that could
 * not be turned off, because equipment.facility_id was NOT NULL. What
 * identifies a spare is the code on it -- the client's item code says
 * what the part is, the Cyrix QR says which unit this one is -- and
 * neither needs a site chosen first. Migration 0073 made the column
 * nullable; what is asked for here is now entirely the admin's to decide
 * on the custom fields screen.
 *
 * `facility_id` is still carried through form values, so a spare filed
 * against a warehouse before today keeps it through an edit rather than
 * being quietly unfiled by a form that stopped mentioning it.
 */
export function EquipmentForm({
  fieldDefs,
  initialValues,
  submitLabel,
  submitting,
  disabled,
  suggestions,
  onSubmit,
}: {
  fieldDefs: FieldDefinitionRow[]
  initialValues: EquipmentFormValues
  submitLabel: string
  submitting: boolean
  disabled?: boolean
  suggestions?: Record<string, string[]>
  onSubmit: (values: EquipmentFormValues) => void
}) {
  // The values and which of them a scan supplied are one piece of state, not
  // two. Deciding what a newly resolved item may overwrite needs both at
  // once, and splitting them would mean reading one while setting the other.
  const [state, setState] = useState<{ values: EquipmentFormValues; autofilled: string[] }>({
    values: initialValues,
    autofilled: [],
  })
  const { values, autofilled } = state

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(values)
  }

  // A resolved item fills in whatever it can, and every field it fills stays
  // an ordinary editable input afterwards -- the file is a starting point,
  // not an answer. Scanning a second code refills its own values and clears
  // the ones the new item has nothing for, so the form never ends up showing
  // half of one spare and half of another. Anything the tagger typed
  // themselves is left alone either way.
  function handleItemResolved(item: ResolvedItem) {
    setState((s) => {
      const { patch, cleared } = buildAutofill(fieldDefs, s.values.custom_fields, item, s.autofilled)
      if (Object.keys(patch).length === 0 && cleared.length === 0) return s

      const custom_fields = { ...s.values.custom_fields, ...patch }
      for (const key of cleared) custom_fields[key] = ''
      const kept = s.autofilled.filter((k) => !cleared.includes(k))

      return {
        values: { ...s.values, custom_fields },
        autofilled: [...new Set([...kept, ...Object.keys(patch)])],
      }
    })
  }

  function handleFieldChange(key: string, val: unknown) {
    // Once the engineer edits a field themselves it's no longer "autofilled",
    // and nothing a later scan resolves is allowed to overwrite it.
    setState((s) => ({
      values: { ...s.values, custom_fields: { ...s.values.custom_fields, [key]: val } },
      autofilled: s.autofilled.filter((k) => k !== key),
    }))
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* One grid for every custom field, so short controls pair up
            two-across once there's room. Stays a single column below `lg`,
            where two inputs side by side would be cramped. */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
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
                setState((s) => ({
                  ...s,
                  values: {
                    ...s.values,
                    cyrix_item_code: selection?.code ?? null,
                    cyrix_item_name: selection?.name ?? null,
                  },
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
