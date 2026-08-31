import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { client } from '../lib/branding'
import { EquipmentForm } from '../components/EquipmentForm'
import {
  ChevronLeftIcon, PencilIcon, ClipboardIcon, HistoryIcon, ScanIcon, TrashIcon,
} from '../components/icons'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
import { EquipmentHistoryDialog } from '../components/EquipmentHistoryDialog'
import { ImageLightbox } from '../components/ImageLightbox'
import { QRScanner } from '../components/QRScanner'
import { blueStarCodeFromForm, lookupBlueStarItem } from '../lib/blueStarItem'
import { setTagCyrixMapping } from '../lib/mapping'
import type {
  EquipmentRow,
  FacilityRow,
  FieldDefinitionRow,
  EquipmentFormValues,
} from '../types/app'
import type { RequestKind } from '../types/database'


type PerformEdit = (values: EquipmentFormValues) => Promise<void>

function toFormValues(eq: EquipmentRow): EquipmentFormValues {
  return {
    facility_id: eq.facility_id,
    custom_fields: eq.custom_fields,
    // The Cyrix item this particular unit was mapped to. Undefined rather than
    // null when there is none: nothing to unlink, nothing to change.
    cyrix_item_code: eq.cyrix_item_code ?? undefined,
    cyrix_item_name: eq.cyrix_item_name,
  }
}

function buildDiff(original: EquipmentFormValues, updated: EquipmentFormValues) {
  const diff: Record<string, unknown> = {}
  if (updated.facility_id !== original.facility_id) diff.facility_id = updated.facility_id

  const customDiff: Record<string, unknown> = {}
  for (const key of Object.keys(updated.custom_fields)) {
    if (JSON.stringify(updated.custom_fields[key]) !== JSON.stringify(original.custom_fields[key])) {
      customDiff[key] = updated.custom_fields[key]
    }
  }
  if (Object.keys(customDiff).length > 0) diff.custom_fields = customDiff

  return diff
}

// Same shape as buildDiff's output, but each changed value is wrapped as
// {from, to} instead of just the new value -- only equipment_history reads
// this enriched shape (for the "Ventilator → CT Scan" style log entries).
// edit_requests.proposed_changes must stay the flat buildDiff shape, since
// resolve_edit_request() merges it straight into equipment.custom_fields.
function buildHistoryChanges(original: EquipmentFormValues, updated: EquipmentFormValues) {
  const changes: Record<string, unknown> = {}
  if (updated.facility_id !== original.facility_id) {
    changes.facility_id = { from: original.facility_id, to: updated.facility_id }
  }

  const customChanges: Record<string, unknown> = {}
  for (const key of Object.keys(updated.custom_fields)) {
    if (JSON.stringify(updated.custom_fields[key]) !== JSON.stringify(original.custom_fields[key])) {
      customChanges[key] = { from: original.custom_fields[key] ?? null, to: updated.custom_fields[key] }
    }
  }
  if (Object.keys(customChanges).length > 0) changes.custom_fields = customChanges

  return changes
}

