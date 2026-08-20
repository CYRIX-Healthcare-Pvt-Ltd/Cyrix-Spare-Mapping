import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
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
  barcode: 'Barcode / scan',
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FieldDefinitionRow | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('field_definitions').select('*').order('display_order')
    setFields(data ?? [])
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

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Custom fields</h1>
      <p className="mb-4 text-sm text-slate-500">
        These fields show up on every equipment record, for every user.
      </p>

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
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
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          Add field
        </button>
      </form>

      <ul className="space-y-2">
        {fields.map((f, i) => (
          <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-3">
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
                <button onClick={() => setConfirmDelete(f)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${f.label}`}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.label}"?`}
        message="Existing equipment keeps its saved value, but it will no longer be shown or editable."
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
