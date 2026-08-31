import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon, PencilIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { fetchAutofillSources, type AutofillSource } from '../../lib/catalogueColumns'
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

/**
 * Whether this kind of field can be filled from the item master at all.
 *
 * A photo has to be taken on the spot, and the code field is the input that
 * finds the item in the first place -- filling it from what it resolved to
 * would only ever write back what is already in it.
 */
function canAutofill(type: FieldType): boolean {
  return type !== 'image' && type !== 'barcode'
}

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Which client item master column fills this field in when a code is scanned.
 *
 * The engineer scans one code and the rest of what the client's file knows
 * about that part should already be in the form. Which column is which was
 * previously guessed from the field's label, which works for "Make" and
 * "Model" and never had a chance with "Item Group(Material Group)" or
 * "HSN/SAC Code". Naming it outright is the difference between a form that
 * fills in two fields and one that fills in all of them.
 *
 * "Work it out from the label" stays available, and stays the default, so
 * nothing already set up changes behaviour on the day this ships.
 */
function AutofillSourcePicker({
  value,
  onChange,
  sources,
  className,
}: {
  value: string
  onChange: (value: string) => void
  sources: AutofillSource[]
  className: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">Fill from the {client} item master</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">Work it out from the label</option>
        {sources.map((source) => (
          <option key={source.key} value={source.key}>
            {source.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        Filled in when the item code is scanned, and editable afterwards — the engineer can always correct it.
      </p>
    </div>
  )
}

export default function Fields() {
  const [fields, setFields] = useState<FieldDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [options, setOptions] = useState('')
  const [imageMaxCount, setImageMaxCount] = useState(3)
  const [required, setRequired] = useState(false)
  const [autofillSource, setAutofillSource] = useState('')
  const [sources, setSources] = useState<AutofillSource[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FieldDefinitionRow | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState<FieldType>('text')
  const [editOptions, setEditOptions] = useState('')
  const [editImageMax, setEditImageMax] = useState(3)
  const [editRequired, setEditRequired] = useState(false)
  const [editAutofillSource, setEditAutofillSource] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // The sources are read from the catalogue rather than listed here: most
    // of them only exist because an uploaded file had a column by that name.
    const [{ data }, autofillSources] = await Promise.all([
      supabase.from('field_definitions').select('*').order('display_order'),
      fetchAutofillSources(),
    ])
    setFields(data ?? [])
    setSources(autofillSources)
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
      autofill_source: canAutofill(fieldType) && autofillSource ? autofillSource : null,
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
    setAutofillSource('')
    load()
  }

  async function toggleActive(f: FieldDefinitionRow) {
    await supabase.from('field_definitions').update({ active: !f.active }).eq('id', f.id)
    load()
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= fields.length) return
    const a = fields[index]
    const b = fields[target]
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
    setEditAutofillSource(f.autofill_source ?? '')
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
        autofill_source: canAutofill(editType) && editAutofillSource ? editAutofillSource : null,
      })
      .eq('id', id)

    if (updateError) {
      setEditError(updateError.message)
      return
    }
    setEditingId(null)
    load()
  }

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-3xl sm:px-6 lg:py-8">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Custom fields</h1>
      <p className="mb-4 text-sm text-slate-500">
        These fields show up on every equipment record, for every user.
      </p>

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
        {canAutofill(fieldType) && (
          <AutofillSourcePicker
            value={autofillSource}
            onChange={setAutofillSource}
            sources={sources}
            className={inputClass}
          />
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

      <ul className="space-y-2">
        {fields.map((f, i) => (
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
                {canAutofill(editType) && (
                  <AutofillSourcePicker
                    value={editAutofillSource}
                    onChange={setEditAutofillSource}
                    sources={sources}
                    className={inputClass}
                  />
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
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                    ↑
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                    ↓
                  </button>
                  <button
                    onClick={() => toggleActive(f)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      f.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {f.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => startEdit(f)}
                    className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    aria-label={`Edit ${f.label}`}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => setConfirmDelete(f)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${f.label}`}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

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
