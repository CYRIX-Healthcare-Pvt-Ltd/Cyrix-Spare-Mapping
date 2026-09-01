import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon, PencilIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { fetchAutofillSources, type AutofillSource } from '../../lib/catalogueColumns'
import { isClientColumnField, syncClientColumnFields } from '../../lib/clientColumnFields'
import { client } from '../../lib/branding'
import type { FieldDefinitionRow } from '../../types/app'
import type { FieldType } from '../../types/database'

const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  boolean: 'Yes / No',
  image: 'Image upload',
  barcode: 'Item code / scan',
}

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function Fields() {
  const [fields, setFields] = useState<FieldDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [options, setOptions] = useState('')
  const [imageMaxCount, setImageMaxCount] = useState(3)
  const [required, setRequired] = useState(false)
  const [sources, setSources] = useState<AutofillSource[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FieldDefinitionRow | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState<FieldType>('text')
  const [editOptions, setEditOptions] = useState('')
  const [editImageMax, setEditImageMax] = useState(3)
  const [editRequired, setEditRequired] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // The sources are read from the catalogue rather than listed here: most
    // of them only exist because an uploaded file had a column by that name.
    const [{ data }, autofillSources] = await Promise.all([
      supabase.from('field_definitions').select('*').order('display_order'),
      fetchAutofillSources(),
    ])
    setSources(autofillSources)

    // Every client column gets a field, so this screen shows the catalogue as
    // it actually stands rather than whatever somebody remembered to add.
    // Insert-only, so a column already unticked stays unticked.
    let rows = data ?? []
    try {
      const { added } = await syncClientColumnFields(rows)
      if (added > 0) {
        const { data: refreshed } = await supabase
          .from('field_definitions')
          .select('*')
          .order('display_order')
        rows = refreshed ?? rows
      }
      setSyncError(null)
    } catch (e) {
      // Worth saying out loud rather than silently showing a short list: the
      // usual cause is the database not having caught up with the app.
      setSyncError(e instanceof Error ? e.message : String(e))
    }

    setFields(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    // fields.length isn't safe here -- reordering (the up/down arrows below)
    // or deleting a field can leave display_order with gaps or ties, so a
    // freshly added field can land on a value another field already has.
    const nextOrder = fields.length ? Math.max(...fields.map((f) => f.display_order)) + 1 : 0

    const key = slugify(label)
    const { error: insertError } = await supabase.from('field_definitions').insert({
      field_key: key,
      label,
      field_type: fieldType,
      options: fieldType === 'dropdown' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [],
      image_max_count: fieldType === 'image' ? imageMaxCount : null,
      required,
      display_order: nextOrder,
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.code === '23505' ? 'A field with a similar name already exists.' : insertError.message)
      return
    }
    setLabel('')
    setOptions('')
    setImageMaxCount(3)
    setRequired(false)
    setFieldType('text')
    load()
  }

  async function toggleActive(f: FieldDefinitionRow) {
    await supabase.from('field_definitions').update({ active: !f.active }).eq('id', f.id)
    load()
  }

  // Ordering happens inside a group. The two lists are separate questions --
  // where a client column sits among the client columns, and where a custom
  // field sits among the custom fields -- and swapping across the boundary
  // would shuffle one into the other.
  async function move(group: FieldDefinitionRow[], index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= group.length) return
    const a = group[index]
    const b = group[target]
    await Promise.all([
      supabase.from('field_definitions').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('field_definitions').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  async function performDelete() {
    if (!confirmDelete) return
    await supabase.from('field_definitions').delete().eq('id', confirmDelete.id)
    setConfirmDelete(null)
    load()
  }

  function startEdit(f: FieldDefinitionRow) {
    setEditingId(f.id)
    setEditLabel(f.label)
    setEditType(f.field_type)
    setEditOptions(f.options.join(', '))
    setEditImageMax(f.image_max_count ?? 3)
    setEditRequired(f.required)
    setEditError(null)
  }

  async function saveEdit(id: string) {
    setEditError(null)
    // field_key is deliberately left alone: it's the key every existing
    // equipment row stores its value under, so renaming it would orphan all
    // of that data. The label is free to change.
    const { error: updateError } = await supabase
      .from('field_definitions')
      .update({
        label: editLabel,
        field_type: editType,
        options: editType === 'dropdown' ? editOptions.split(',').map((o) => o.trim()).filter(Boolean) : [],
        image_max_count: editType === 'image' ? editImageMax : null,
        required: editRequired,
      })
      .eq('id', id)

    if (updateError) {
      setEditError(updateError.message)
      return
    }
    setEditingId(null)
    load()
  }

  // One ordered list, read as two: what the client's catalogue brought, and
  // what somebody here added on top of it.
  const clientFields = fields.filter(isClientColumnField)
  const manualFields = fields.filter((f) => !isClientColumnField(f))

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  const renderField = (f: FieldDefinitionRow, group: FieldDefinitionRow[], i: number) => (
          <li key={f.id} className="rounded-xl border border-slate-200 bg-surface p-3">
            {editingId === f.id ? (
              <div className="space-y-3">
                <input
                  autoFocus
                  placeholder="Label"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className={inputClass}
                />
                <select value={editType} onChange={(e) => setEditType(e.target.value as FieldType)} className={inputClass}>
                  {Object.entries(TYPE_LABEL).map(([value, l]) => (
                    <option key={value} value={value}>
                      {l}
                    </option>
                  ))}
                </select>
                {editType === 'dropdown' && (
                  <input
                    placeholder="Options, comma separated"
                    value={editOptions}
                    onChange={(e) => setEditOptions(e.target.value)}
                    className={inputClass}
                  />
                )}
                {editType === 'image' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Max images for this field</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={editImageMax}
                      onChange={(e) => setEditImageMax(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                      className={inputClass}
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editRequired}
                    onChange={(e) => setEditRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Required
                </label>
                {editType !== f.field_type && (
                  <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                    Changing the type leaves values already saved on existing equipment as they are — they may not fit
                    the new type.
                  </p>
                )}
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(f.id)}
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-650"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {TYPE_LABEL[f.field_type]}
                    {f.field_type === 'dropdown' && f.options.length > 0 && `: ${f.options.join(', ')}`}
                    {f.field_type === 'image' && ` (up to ${f.image_max_count ?? 3})`}
                  </p>
                  {f.autofill_source && (
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Fills from {sources.find((c) => c.key === f.autofill_source)?.label ?? f.autofill_source}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Shown, not described: whether an engineer is asked for
                      this field is the one decision on this row that gets
                      changed often, so it is a checkbox rather than a word
                      that has to be read and then interpreted. */}
                  <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={f.active}
                      onChange={() => toggleActive(f)}
                      className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                    />
                    Show
                  </label>
                  <button onClick={() => move(group, i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move ${f.label} up`}>
                    ↑
                  </button>
                  <button onClick={() => move(group, i, 1)} disabled={i === group.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move ${f.label} down`}>
                    ↓
                  </button>
                  <button
                    onClick={() => startEdit(f)}
                    className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    aria-label={`Edit ${f.label}`}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  {/* A client column has no delete: the catalogue decides
                      that it exists, and the next load would put it straight
                      back. Unticking Show is how you stop asking for it. */}
                  {!isClientColumnField(f) && (
                    <button onClick={() => setConfirmDelete(f)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${f.label}`}>
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
  )

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-3xl sm:px-6 lg:py-8">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Custom fields</h1>
      <p className="mb-4 text-sm text-slate-500">
        These fields show up on every equipment record, for every user.
      </p>

      {syncError && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The {client} catalogue's columns could not be set up as fields: {syncError}. If that mentions a missing
          column, the database is behind the app — apply the pending migrations and reload.
        </p>
      )}

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-surface p-4">
        <p className="text-sm font-medium text-slate-700">Add a field</p>
        <input required placeholder="Label, e.g. Serial number" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        <select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} className={inputClass}>
          {Object.entries(TYPE_LABEL).map(([value, l]) => (
            <option key={value} value={value}>
              {l}
            </option>
          ))}
        </select>
        {fieldType === 'dropdown' && (
          <input
            placeholder="Options, comma separated"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className={inputClass}
          />
        )}
        {fieldType === 'image' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Max images for this field</label>
            <input
              type="number"
              min={1}
              max={10}
              value={imageMaxCount}
              onChange={(e) => setImageMaxCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className={inputClass}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Required
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-650 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          Add field
        </button>
      </form>

      {/* The catalogue's own columns lead. They are what a scan fills in, so
          they are the part of this screen that describes the client's data
          rather than this site's additions to it. */}
      {clientFields.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-900">From the {client} item master</h2>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            One for every column the catalogue holds. Tick a column to ask engineers for it; scanning the item code
            fills the rest in. New columns appear here when a master file is uploaded.
          </p>
          <ul className="space-y-2">{clientFields.map((f, i) => renderField(f, clientFields, i))}</ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Added by hand</h2>
        <p className="mb-2 mt-0.5 text-xs text-slate-500">
          Anything the catalogue does not carry — a serial number, a photo, a condition note.
        </p>
        {manualFields.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
            None yet — add one above.
          </p>
        ) : (
          <ul className="space-y-2">{manualFields.map((f, i) => renderField(f, manualFields, i))}</ul>
        )}
      </section>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.label}"?`}
        message="Existing spares keep their saved value, but it will no longer be shown or editable."
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
