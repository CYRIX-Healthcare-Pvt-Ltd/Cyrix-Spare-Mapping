import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { client } from '../lib/branding'
import { EquipmentForm } from '../components/EquipmentForm'
import { fetchFieldSuggestions } from '../lib/fieldSuggestions'
import { blueStarCodeFromForm, lookupBlueStarItem } from '../lib/blueStarItem'
import { ChevronLeftIcon, AlertIcon } from '../components/icons'
import type { FieldDefinitionRow, EquipmentFormValues } from '../types/app'

export default function EquipmentNew() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qr = searchParams.get('qr')

  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    // Warehouses are no longer loaded: the form does not ask for one, so
    // fetching every active site and scoping it to this person's grants
    // was two round trips answering a question nobody is put any more.
    async function load() {
      const [{ data: fields }, fieldSuggestions] = await Promise.all([
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
        fetchFieldSuggestions(),
      ])
      setFieldDefs(fields ?? [])
      setSuggestions(fieldSuggestions)
      setLoading(false)
    }
    load()
  }, [profile])

  async function handleSubmit(values: EquipmentFormValues) {
    if (!qr || !profile) return
    setSubmitting(true)
    setError(null)

    // Something for the record to be known by in a list. It used to lead
    // with the warehouse, which the form no longer asks for; the QR is
    // what identifies the unit anyway, and the item name lands in
    // custom_fields where the tagged list reads it from.
    const autoName = qr

    // The catalogue is Blue Star's reference data: this points the tag at an
    // item that is already in it, and never adds one. A code that matches
    // nothing leaves the spare unlinked, which is the truth and is worth
    // saying -- an unlinked tag counts towards no item's progress.
    //
    // Resolved before the insert, and written as part of it, because an
    // engineer may create an equipment row but never update one: edits go
    // through the approval flow instead. Setting the link in a second
    // statement meant RLS quietly dropped it for every tag an engineer made
    // -- and engineers are the ones doing the tagging.
    const code = blueStarCodeFromForm(fieldDefs, values.custom_fields)
    const blueStarItem = code ? await lookupBlueStarItem(code) : null

    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        qr_value: qr,
        // No facility_id: the form does not ask for a warehouse, and 0073
        // made the column nullable so a spare need not be filed at one.
        name: autoName,
        location: '',
        custom_fields: values.custom_fields,
        bluestar_item_id: blueStarItem?.id ?? null,
        // The Cyrix choice belongs to this unit, so it is written with it.
        cyrix_item_code: values.cyrix_item_code ?? null,
        cyrix_item_name: values.cyrix_item_name,
        created_by: profile.id,
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (insertError || !data) {
      setError(
        insertError?.code === '23505'
          ? 'This QR code is already mapped to a spare.'
          : `Could not save: ${insertError?.message ?? 'unknown error'}`
      )
      return
    }

    await supabase.from('equipment_history').insert({
      equipment_id: data.id,
      action: 'created',
      changes: { custom_fields: values.custom_fields },
      performed_by: profile.id,
    })


    navigate('/scan', {
      replace: true,
      state: {
        toast: blueStarItem
          ? 'Spare added'
          : code
            ? `Spare added — ${code} isn't in the ${client} item master`
            : `Spare added — no ${client} code`,
      },
    })
  }

  // Creating a warehouse from inside the tag form went with the picker
  // that offered it. It existed because an engineer standing somewhere
  // unlisted could not otherwise save at all; nothing blocks them now,
  // and adding a warehouse is an admin's job on the Spare setup screen.

  if (!qr) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <AlertIcon className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <p className="mb-4 text-slate-600">Scan a QR code first to tag a new spare.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Go to scan
        </Link>
      </div>
    )
  }

  if (loading) return null

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-3xl sm:px-6 lg:max-w-4xl lg:py-8">
      <Link to="/scan" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-slate-900 lg:text-xl">Tag new spare</h1>
      <p className="mb-5 text-sm text-slate-500">
        Cyrix code: <span className="tabular-nums">{qr}</span>
      </p>

      {/* Card framing only from `sm` up: on a phone the form already fills the
          screen, and a border round it would just be a line inside a line. */}
      <div className="sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-surface sm:p-6 sm:shadow-sm lg:p-8">
        <EquipmentForm
          fieldDefs={fieldDefs}
          initialValues={{
            custom_fields: {},
            cyrix_item_code: undefined,
            cyrix_item_name: null,
          }}
          submitLabel="Save spare"
          submitting={submitting}
          suggestions={suggestions}
          onSubmit={handleSubmit}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
    </div>
  )
}
