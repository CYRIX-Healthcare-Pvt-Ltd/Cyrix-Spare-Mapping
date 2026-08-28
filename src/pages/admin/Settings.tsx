import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { SpinnerIcon } from '../../components/icons'

const SETTINGS = [
  { key: 'org_name', label: 'Organization name', placeholder: 'Cyrix Health Care' },
  { key: 'support_contact', label: 'Support contact', placeholder: 'it-support@cyrix.in' },
] as const

export default function Settings() {
  const { profile } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase
      .from('spare_settings')
      .select('*')
      .then(({ data }) => {
        const next: Record<string, string> = {}
        for (const row of data ?? []) {
          next[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value)
        }
        setValues(next)
        setLoading(false)
      })
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await Promise.all(
      SETTINGS.map(({ key }) =>
        supabase.from('spare_settings').upsert({ key, value: values[key] ?? '', updated_by: profile?.id })
      )
    )
    setSaving(false)
    setSaved(true)
  }

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-3xl sm:px-6 lg:py-8">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Settings</h1>
      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-surface p-4">
        {SETTINGS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
            <input
              className={inputClass}
              placeholder={placeholder}
              value={values[key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-650 disabled:opacity-60"
        >
          {saving && <SpinnerIcon className="h-4 w-4" />}
          Save settings
        </button>
        {saved && <p className="text-sm text-emerald-600">Saved.</p>}
      </form>
    </div>
  )
}
