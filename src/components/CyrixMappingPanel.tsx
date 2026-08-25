import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { lookupBlueStarItem } from '../lib/blueStarItem'
import { findCyrixMatches, searchCyrixItems, type ScoredItem } from '../lib/itemMatch'
import { SpinnerIcon, CheckIcon, AlertIcon, SearchIcon, PencilIcon, HistoryIcon, LinkIcon, XIcon, TrashIcon } from './icons'
import { MatchBadge, StockBadge } from './ItemBadges'
import { MappingHistoryDialog } from './MappingHistoryDialog'
import { SearchInput } from './SearchInput'
import type { ResolvedItem } from '../lib/itemAutofill'
import type { BlueStarItemRow, CyrixItemRow } from '../types/app'

/** The Cyrix item a spare is linked to, held in form state until the tag is saved. */
export interface CyrixSelection {
  code: string
  name: string
}

type Lookup =
  | { state: 'idle' }
  | { state: 'looking' }
  | { state: 'found'; item: BlueStarItemRow }
  | { state: 'missing' }

/**
 * Links the spare being tagged to an item in the Cyrix catalogue.
 *
 * Everything tagged here is a Blue Star spare, so the *name* is what drives
 * matching -- that's the one thing always present, whether or not a Blue Star
 * code was scanned. A scanned code is treated as an accelerator: when it
 * resolves in the Blue Star catalogue its official name is matched instead of
 * the typed one, and any Cyrix link already recorded against it is adopted.
 * When it doesn't resolve (or wasn't scanned at all) matching falls back to
 * the typed name, so a spare can always be linked.
 *
 * The choice is reported upward rather than written immediately: on a new tag
 * the Blue Star catalogue row doesn't exist yet, so saving the tag is what
 * creates it and records the mapping -- one path, one history entry.
 *
 * Sits under the spare-name field rather than the code field: the question
 * being answered is "which item is this", so it belongs next to the name.
 */
