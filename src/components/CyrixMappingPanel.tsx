import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { findCyrixMatches, searchCyrixItems, type ScoredItem } from '../lib/itemMatch'
import { SpinnerIcon, CheckIcon, AlertIcon, SearchIcon, PencilIcon } from './icons'
import type { ResolvedItem } from '../lib/itemAutofill'
import type { BplItemRow, CyrixItemRow } from '../types/app'

type Lookup =
  | { state: 'idle' }
  | { state: 'looking' }
  | { state: 'found'; item: BplItemRow }
  | { state: 'missing' }

/** Quantity on hand, so the tagger can tell a real shelf item from a catalogue entry. */
function StockBadge({ qty }: { qty: number | null }) {
  const n = typeof qty === 'number' ? qty : 0
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        n > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {n > 0 ? `${n} in stock` : 'No stock'}
    </span>
  )
}

/**
 * Resolves a scanned barcode to a BPL item and, when that item has no Cyrix
 * counterpart recorded yet, offers the closest Cyrix items to map it to.
 * Confirming a suggestion writes the mapping onto the BPL row, so it stays
 * resolved for everyone afterwards.
 *
 * This sits under the equipment-name field rather than under the barcode
 * field: the choice being made is "which item is this", so it belongs next
 * to the name it's going to fill in.
 */
export function CyrixMappingPanel({
  barcode,
  onResolve,
}: {
  barcode: string
  onResolve?: (item: ResolvedItem) => void
}) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [suggestions, setSuggestions] = useState<ScoredItem[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [remapping, setRemapping] = useState(false)
  const [manualTerm, setManualTerm] = useState('')
  const [manualResults, setManualResults] = useState<CyrixItemRow[]>([])

  const loadSuggestions = useCallback(async (item: BplItemRow) => {
    setLoadingSuggestions(true)
    setSuggestions(await findCyrixMatches(item.item_name))
    setLoadingSuggestions(false)
  }, [])

  // Reports the resolved item upward so sibling fields can autofill. Make,
  // model and the rest live on the Cyrix row, so they're only available once
  // the BPL item has been mapped -- before that the BPL name is all there is.
  const reportResolved = useCallback(
    async (item: BplItemRow, cyrix?: CyrixItemRow | null) => {
      if (!onResolve) return

      let detail: CyrixItemRow | null = cyrix ?? null
      if (!detail && item.cyrix_item_code) {
        const { data } = await supabase
          .from('cyrix_item_master')
          .select('*')
          .eq('item_code', item.cyrix_item_code)
          .limit(1)
        detail = data?.[0] ?? null
      }

      onResolve({
        bplItemCode: item.item_code,
        bplItemName: item.item_name,
        cyrixItemCode: detail?.item_code ?? item.cyrix_item_code,
        cyrixItemName: detail?.item_name ?? item.cyrix_item_name,
        make: detail?.make ?? null,
        model: detail?.model ?? null,
        itemGroup: detail?.item_group ?? null,
        parentEquipment: detail?.parent_equipment ?? null,
        additionalIdentifier: detail?.additional_identifier ?? null,
      })
    },
    [onResolve]
  )

  // Debounced so typing a barcode by hand doesn't fire a query per keystroke.
  useEffect(() => {
    const code = barcode.trim()
    if (!code) {
      setLookup({ state: 'idle' })
      setSuggestions([])
      return
    }

    let cancelled = false
    setLookup({ state: 'looking' })
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('bpl_item_master').select('*').eq('barcode', code).limit(1)
      if (cancelled) return

      const item = data?.[0]
      if (!item) {
        setLookup({ state: 'missing' })
        setSuggestions([])
        return
      }
      setLookup({ state: 'found', item })
      setRemapping(false)
      reportResolved(item)
      if (!item.cyrix_item_code) loadSuggestions(item)
      else setSuggestions([])
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [barcode, loadSuggestions, reportResolved])

  useEffect(() => {
    if (!manualTerm.trim()) {
      setManualResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const results = await searchCyrixItems(manualTerm)
      if (!cancelled) setManualResults(results)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [manualTerm])

  async function confirmMapping(cyrixItem: CyrixItemRow) {
    if (lookup.state !== 'found') return
    setSaving(true)
    const { error } = await supabase
      .from('bpl_item_master')
      .update({ cyrix_item_code: cyrixItem.item_code, cyrix_item_name: cyrixItem.item_name })
      .eq('id', lookup.item.id)
    setSaving(false)
    if (error) return

    const mapped = { ...lookup.item, cyrix_item_code: cyrixItem.item_code, cyrix_item_name: cyrixItem.item_name }
    setLookup({ state: 'found', item: mapped })
    // Confirming a mapping is the point the Cyrix detail becomes known, so
    // re-report to let make/model/group flow into the form.
    reportResolved(mapped, cyrixItem)
    setSuggestions([])
    setRemapping(false)
    setManualTerm('')
    setManualResults([])
  }

  function startRemap() {
    if (lookup.state !== 'found') return
    setRemapping(true)
    loadSuggestions(lookup.item)
  }

  if (lookup.state === 'idle') return null

  const mapped = lookup.state === 'found' && lookup.item.cyrix_item_code && !remapping
  const needsMapping = lookup.state === 'found' && (!lookup.item.cyrix_item_code || remapping)

  return (
    <div className="mt-1.5">
      {lookup.state === 'looking' && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <SpinnerIcon className="h-3.5 w-3.5" /> Looking up the scanned barcode…
        </p>
      )}

      {lookup.state === 'missing' && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          That barcode isn't in the BPL item master, so nothing could be filled in automatically — type the details in
          yourself.
        </p>
      )}

      {lookup.state === 'found' && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Scanned BPL item</p>
            <p className="text-sm text-slate-800">
              <span className="font-mono text-xs text-slate-500">{lookup.item.item_code}</span> · {lookup.item.item_name}
            </p>
          </div>

          {mapped && (
            <div className="flex items-start justify-between gap-2 border-t border-slate-200 pt-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Cyrix item</p>
                <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-mono text-xs">{lookup.item.cyrix_item_code}</span> · {lookup.item.cyrix_item_name}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={startRemap}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <PencilIcon className="h-3 w-3" /> Change
              </button>
            </div>
          )}

          {needsMapping && (
            <div className="space-y-2 border-t border-slate-200 pt-2">
              <p className="text-xs font-medium text-slate-600">
                {remapping ? 'Pick the correct Cyrix item:' : 'Which Cyrix item is this?'}
              </p>

              {loadingSuggestions ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <SpinnerIcon className="h-3.5 w-3.5" /> Finding matches…
                </p>
              ) : suggestions.length > 0 ? (
                <ul className="space-y-1">
                  {suggestions.map(({ item, score }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => confirmMapping(item)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-xs text-slate-500">{item.item_code}</span> · {item.item_name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {score === 1 && (
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              Exact
                            </span>
                          )}
                          <StockBadge qty={item.in_stock} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No close match — search for it below.</p>
              )}

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={manualTerm}
                  onChange={(e) => setManualTerm(e.target.value)}
                  placeholder="Search the Cyrix item master…"
                  className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {manualResults.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {manualResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => confirmMapping(item)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-xs text-slate-500">{item.item_code}</span> · {item.item_name}
                        </span>
                        <StockBadge qty={item.in_stock} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {remapping && (
                <button
                  type="button"
                  onClick={() => setRemapping(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