export default function EquipmentView() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null)
  const [facility, setFacility] = useState<FacilityRow | null>(null)
  const [taggedBy, setTaggedBy] = useState<{ full_name: string; ecode: string } | null>(null)
  const [updatedBy, setUpdatedBy] = useState<{ full_name: string; ecode: string } | null>(null)
  const [allFacilities, setAllFacilities] = useState<FacilityRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  /*
   * Replacing the code and retiring the spare live inside Edit, because
   * that is where somebody already is when they discover the sticker has
   * gone or the item has. Only one is open at a time — they are both
   * things you do to the whole record, and two open panels asking for
   * different confirmations is how the wrong one gets confirmed.
   */
  const [action, setAction] = useState<'remap' | 'delete' | null>(null)
  const [newQr, setNewQr] = useState('')
  const [scanning, setScanning] = useState(false)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // A manager applies these; everyone else proposes them.
  const canEditDirectly = profile?.role === 'project_manager' || (profile?.isSpareAdmin ?? false)

  /*
   * Deciding what a spare *is* — which Cyrix item it maps to — is a
   * narrower permission than editing it, and purchase holds that one and
   * nothing else. Separate from canEditDirectly on purpose: folding
   * purchase into it would have handed them warehouses, field edits and
   * deletions as a side effect of a naming decision. `can_approve_mapping()`
   * in the database is the same list, and is the half that actually
   * enforces it.
   */
  const canMapDirectly = canEditDirectly || profile?.role === 'purchase'

  const load = useCallback(async () => {
    if (!id || !profile) return
    setLoading(true)

    const { data: eq } = await supabase.from('equipment').select('*').eq('id', id).maybeSingle()
    if (!eq) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setEquipment(eq)

    const [
      { data: fac },
      { data: facilities },
      { data: fields },
      { data: pending },
      { data: tagger },
      { data: updater },
    ] =
      await Promise.all([
        supabase.from('facilities').select('*').eq('id', eq.facility_id).maybeSingle(),
        supabase.from('facilities').select('*').eq('active', true).order('name'),
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
        supabase
          .from('edit_requests')
          .select('id')
          .eq('equipment_id', id)
          .eq('requested_by', profile.id)
          .eq('status', 'pending')
          .limit(1),
        eq.created_by
          ? supabase.from('profiles').select('full_name, ecode').eq('id', eq.created_by).maybeSingle()
          : Promise.resolve({ data: null }),
        eq.updated_by
          ? supabase.from('profiles').select('full_name, ecode').eq('id', eq.updated_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    setFacility(fac ?? null)
    setTaggedBy(tagger ?? null)
    setUpdatedBy(updater ?? null)
    setAllFacilities(
      profile.isSpareAdmin ? (facilities ?? []) : (facilities ?? []).filter((f) => profile.facilityIds.includes(f.id))
    )
    setFieldDefs(fields ?? [])
    setHasPendingRequest((pending ?? []).length > 0)

    setLoading(false)
  }, [id, profile])

  useEffect(() => {
    load()
  }, [load])

  async function performDirectUpdate(values: EquipmentFormValues) {
    if (!equipment || !profile) return

    const historyChanges = buildHistoryChanges(toFormValues(equipment), values)

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        facility_id: values.facility_id,
        custom_fields: values.custom_fields,
        updated_by: profile.id,
      })
      .eq('id', equipment.id)

    if (!updateError && Object.keys(historyChanges).length > 0) {
      await supabase.from('equipment_history').insert({
        equipment_id: equipment.id,
        action: 'updated',
        changes: historyChanges,
        performed_by: profile.id,
      })
    }

    if (updateError) {
      setError(updateError.message)
      return
    }

    // Re-point the spare at whichever catalogue item its code now matches.
    // Never creates one: the catalogue is Blue Star's reference data, and a
    // code matching nothing means this spare is genuinely unmatched.
    const code = blueStarCodeFromForm(fieldDefs, values.custom_fields)
    const matched = code ? await lookupBlueStarItem(code) : null
    const nextItemId = matched?.id ?? null
    if (nextItemId !== equipment.bluestar_item_id) {
      const { error: linkError } = await supabase
        .from('equipment')
        .update({ bluestar_item_id: nextItemId })
        .eq('id', equipment.id)
      // Said rather than swallowed. A tag that silently fails to re-point is
      // invisible: it keeps showing under Tagged while counting towards the
      // wrong item's progress, or towards none at all.
      if (linkError) {
        setError(`Saved, but the ${client} item could not be re-linked: ${linkError.message}`)
        await load()
        return
      }
    }

    // The mapping belongs to this unit, and goes through the RPC so the
    // change is recorded against it by name.
    if (values.cyrix_item_code !== undefined && values.cyrix_item_code !== equipment.cyrix_item_code) {
      const { error: mapError } = await setTagCyrixMapping(equipment.id, values.cyrix_item_code)
      if (mapError) {
        setError(mapError)
        await load()
        return
      }
    }

    setEditing(false)
    await load()
  }

  async function performRequestEdit(values: EquipmentFormValues) {
    if (!equipment || !profile) return

    /*
     * The Cyrix item used to be applied here and now, on the grounds that
     * a mapping is always allowed and audited rather than gated. It is
     * the one field on a tag that decides what the part costs and what it
     * is ordered against, and it was the only field with no second pair of
     * eyes on it — so it goes to the queue too, cleared by a manager,
     * purchase or an admin.
     *
     * Purchase and above still apply it at once: deciding what a spare is
     * is the job, and asking somebody to approve their own decision is
     * not a control.
     */
    const desiredCyrix = values.cyrix_item_code
    const mappingChanged =
      desiredCyrix !== undefined && desiredCyrix !== equipment.cyrix_item_code

    if (mappingChanged && canMapDirectly) {
      const { error: mapError } = await setTagCyrixMapping(equipment.id, desiredCyrix!)
      if (mapError) {
        setError(mapError)
        return
      }
    }

    const diff = buildDiff(toFormValues(equipment), values)

    // Two requests, not one with both in it: they are cleared by
    // different people. A manager can approve a warehouse correction
    // without being asked to rule on what the part is, and purchase can
    // rule on the part without inheriting the rest.
    const pending: Array<{
      equipment_id: string
      requested_by: string
      kind: RequestKind
      proposed_changes: Record<string, unknown>
    }> = []
    const asks = { equipment_id: equipment.id, requested_by: profile.id }

    if (Object.keys(diff).length > 0) {
      pending.push({ ...asks, kind: 'edit', proposed_changes: diff })
    }
    if (mappingChanged && !canMapDirectly) {
      pending.push({
        ...asks,
        kind: 'mapping',
        proposed_changes: {
          cyrix_item_code: desiredCyrix ?? null,
          cyrix_item_name: values.cyrix_item_name ?? null,
        },
      })
    }

    if (pending.length === 0) {
      setEditing(false)
      await load()
      return
    }

    const { error: insertError } = await supabase.from('edit_requests').insert(pending)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setEditing(false)
    setHasPendingRequest(true)
    await load()
  }

  async function submit(values: EquipmentFormValues, perform: PerformEdit) {
    setSubmitting(true)
    setError(null)
    await perform(values)
    setSubmitting(false)
  }

  /**
   * Replace the sticker, keep the spare.
   *
   * A QR gets torn off or rubbed out, and a new one goes on. The unit has
   * not changed — same item, same fields, same history — so this moves
   * `qr_value` on the row that already exists rather than tagging a second
   * record for one physical thing and orphaning the first. The old code
   * goes into the history entry, which is the only way to recognise this
   * afterwards as the spare that used to carry it.
   */
  /**
   * A scanned code, checked before it is accepted into the field.
   *
   * Told here rather than on submit because the sticker is in front of
   * you at this moment: hearing "that one is already on another spare"
   * now means reaching for a different sticker, and hearing it two taps
   * later means going back to find one.
   */
  async function handleScan(text: string) {
    setScanning(false)
    setActionError(null)
    if (!equipment) return

    if (text === equipment.qr_value) {
      setActionError('That is the sticker already on this spare.')
      return
    }
    const { data: clash } = await supabase
      .from('equipment')
      .select('id, name')
      .eq('qr_value', text)
      .maybeSingle()
    if (clash) {
      setActionError(`That code is already on another spare (${clash.name}).`)
      return
    }
    setNewQr(text)
  }

  async function submitRemap() {
    if (!equipment || !profile) return
    const next = newQr.trim()
    if (!next) { setActionError('Scan the new sticker first.'); return }
    if (next === equipment.qr_value) { setActionError('That is already this spare\'s code.'); return }

    setSubmitting(true)
    setActionError(null)

    // Checked here for a sentence somebody can act on. The database has the
    // last word either way -- qr_value is unique across every row.
    const { data: clash } = await supabase
      .from('equipment')
      .select('id')
      .eq('qr_value', next)
      .maybeSingle()
    if (clash && clash.id !== equipment.id) {
      setActionError('That code is already on another spare.')
      setSubmitting(false)
      return
    }

    if (canEditDirectly) {
      const { error: e } = await supabase
        .from('equipment')
        .update({ qr_value: next, updated_by: profile.id })
        .eq('id', equipment.id)
      if (e) { setActionError(e.message); setSubmitting(false); return }
      await supabase.from('equipment_history').insert({
        equipment_id: equipment.id,
        action: 'remapped',
        changes: { qr_value: { from: equipment.qr_value, to: next } },
        performed_by: profile.id,
      })
      setAction(null)
      setNewQr('')
      await load()
    } else {
      const { error: e } = await supabase.from('edit_requests').insert({
        equipment_id: equipment.id,
        requested_by: profile.id,
        kind: 'remap',
        proposed_changes: { qr_value: next },
      })
      if (e) { setActionError(e.message); setSubmitting(false); return }
      setAction(null)
      setNewQr('')
      setHasPendingRequest(true)
      setEditing(false)
    }
    setSubmitting(false)
  }

  /**
   * Retire the spare.
   *
   * Never a row deletion: `equipment_history` and `edit_requests` both
   * cascade from `equipment`, so removing it would take the spare's whole
   * history and the approval that authorised the removal along with it.
   * The row stays, marked, and leaves every list.
   */
  async function submitDelete() {
    if (!equipment || !profile) return
    setSubmitting(true)
    setActionError(null)

    if (canEditDirectly) {
      const { error: e } = await supabase
        .from('equipment')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id,
          updated_by: profile.id,
        })
        .eq('id', equipment.id)
      if (e) { setActionError(e.message); setSubmitting(false); return }
      await supabase.from('equipment_history').insert({
        equipment_id: equipment.id,
        action: 'deleted',
        changes: reason.trim() ? { reason: reason.trim() } : {},
        performed_by: profile.id,
      })
      setSubmitting(false)
      navigate('/tagged')
      return
    }

    const { error: e } = await supabase.from('edit_requests').insert({
      equipment_id: equipment.id,
      requested_by: profile.id,
      kind: 'delete',
      proposed_changes: reason.trim() ? { reason: reason.trim() } : {},
    })
    if (e) { setActionError(e.message); setSubmitting(false); return }
    setAction(null)
    setReason('')
    setHasPendingRequest(true)
    setEditing(false)
    setSubmitting(false)
  }

  if (loading) return null

  if (notFound || !equipment || !profile) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center text-slate-600">
        <p className="mb-4">Spare not found, or you don't have access to it.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Back to scan
        </Link>
      </div>
    )
  }

  // Seconds are shown only when two entries would otherwise look identical.
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-3xl sm:px-6 lg:max-w-4xl lg:py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {editing ? (
        <>
          <h1 className="mb-4 text-lg font-semibold text-slate-900 lg:text-xl">
            {canEditDirectly ? 'Edit spare' : 'Request an edit'}
          </h1>
          <div className="sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-surface sm:p-6 sm:shadow-sm lg:p-8">
            <EquipmentForm
              facilities={allFacilities}
              fieldDefs={fieldDefs}
              initialValues={toFormValues(equipment)}
              submitLabel={canEditDirectly ? 'Save changes' : 'Submit request'}
              submitting={submitting}
              onSubmit={(values) => submit(values, canEditDirectly ? performDirectUpdate : performRequestEdit)}
            />
          </div>
          {!canEditDirectly && (
            <p className="mt-2 text-xs text-slate-500">
              {canMapDirectly
                ? 'Changes to the spare’s fields go to a manager for approval. The Cyrix item is yours to decide and is applied straight away.'
                : 'Changes go for approval — the spare’s fields to a manager, and the Cyrix item to a manager or purchase. Both are recorded against your name.'}
            </p>
          )}

          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/*
            The two things that change the record rather than its fields.
            Set apart by a rule and named for what they are, because a
            button that retires an asset should not sit in the same run as
            the ones that correct a typo.
          */}
          <div className="mt-8 border-t border-slate-200 pt-5">
            <h2 className="text-sm font-semibold text-slate-900">This spare</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {canEditDirectly
                ? 'Applied straight away, and recorded in the history.'
                : 'Both go to your manager for approval.'}
            </p>

            {action === null && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setAction('remap'); setActionError(null) }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ScanIcon className="h-4 w-4 text-purple-600" />
                  Replace QR code
                </button>
                <button
                  type="button"
                  onClick={() => { setAction('delete'); setActionError(null) }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete this spare
                </button>
              </div>
            )}

            {action === 'remap' && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-surface-muted p-4">
                <p className="text-sm font-medium text-slate-900">Replace the QR code</p>
                {/* Says what survives, because that is the whole question
                    somebody has before doing this to a tagged asset. */}
                <p className="mt-1 text-xs text-slate-500">
                  For a sticker that has torn or worn off. The spare keeps its item,
                  its fields and its history — only the code changes, and the old one
                  stays in the history.
                </p>
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  Current code
                  <p className="mt-1 font-mono text-sm text-slate-500">{equipment.qr_value}</p>
                </label>
                {/*
                  Scanned, never typed. A code is a random string off a
                  printed sticker — `kobiybaamb` — so a text field invites
                  a transcription error that silently points the spare at
                  nothing, or worse, at something else.
                */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-600">New code</p>
                  {newQr ? (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="min-w-0 break-all font-mono text-sm text-emerald-900">{newQr}</span>
                      <button
                        type="button"
                        onClick={() => { setNewQr(''); setScanning(true); setActionError(null) }}
                        className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Scan again
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setScanning(true); setActionError(null) }}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-3 text-sm font-medium text-purple-700"
                    >
                      <ScanIcon className="h-4 w-4" />
                      Scan the new sticker
                    </button>
                  )}
                </div>
                {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting || !newQr}
                    onClick={submitRemap}
                    className="flex-1 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-on-brand disabled:opacity-60"
                  >
                    {canEditDirectly ? 'Replace code' : 'Request replacement'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAction(null); setNewQr(''); setScanning(false); setActionError(null) }}
                    className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {action === 'delete' && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">Delete this spare</p>
                <p className="mt-1 text-xs text-red-700">
                  It leaves the tagged list and stops counting towards its item. The
                  record and its history are kept, so what happened to it can still be
                  answered later.
                </p>
                <label className="mt-3 block text-xs font-medium text-red-800">
                  Reason (optional)
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Tagged in error, item scrapped…"
                    className="mt-1 w-full rounded-lg border border-red-200 bg-surface px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                {actionError && <p className="mt-2 text-sm text-red-700">{actionError}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={submitDelete}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {canEditDirectly ? 'Delete spare' : 'Request deletion'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAction(null); setReason(''); setActionError(null) }}
                    className="rounded-lg px-3 py-2 text-sm text-red-700 hover:text-red-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/*
            A retired spare is still reachable — its code is still on a
            sticker somewhere, and scanning it lands here. Saying so is the
            whole reason the row was kept rather than deleted, so it is the
            first thing on the page and nothing below it offers to edit.
          */}
          {equipment.deleted_at && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">This spare was deleted</p>
              <p className="mt-0.5 text-xs text-red-700">
                {formatDate(equipment.deleted_at)}. It no longer appears in the tagged
                list or counts towards its item. The record is kept so its history can
                still be read.
              </p>
            </div>
          )}

          <div className="mb-1 flex items-start justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{equipment.name}</h1>
            {!equipment.deleted_at && (canEditDirectly || !hasPendingRequest) && (
              <button
                onClick={() => setEditing(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                {canEditDirectly ? 'Edit' : 'Request edit'}
              </button>
            )}
          </div>
          <p className="mb-4 text-sm text-slate-500">{facility?.name ?? 'Unknown warehouse'}</p>

          {hasPendingRequest && !canEditDirectly && (
            <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />
              You have an edit request pending approval for this item.
            </p>
          )}

          <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {/* The Cyrix QR stuck on the spare, and the Cyrix catalogue
                    item it has been linked to. Both sit above the tagger's own
                    fields because they are what identifies the item. */}
                <tr>
                  <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                    Cyrix code
                  </th>
                  <td className="px-3 py-2 tabular-nums text-sm text-slate-700">{equipment.qr_value}</td>
                </tr>
                <tr>
                  <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                    Cyrix item
                  </th>
                  <td className="px-3 py-2">
                    {equipment.cyrix_item_code ? (
                      <span className="font-medium text-slate-800">
                        <span className="tabular-nums text-sm text-slate-500">{equipment.cyrix_item_code}</span>
                        {equipment.cyrix_item_name && ` · ${equipment.cyrix_item_name}`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                      >
                        Not linked — link one
                      </button>
                    )}
                  </td>
                </tr>
                {fieldDefs.map((f) => {
                    const rawValue = equipment.custom_fields[f.field_key]
                    if (f.field_type === 'image') {
                      const images = Array.isArray(rawValue) ? (rawValue as string[]) : []
                      return (
                        <tr key={f.id}>
                          <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left align-top font-normal text-slate-500">
                            {f.label}
                          </th>
                          <td className="px-3 py-2">
                            {images.length === 0 ? (
                              <span className="font-medium text-slate-800">—</span>
                            ) : (
                              <span className="flex flex-wrap gap-2">
                                {images.map((src, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setLightbox({ images, index: i })}
                                    aria-label={`View ${f.label} ${i + 1}`}
                                    className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 transition-transform hover:scale-105 hover:border-brand-300"
                                  >
                                    <img src={src} alt={`${f.label} ${i + 1}`} className="h-full w-full object-cover" />
                                  </button>
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={f.id}>
                        <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                          {f.label}
                        </th>
                        <td className="px-3 py-2 font-medium text-slate-800">{formatFieldValue(f, rawValue)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs text-slate-400">
                Tagged {formatDate(equipment.created_at)}
                {taggedBy && ` by ${taggedBy.full_name} (${taggedBy.ecode})`}
              </p>
              {equipment.updated_at !== equipment.created_at && (
                <p className="text-xs text-slate-400">
                  Updated {formatDate(equipment.updated_at)}
                  {updatedBy && ` by ${updatedBy.full_name} (${updatedBy.ecode})`}
                </p>
              )}
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <HistoryIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          title={equipment.name}
          onIndexChange={(index) => setLightbox((l) => (l ? { ...l, index } : l))}
          onClose={() => setLightbox(null)}
        />
      )}

      {historyOpen && equipment && (
        <EquipmentHistoryDialog
          equipmentId={equipment.id}
          title={equipment.name}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/*
        The same scanner the Scan tab uses, over the page rather than on
        another route — leaving for /scan would lose which spare is being
        recoded, and coming back would mean finding it again.

        Unmounted rather than hidden when it closes, because that is what
        releases the camera: QRScanner stops the stream in its cleanup.
      */}
      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Scan the new sticker</p>
              <p className="truncate text-xs text-slate-500">Replacing the code on {equipment.name}</p>
            </div>
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QRScanner onDecode={handleScan} />
          </div>
        </div>
      )}
    </div>
  )
}