export function CyrixMappingPanel({
  blueStarCode,
  spareName,
  selection,
  onSelectionChange,
  onResolve,
}: {
  blueStarCode: string
  spareName: string
  selection: CyrixSelection | null
  onSelectionChange: (selection: CyrixSelection | null) => void
  onResolve?: (item: ResolvedItem) => void
}) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [suggestions, setSuggestions] = useState<ScoredItem[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [changing, setChanging] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [manualTerm, setManualTerm] = useState('')
  const [manualResults, setManualResults] = useState<CyrixItemRow[]>([])
  const [searching, setSearching] = useState(false)

  const blueStarItem = lookup.state === 'found' ? lookup.item : null
  // Blue Star's own name for the item beats the typed one when we have it --
  // it is what their catalogue will be matched against.
  const matchName = (blueStarItem?.item_name ?? spareName).trim()
  const picking = !selection || changing

  // Reports what is known about the spare upward so sibling fields (make,
  // model, group...) can autofill. Those live on the Cyrix row, so most of it
  // only becomes available once a Cyrix item is linked.
  const report = useCallback(
    async (bs: BlueStarItemRow | null, cyrixCode: string | null, cyrix?: CyrixItemRow | null) => {
      if (!onResolve) return

      let detail: CyrixItemRow | null = cyrix ?? null
      if (!detail && cyrixCode) {
        const { data } = await supabase.from('cyrix_item_master').select('*').eq('item_code', cyrixCode).limit(1)
        detail = data?.[0] ?? null
      }

      onResolve({
        blueStarItemCode: bs?.item_code ?? null,
        blueStarItemName: bs?.item_name ?? null,
        cyrixItemCode: detail?.item_code ?? cyrixCode,
        cyrixItemName: detail?.item_name ?? null,
        make: detail?.make ?? null,
        model: detail?.model ?? null,
        itemGroup: detail?.item_group ?? null,
        parentEquipment: detail?.parent_equipment ?? null,
        additionalIdentifier: detail?.additional_identifier ?? null,
      })
    },
    [onResolve]
  )

  // Keeps the latest callbacks reachable from the debounced lookup without
  // making that effect re-run (and re-query) on every parent render.
  const reportRef = useRef(report)
  reportRef.current = report
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  // Debounced so typing a code by hand does not fire a query per keystroke.
  useEffect(() => {
    const code = blueStarCode.trim()
    if (!code) {
      setLookup({ state: 'idle' })
      return
    }

    let cancelled = false
    setLookup({ state: 'looking' })
    const timer = setTimeout(async () => {
      const item = await lookupBlueStarItem(code)
      if (cancelled) return

      if (!item) {
        setLookup({ state: 'missing' })
        return
      }
      setLookup({ state: 'found', item })
      reportRef.current(item, item.cyrix_item_code)
      // A link already recorded against this item is the answer -- adopt it
      // rather than asking the tagger to choose again.
      if (item.cyrix_item_code && !selectionRef.current) {
        onSelectionChangeRef.current({
          code: item.cyrix_item_code,
          name: item.cyrix_item_name ?? item.cyrix_item_code,
        })
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [blueStarCode])

  // Suggestions follow the name, so they keep up as it is typed or autofilled.
  useEffect(() => {
    if (!picking || matchName.length < 2) {
      setSuggestions([])
      setLoadingSuggestions(false)
      return
    }
    let cancelled = false
    setLoadingSuggestions(true)
    const timer = setTimeout(async () => {
      const matches = await findCyrixMatches(matchName)
      if (cancelled) return
      setSuggestions(matches)
      setLoadingSuggestions(false)
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [matchName, picking])

  useEffect(() => {
    if (!manualTerm.trim()) {
      setManualResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await searchCyrixItems(manualTerm)
      if (cancelled) return
      setManualResults(results)
      setSearching(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [manualTerm])

  // Unlinking is a deliberate act, distinct from never having chosen: it is
  // applied to the catalogue row on save and recorded in the mapping history
  // like any other change of mapping.
  function remove() {
    onSelectionChange(null)
    setChanging(false)
    setSearchOpen(false)
    setManualTerm('')
    setManualResults([])
  }

  function choose(item: CyrixItemRow) {
    onSelectionChange({ code: item.item_code, name: item.item_name })
    report(blueStarItem, item.item_code, item)
    setChanging(false)
    setSearchOpen(false)
    setManualTerm('')
    setManualResults([])
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <LinkIcon className="h-3.5 w-3.5" /> Cyrix item
        </p>
        {selection && !changing ? (
          <span className="flex shrink-0 items-center gap-1">
            {/* Neutral for looking, brand for editing, red for undoing --
                so the row can be read by colour before it's read by word. */}
            {blueStarItem && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <HistoryIcon className="h-3 w-3" /> History
              </button>
            )}
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="flex items-center gap-1 rounded-lg border border-brand-200 bg-surface px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <PencilIcon className="h-3 w-3" /> Change
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-surface px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="h-3 w-3" /> Remove
            </button>
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Not linked
          </span>
        )}
      </div>

      {/* What the scanned Blue Star code turned out to be, when one was given. */}
      {lookup.state === 'looking' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <SpinnerIcon className="h-3.5 w-3.5" /> Looking up the Blue Star code&hellip;
        </p>
      )}
      {lookup.state === 'missing' && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          That code is not in the Blue Star item master yet &mdash; it gets added when you save. Matching below uses the
          spare name instead.
        </p>
      )}
      {blueStarItem && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="text-slate-400">Blue Star: </span>
          <span className="tabular-nums text-[11px] text-slate-500">{blueStarItem.item_code}</span> ·{' '}
          {blueStarItem.item_name}
        </p>
      )}

      {selection && !changing ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-800">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="tabular-nums text-xs">{selection.code}</span> · {selection.name}
          </span>
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {matchName.length < 2 ? (
            <p className="text-xs text-slate-400">
              Type the spare name above and matching Cyrix items appear here &mdash; or search the catalogue directly.
            </p>
          ) : loadingSuggestions ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <SpinnerIcon className="h-3.5 w-3.5" /> Matching &ldquo;{matchName}&rdquo;&hellip;
            </p>
          ) : suggestions.length > 0 ? (
            <>
              <p className="text-xs text-slate-500">
                Closest Cyrix items for <span className="font-medium text-slate-700">&ldquo;{matchName}&rdquo;</span>:
              </p>
              <ul className="space-y-1">
                {suggestions.map(({ item, score }) => (
                  <li key={item.id}>
                    <CyrixOption item={item} score={score} onSelect={choose} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              No close match for &ldquo;{matchName}&rdquo; &mdash; search the catalogue below.
            </p>
          )}

          {searchOpen || changing || suggestions.length === 0 ? (
            <div className="space-y-1.5">
              <SearchInput
                value={manualTerm}
                onChange={setManualTerm}
                placeholder="Search the Cyrix item master by code or name…"
                size="sm"
              />
              {searching && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <SpinnerIcon className="h-3.5 w-3.5" /> Searching&hellip;
                </p>
              )}
              {manualResults.length > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {manualResults.map((item) => (
                    <li key={item.id}>
                      <CyrixOption item={item} onSelect={choose} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
            >
              <SearchIcon className="h-3.5 w-3.5" /> None of these &mdash; search the Cyrix item master
            </button>
          )}

          {changing && selection && (
            <button
              type="button"
              onClick={() => {
                setChanging(false)
                setSearchOpen(false)
              }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <XIcon className="h-3 w-3" /> Keep {selection.code}
            </button>
          )}
        </div>
      )}

      {historyOpen && blueStarItem && (
        <MappingHistoryDialog item={blueStarItem} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  )
}

function CyrixOption({
  item,
  score,
  onSelect,
}: {
  item: CyrixItemRow
  score?: number
  onSelect: (item: CyrixItemRow) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-left text-sm hover:border-brand-300 hover:bg-brand-50"
    >
      <span className="min-w-0 truncate">
        <span className="tabular-nums text-xs text-slate-500">{item.item_code}</span> · {item.item_name}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {score !== undefined && <MatchBadge score={score} />}
        <StockBadge qty={item.in_stock} />
      </span>
    </button>
  )
}
