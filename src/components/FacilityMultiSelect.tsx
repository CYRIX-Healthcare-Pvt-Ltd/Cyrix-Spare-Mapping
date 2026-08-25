import { useMemo, useState } from 'react'
import type { FacilityRow } from '../types/app'
import { SearchIcon, XIcon } from './icons'

/**
 * Facility checklist that scales past a handful of items: collapsed to a
 * chip summary by default, expands into a searchable, capped-render list
 * with select-all/clear-all -- a flat "print every facility as a checkbox"
 * list falls over once there are hundreds of them.
 */
export function FacilityMultiSelect({
  facilities,
  selected,
  onChange,
}: {
  facilities: FacilityRow[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return facilities
    return facilities.filter((f) => [f.name, f.district, f.city].some((v) => v?.toLowerCase().includes(q)))
  }, [facilities, search])

  const selectedSet = new Set(selected)
  const selectedFacilities = facilities.filter((f) => selectedSet.has(f.id))

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  function selectAllFiltered() {
    const ids = new Set(selected)
    filtered.forEach((f) => ids.add(f.id))
    onChange([...ids])
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:border-brand-300"
      >
        {selectedFacilities.length === 0 ? (
          <span className="text-slate-400">No warehouses assigned — tap to assign</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {selectedFacilities.slice(0, 4).map((f) => (
              <span key={f.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {f.name}
              </span>
            ))}
            {selectedFacilities.length > 4 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                +{selectedFacilities.length - 4} more
              </span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col animate-pop-in rounded-2xl bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Assign warehouses</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, district, or city…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {selected.length} of {facilities.length} selected
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={selectAllFiltered} className="font-medium text-brand-700 hover:underline">
                    Select all{search ? ' matching' : ''}
                  </button>
                  <button type="button" onClick={() => onChange([])} className="font-medium text-slate-500 hover:underline">
                    Clear all
                  </button>
                </span>
              </div>
            </div>

            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-400">No warehouses match.</li>
              )}
              {filtered.slice(0, 300).map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{f.name}</span>
                      {(f.district || f.city) && (
                        <span className="block truncate text-xs text-slate-400">
                          {[f.district, f.city].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
              {filtered.length > 300 && (
                <li className="px-4 py-2 text-center text-xs text-slate-400">
                  Showing first 300 — refine your search to find more.
                </li>
              )}
            </ul>

            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-650"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
