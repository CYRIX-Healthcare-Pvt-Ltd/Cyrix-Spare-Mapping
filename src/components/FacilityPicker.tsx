import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PlusIcon, SpinnerIcon, ChevronDownIcon, CheckIcon, SearchIcon } from './icons'
import { FormRow } from './FormRow'
import type { FacilityRow } from '../types/app'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/**
 * Warehouse picker: a dropdown you can also type into.
 *
 * This was a `<datalist>`, which is a text box that happens to have
 * suggestions -- on a desktop browser nothing drops down until you have
 * already typed, so a warehouse you cannot spell is unreachable and the
 * control looks broken. This is a real combo box: clicking it lists every
 * warehouse you are assigned to, typing narrows that list, and a name that
 * matches nothing offers to create the warehouse.
 *
 * District and city still live on the warehouse record -- admin sets them and
 * the tagged list reports them -- but they are not asked for here: everything
 * a tagger fills in should come from the admin-defined custom fields.
 */
export function FacilityPicker({
  facilities,
  value,
  onChange,
  onCreateFacility,
}: {
  facilities: FacilityRow[]
  value: string
  onChange: (facilityId: string) => void
  onCreateFacility?: (input: { name: string; district: string | null; city: string | null }) => Promise<FacilityRow>
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = facilities.find((f) => f.id === value) ?? null

  // Stay in sync if the selection changes from outside (e.g. only one
  // warehouse exists and the parent auto-selected it).
  useEffect(() => {
    if (selected) setText(selected.name)
    else if (!value) setText('')
  }, [selected, value])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  // While the box is closed the text is just the selected name, so the list
  // shows everything; once it is open the typed text narrows it.
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!open || !q || q === selected?.name.toLowerCase()) return facilities
    return facilities.filter((f) => f.name.toLowerCase().includes(q))
  }, [facilities, text, open, selected])

  const exact = facilities.find((f) => f.name.toLowerCase() === text.trim().toLowerCase()) ?? null
  const canCreate = !!onCreateFacility && !!text.trim() && !exact

  function pick(facility: FacilityRow) {
    onChange(facility.id)
    setText(facility.name)
    setOpen(false)
    setCreateError(null)
  }

  function handleTextChange(next: string) {
    setText(next)
    setOpen(true)
    setHighlight(0)
    setCreateError(null)
    // Typing past a chosen warehouse clears the selection, so the form can't
    // submit a name that no longer matches what is selected.
    const match = facilities.find((f) => f.name.toLowerCase() === next.trim().toLowerCase())
    onChange(match ? match.id : '')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (matches.length === 0) return
      setHighlight((h) => (e.key === 'ArrowDown' ? (h + 1) % matches.length : (h - 1 + matches.length) % matches.length))
    } else if (e.key === 'Enter') {
      if (open && matches[highlight]) {
        e.preventDefault()
        pick(matches[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  async function handleCreate() {
    if (!onCreateFacility || !text.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      // Name only: an admin fills in the district and city later from
      // Admin -> Warehouses. A tagger shouldn't have to know them.
      const created = await onCreateFacility({ name: text.trim(), district: null, city: null })
      onChange(created.id)
      setText(created.name)
      setOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not add this warehouse.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <FormRow label="Warehouse" htmlFor="warehouse-combo" required>
      <div ref={wrapRef} className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="warehouse-combo"
          ref={inputRef}
          required
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="warehouse-combo-list"
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={facilities.length ? 'Search or select a warehouse…' : 'Type the warehouse you are at…'}
          className={inputClass}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Hide warehouses' : 'Show warehouses'}
          onClick={() => {
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <ul
            id="warehouse-combo-list"
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full animate-pop-in overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">
                {facilities.length === 0 ? 'No warehouses assigned to you yet.' : 'No warehouse matches that name.'}
              </li>
            )}
            {matches.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={f.id === value}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(f)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    i === highlight ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.name}</span>
                    {(f.city || f.district) && (
                      <span className="block truncate text-xs text-slate-400">
                        {[f.city, f.district].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </span>
                  {f.id === value && <CheckIcon className="h-4 w-4 shrink-0 text-brand-700" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canCreate && (
        <div className="mt-1.5">
          <p className="text-xs text-amber-600">No warehouse matches that name exactly.</p>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
          >
            {creating ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
            {creating ? 'Adding…' : `Add "${text.trim()}" as a new warehouse`}
          </button>
          {createError && <p className="mt-1 text-xs text-red-600">{createError}</p>}
        </div>
      )}
    </FormRow>
  )
}
