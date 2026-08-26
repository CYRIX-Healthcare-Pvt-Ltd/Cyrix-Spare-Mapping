import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import {
  UploadIcon,
  DownloadIcon,
  SpinnerIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  ColumnsIcon,
} from '../../components/icons'
import { BulkUploadModal, type RowOutcome, type ImportContext } from '../../components/BulkUploadModal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { MappingHistoryDialog } from '../../components/MappingHistoryDialog'
import { MappingSplitDialog } from '../../components/MappingSplitDialog'
import { ColumnChooserDialog } from '../../components/ColumnChooserDialog'
import { downloadXlsx, type CellValue } from '../../lib/xlsx'
import type { BlueStarItemRow, CyrixItemRow } from '../../types/app'
import { SearchInput } from '../../components/SearchInput'
import {
  fetchTagCounts,
  fetchMappingSummary,
  taggingStatus,
  type TaggingStatus,
  type MappingShare,
} from '../../lib/blueStarItem'
import {
  CORE_COLUMNS,
  MAPPABLE_FIELDS,
  isChoosable,
  attributeKeysFor,
  fetchCatalogueColumns,
  registerImportedColumns,
  rowAttributes,
  type CatalogueColumn,
  type CatalogueKey,
  type FieldMapping,
} from '../../lib/catalogueColumns'

type Tab = CatalogueKey

interface PendingDelete {
  table: 'bluestar_item_master' | 'cyrix_item_master'
  id: string
  label: string
}

interface CyrixImportRow {
  item_code: string
  item_name: string
  in_stock: number | null
  item_cost: number | null
  additional_identifier: string | null
  item_group: string | null
  parent_equipment: string | null
  make: string | null
  model: string | null
  /** Every column of the sheet the app has no dedicated column for. */
  attributes: Record<string, string>
}

interface BlueStarImportRow {
  item_code: string
  item_name: string
  /** Units Blue Star says exist. The denominator for tagging progress. */
  quantity: number | null
  attributes: Record<string, string>
}

function parseNumber(value: string | undefined): { ok: true; value: number | null } | { ok: false } {
  const clean = value?.trim()
  if (!clean) return { ok: true, value: null }
  const n = Number(clean.replace(/,/g, ''))
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false }
}

/** The cell a field was mapped to, or '' when the file has no such column. */
function mapped(raw: Record<string, string>, mapping: FieldMapping, key: string): string {
  const header = mapping[key]
  return header ? (raw[header] ?? '').trim() : ''
}

function parseCyrixRow(raw: Record<string, string>, ctx: ImportContext): { data: CyrixImportRow } | { error: string } {
  const item_code = mapped(raw, ctx.mapping, 'item_code')
  const item_name = mapped(raw, ctx.mapping, 'item_name')
  if (!item_code) return { error: 'Item code is empty' }
  if (!item_name) return { error: 'Item name is empty' }

  const in_stock = parseNumber(mapped(raw, ctx.mapping, 'in_stock'))
  if (!in_stock.ok) return { error: `Invalid in stock "${mapped(raw, ctx.mapping, 'in_stock')}"` }
  const item_cost = parseNumber(mapped(raw, ctx.mapping, 'item_cost'))
  if (!item_cost.ok) return { error: `Invalid item cost "${mapped(raw, ctx.mapping, 'item_cost')}"` }

  return {
    data: {
      item_code,
      item_name,
      in_stock: in_stock.value,
      item_cost: item_cost.value,
      additional_identifier: mapped(raw, ctx.mapping, 'additional_identifier') || null,
      item_group: mapped(raw, ctx.mapping, 'item_group') || null,
      parent_equipment: mapped(raw, ctx.mapping, 'parent_equipment') || null,
      make: mapped(raw, ctx.mapping, 'make') || null,
      model: mapped(raw, ctx.mapping, 'model') || null,
      attributes: rowAttributes(raw, attributeKeysFor('cyrix', ctx.headers, ctx.mapping)),
    },
  }
}

function parseBlueStarRow(
  raw: Record<string, string>,
  ctx: ImportContext
): { data: BlueStarImportRow } | { error: string } {
  const item_code = mapped(raw, ctx.mapping, 'item_code')
  const item_name = mapped(raw, ctx.mapping, 'item_name')
  if (!item_code) return { error: 'Item code is empty' }
  if (!item_name) return { error: 'Item name is empty' }

  const quantity = parseNumber(mapped(raw, ctx.mapping, 'quantity'))
  if (!quantity.ok) return { error: `Invalid quantity "${mapped(raw, ctx.mapping, 'quantity')}"` }

  return {
    data: {
      item_code,
      item_name,
      quantity: quantity.value,
      attributes: rowAttributes(raw, attributeKeysFor('bluestar', ctx.headers, ctx.mapping)),
    },
  }
}

const STATUS_STYLE: Record<TaggingStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-600' },
  partial: { label: 'Partly tagged', className: 'bg-amber-50 text-amber-700' },
  complete: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700' },
  // No quantity in the master file means no denominator, so there is nothing
  // honest to say about progress.
  unknown: { label: 'No quantity', className: 'bg-slate-100 text-slate-500' },
}

/**
 * What this part's tagged units were mapped to.
 *
 * A single Cyrix item when they agree; every one of them, with counts and a
 * warning, when they don't -- units of one part pointing at different Cyrix
 * items is a disagreement someone has to resolve, so it is stated rather than
 * flattened to whichever is most common.
 */
function CyrixCell({ shares, onOpenSplit }: { shares: MappingShare[]; onOpenSplit: () => void }) {
  if (shares.length === 0) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Not mapped</span>
  }

  if (shares.length === 1) {
    const only = shares[0]
    const full = `${only.cyrixItemCode}${only.cyrixItemName ? ` · ${only.cyrixItemName}` : ''}`
    return (
      <span className="block max-w-64 truncate" title={full}>
        <span className="tabular-nums text-sm text-slate-500">{only.cyrixItemCode}</span>
        {only.cyrixItemName && ` · ${only.cyrixItemName}`}
      </span>
    )
  }

  // Twenty units could in principle carry twenty different answers, so the
  // cell states the count and the dialog carries the list.
  return (
    <button
      type="button"
      onClick={onOpenSplit}
      className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
    >
      {shares.length} Cyrix items
    </button>
  )
}

/* ------------------------------------------------------------ rendering --- */

// Quantities and money read as columns of digits, so they line up on the
// right; everything else reads as text and lines up on the left.
const NUMERIC_COLUMNS = new Set(['quantity', 'tagged', 'in_stock', 'item_cost'])

// Derived from which QR codes have been tagged rather than read from any
// file, so they render but never export.
const COMPUTED_COLUMNS = new Set(['cyrix_item', 'tagged', 'status'])

function cellClass(key: string): string {
  if (key === 'item_name') return 'px-3 py-2 font-medium text-slate-900'
  if (key === 'item_code') return 'whitespace-nowrap px-3 py-2 tabular-nums text-sm text-slate-600'
  if (NUMERIC_COLUMNS.has(key)) return 'whitespace-nowrap px-3 py-2 text-right text-slate-600'
  return 'whitespace-nowrap px-3 py-2 text-slate-600'
}

/**
 * A column the file brought with it.
 *
 * Width is capped rather than left to the content: an imported column can hold
 * a paragraph of remarks, and one such column would otherwise push everything
 * after it off the side of the table.
 */
function AttributeCell({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>
  return (
    <span className="block max-w-56 truncate" title={value}>
      {value}
    </span>
  )
}

function blueStarCell(
  key: string,
  row: BlueStarItemRow,
  helpers: { tagged: number; shares: MappingShare[]; onOpenSplit: () => void }
): ReactNode {
  switch (key) {
    case 'item_code':
      return row.item_code
    case 'item_name':
      return row.item_name
    case 'cyrix_item':
      return <CyrixCell shares={helpers.shares} onOpenSplit={helpers.onOpenSplit} />
    case 'quantity':
      return row.quantity ?? '—'
    // Just the count: Qty is a column of its own, so repeating the
    // denominator here says nothing new.
    case 'tagged':
      return helpers.tagged
    case 'status': {
      const status = STATUS_STYLE[taggingStatus(helpers.tagged, row.quantity)]
      return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
    }
    default:
      return <AttributeCell value={row.attributes?.[key]} />
  }
}

function cyrixCell(key: string, row: CyrixItemRow): ReactNode {
  switch (key) {
    case 'item_code':
      return row.item_code
    case 'item_name':
      return row.item_name
    case 'in_stock':
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            (row.in_stock ?? 0) > 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'
          }`}
        >
          {row.in_stock ?? 0}
        </span>
      )
    case 'item_cost':
      return row.item_cost == null ? '—' : row.item_cost.toLocaleString('en-IN')
    case 'additional_identifier':
      return row.additional_identifier ?? '—'
    case 'item_group':
      return row.item_group ?? '—'
    case 'parent_equipment':
      return row.parent_equipment ?? '—'
    case 'make':
      return row.make ?? '—'
    case 'model':
      return row.model ?? '—'
    default:
      return <AttributeCell value={row.attributes?.[key]} />
  }
}

const PAGE_SIZE = 100
const CHUNK_SIZE = 500

function fillOutcomes(outcomes: RowOutcome[], start: number, length: number, errorMessage?: string) {
  for (let i = 0; i < length; i++) {
    outcomes[start + i] = errorMessage ? { status: 'error', message: errorMessage } : { status: 'ok', message: 'Saved' }
  }
}

/** Registers whatever extra columns the file turned out to carry. */
async function rememberColumns(catalogue: CatalogueKey, ctx: ImportContext) {
  const keys = attributeKeysFor(catalogue, ctx.headers, ctx.mapping)
  await registerImportedColumns(
    catalogue,
    [...keys].map(([header, key]) => ({ key, label: header }))
  )
}

export default function ItemMasters() {
  const { profile } = useAuth()
  // Everyone can read both catalogues -- an engineer looking a part up in the
  // warehouse needs them as much as an admin does. Only an admin gets the
  // controls that change anything. This decides what to render, not what is
  // permitted: the database grants SELECT to any signed-in user and restricts
  // INSERT, UPDATE and DELETE on both tables to is_admin(), so hiding a button
  // is a courtesy rather than the safeguard.
  const canEdit = profile?.role === 'admin'
  const [tab, setTab] = useState<Tab>('bluestar')
  const [blueStarRows, setBlueStarRows] = useState<BlueStarItemRow[]>([])
  const [cyrixRows, setCyrixRows] = useState<CyrixItemRow[]>([])
  const [blueStarCount, setBlueStarCount] = useState(0)
  const [cyrixCount, setCyrixCount] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [bulkOpen, setBulkOpen] = useState<Tab | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(0)
  const [historyFor, setHistoryFor] = useState<BlueStarItemRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(0)
  const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map())
  const [mappingShares, setMappingShares] = useState<Map<string, MappingShare[]>>(new Map())
  const [splitFor, setSplitFor] = useState<BlueStarItemRow | null>(null)
  const [columns, setColumns] = useState<CatalogueColumn[]>([])
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState<null | 'selected' | 'all'>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const loadColumns = useCallback(async () => {
    const [bluestar, cyrix] = await Promise.all([fetchCatalogueColumns('bluestar'), fetchCatalogueColumns('cyrix')])
    setColumns([...bluestar, ...cyrix])
  }, [])

  useEffect(() => {
    loadColumns()
  }, [loadColumns])

  // A new search or tab has its own result set, so any page offset from the
  // previous one is meaningless -- and page 3 of a 2-page result renders empty.
  useEffect(() => {
    setPage(0)
  }, [search, tab])

  // Ticks refer to rows; a new tab, search or page is a different set of rows,
  // so carrying the ticks across would arm a delete against things nobody can
  // see any more.
  useEffect(() => {
    setSelected([])
  }, [search, tab, page])

  const load = useCallback(async () => {
    setLoading(true)
    const term = search.trim()
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    // Search and paging both run server-side: these catalogues run to tens of
    // thousands of rows, so filtering or slicing a fully-downloaded list in
    // the browser isn't viable.
    let blueStarQuery = supabase.from('bluestar_item_master').select('*', { count: 'exact' }).order('item_code').range(from, to)
    let cyrixQuery = supabase.from('cyrix_item_master').select('*', { count: 'exact' }).order('item_code').range(from, to)
    if (term) {
      const pattern = `%${term}%`
      blueStarQuery = blueStarQuery.or(`item_code.ilike.${pattern},item_name.ilike.${pattern}`)
      cyrixQuery = cyrixQuery.or(
        `item_code.ilike.${pattern},item_name.ilike.${pattern},additional_identifier.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern}`
      )
    }

    const [{ data: blueStar, count: blueStarTotal }, { data: cyrix, count: cyrixTotal }] = await Promise.all([blueStarQuery, cyrixQuery])

    setBlueStarRows(blueStar ?? [])
    setCyrixRows(cyrix ?? [])
    // Only for the rows on screen -- the catalogue runs to tens of thousands.
    const visibleIds = (blueStar ?? []).map((r) => r.id)
    const [counts, shares] = await Promise.all([fetchTagCounts(visibleIds), fetchMappingSummary(visibleIds)])
    setTagCounts(counts)
    setMappingShares(shares)
    setBlueStarCount(blueStarTotal ?? 0)
    setCyrixCount(cyrixTotal ?? 0)
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // The seeded core columns are the fallback, so a table still renders if the
  // layout hasn't loaded yet rather than briefly showing no columns at all.
  const activeColumns = useMemo(() => {
    const forTab = columns.filter((c) => c.catalogue === tab)
    if (forTab.length > 0) return forTab
    return CORE_COLUMNS[tab].map((c, i) => ({
      catalogue: tab,
      key: c.key,
      label: c.label,
      source: 'core' as const,
      visible: true,
      sort_order: i * 10,
      created_at: '',
    }))
  }, [columns, tab])

  // The built-in columns always render; only the file's own columns answer
  // to the visibility the admin chose for them.
  const visibleColumns = useMemo(
    () => activeColumns.filter((c) => !isChoosable(c) || c.visible),
    [activeColumns]
  )

  // Master files get re-uploaded as they're revised, so a row that already
  // exists should be updated rather than rejected as a duplicate -- hence
  // upsert on item_code rather than a plain insert. Chunked so a very large
  // catalogue doesn't go over the request size limit in one shot.
  async function submitCyrixRows(
    rows: CyrixImportRow[],
    onProgress: (done: number, total: number) => void,
    ctx: ImportContext
  ): Promise<RowOutcome[]> {
    await rememberColumns('cyrix', ctx)
    const outcomes: RowOutcome[] = new Array(rows.length)
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE)
      const { error } = await supabase.from('cyrix_item_master').upsert(chunk, { onConflict: 'item_code' })
      fillOutcomes(outcomes, start, chunk.length, error?.message)
      onProgress(Math.min(start + CHUNK_SIZE, rows.length), rows.length)
    }
    await loadColumns()
    return outcomes
  }

  async function submitBlueStarRows(
    rows: BlueStarImportRow[],
    onProgress: (done: number, total: number) => void,
    ctx: ImportContext
  ): Promise<RowOutcome[]> {
    await rememberColumns('bluestar', ctx)
    const outcomes: RowOutcome[] = new Array(rows.length)
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE)
      const { error } = await supabase.from('bluestar_item_master').upsert(chunk, { onConflict: 'item_code' })
      fillOutcomes(outcomes, start, chunk.length, error?.message)
      onProgress(Math.min(start + CHUNK_SIZE, rows.length), rows.length)
    }
    await loadColumns()
    return outcomes
  }

  /**
   * Every column the catalogue holds, including the ones currently hidden.
   *
   * Export follows the table's order but not its visibility: a hidden column
   * is still data, and an export that quietly drops it is how a round-trip
   * through Excel loses a column nobody was watching.
   *
   * `cyrix_item`, `tagged` and `status` are left out, because none of them
   * is catalogue data -- all three are derived from which QR codes have been
   * tagged, so exporting them would produce a file that cannot be uploaded
   * back in.
   */
  const exportFields = useMemo(() => {
    const fields: { header: string; get: (row: Record<string, unknown>) => CellValue }[] = []
    for (const column of activeColumns) {
      if (COMPUTED_COLUMNS.has(column.key)) continue
      if (column.source === 'core') {
        fields.push({ header: column.key, get: (r) => (r[column.key] as CellValue) ?? '' })
      } else {
        fields.push({
          header: column.label,
          get: (r) => (r.attributes as Record<string, string> | null)?.[column.key] ?? '',
        })
      }
    }
    return fields
  }, [activeColumns])

  /**
   * Exports the whole catalogue, not just the page on screen -- and the whole
   * catalogue is far past what one request returns, so it's fetched in pages
   * and stitched together. The current search is applied, so a filtered view
   * exports what it shows.
   */
  async function handleExport() {
    setExporting(true)
    setExportDone(0)
    const term = search.trim()
    const pattern = `%${term}%`
    const EXPORT_PAGE = 1000
    const table = tab === 'bluestar' ? 'bluestar_item_master' : 'cyrix_item_master'

    const rows: CellValue[][] = []
    for (let from = 0; ; from += EXPORT_PAGE) {
      let q = supabase.from(table).select('*').order('item_code').range(from, from + EXPORT_PAGE - 1)
      if (term) {
        q =
          tab === 'bluestar'
            ? q.or(`item_code.ilike.${pattern},item_name.ilike.${pattern}`)
            : q.or(
                `item_code.ilike.${pattern},item_name.ilike.${pattern},additional_identifier.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern}`
              )
      }
      const { data } = await q
      const batch = data ?? []
      for (const r of batch) rows.push(exportFields.map((f) => f.get(r as Record<string, unknown>)))
      setExportDone(rows.length)
      if (batch.length < EXPORT_PAGE) break
    }

    const stamp = new Date().toISOString().slice(0, 10)
    downloadXlsx(
      tab === 'bluestar' ? `bluestar_item_master_${stamp}.xlsx` : `cyrix_item_master_${stamp}.xlsx`,
      exportFields.map((f) => f.header),
      rows,
      tab === 'bluestar' ? 'Blue Star items' : 'Cyrix items'
    )
    setExporting(false)
  }

  const pageRows: { id: string }[] = tab === 'bluestar' ? blueStarRows : cyrixRows
  const allPageSelected = pageRows.length > 0 && selected.length === pageRows.length

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAllOnPage() {
    setSelected(allPageSelected ? [] : pageRows.map((r) => r.id))
  }

  /**
   * Clears either the ticked rows or the whole catalogue.
   *
   * "All" cannot mean the rows on screen: this list pages a hundred at a time
   * through tens of thousands, so it means everything the current search
   * matches -- the same set the count beside the tab is reporting, and the
   * same set Export writes. The filter goes to the database rather than a
   * list of ids the browser would have to fetch first.
   */
  async function performBulkDelete() {
    setBulkBusy(true)
    setBulkError(null)
    const { data, error } = await supabase.rpc('delete_catalogue_rows', {
      p_catalogue: tab,
      p_search: bulkMode === 'all' ? search.trim() || null : null,
      p_ids: bulkMode === 'selected' ? selected : null,
    })
    setBulkBusy(false)
    if (error) {
      setBulkError(error.message)
      return
    }
    setBulkMode(null)
    setSelected([])
    // A page offset into a list that just shrank points at nothing.
    setPage(0)
    await load()
    await loadColumns()
    if (data === 0) setBulkError('Nothing was deleted.')
  }

  async function performDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from(confirmDelete.table).delete().eq('id', confirmDelete.id)
    setDeleting(false)
    setConfirmDelete(null)
    load()
  }

  const activeCount = tab === 'bluestar' ? blueStarCount : cyrixCount
  const shownCount = tab === 'bluestar' ? blueStarRows.length : cyrixRows.length
  const hiddenCount = activeColumns.length - visibleColumns.length

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8 lg:py-8">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Item masters</h1>
      <p className="mb-4 text-sm text-slate-500">
        Blue Star's catalogue is matched by the item code on the spare. Cyrix's is our own naming for the same parts.
        {!canEdit && ' Read-only — ask an admin to change anything here.'}
      </p>

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            { key: 'bluestar' as const, label: 'Blue Star item master', count: blueStarCount },
            { key: 'cyrix' as const, label: 'Cyrix item master', count: cyrixCount },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-normal text-slate-400">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Sized to a search term rather than to the window: it was
            stretching across the whole width and pushing every control to
            the far edge. On a phone it takes its own line and the buttons
            wrap beneath it. */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'bluestar' ? 'Search code or name…' : 'Search code, name, identifier, make, or model…'}
          className="min-w-0 basis-full sm:w-72 sm:basis-auto lg:w-96"
        />
        <span className="hidden flex-1 sm:block" />
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setColumnsOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ColumnsIcon className="h-4 w-4" />
              Columns
              {hiddenCount > 0 && <span className="text-xs font-normal text-slate-400">{hiddenCount} hidden</span>}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || activeCount === 0}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#107c41] px-3 py-2 text-sm font-medium text-white hover:bg-[#0e6b38] disabled:opacity-50"
            >
              {exporting ? <SpinnerIcon className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
              {exporting ? `${exportDone.toLocaleString('en-IN')}…` : 'Excel'}
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(tab)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-650"
            >
              <UploadIcon className="h-4 w-4" /> Upload
            </button>

            {/* One button, because ticking rows is what decides which of
                the two deletions is meant -- and the confirmation says
                plainly which one it is about to do. Filled while rows are
                ticked, outlined otherwise, so clearing the catalogue never
                looks like the ordinary thing to click.

                Admins only, and only ever admins: DELETE on both tables is
                restricted to is_admin() by RLS, and the function behind
                "delete all" checks it again because a definer function
                bypasses RLS. A project manager can read and upload, not
                clear. */}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setBulkMode(selected.length > 0 ? 'selected' : 'all')}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                  selected.length > 0
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-200 text-red-600 hover:bg-red-50'
                }`}
              >
                <TrashIcon className="h-4 w-4" />
                {selected.length > 0
                  ? `Delete ${selected.length}`
                  : search.trim()
                    ? 'Delete all matching'
                    : 'Delete all'}
              </button>
            )}
          </>
        )}
      </div>

      {bulkError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{bulkError}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400">
          <SpinnerIcon className="h-6 w-6" />
        </div>
      ) : activeCount === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
          {search ? 'No items match that search.' : 'Nothing uploaded yet — use Upload to import an Excel or CSV file.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  {canEdit && (
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAllOnPage}
                        className="h-4 w-4 accent-brand-700"
                        aria-label="Select every item on this page"
                      />
                    </th>
                  )}
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className={`whitespace-nowrap px-3 py-2 font-semibold ${
                        NUMERIC_COLUMNS.has(column.key) ? 'text-right' : ''
                      }`}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tab === 'bluestar'
                  ? blueStarRows.map((r) => (
                      <tr key={r.id}>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.includes(r.id)}
                              onChange={() => toggleRow(r.id)}
                              className="h-4 w-4 accent-brand-700"
                              aria-label={`Select ${r.item_code}`}
                            />
                          </td>
                        )}
                        {visibleColumns.map((column) => (
                          <td key={column.key} className={cellClass(column.key)}>
                            {blueStarCell(column.key, r, {
                              tagged: tagCounts.get(r.id) ?? 0,
                              shares: mappingShares.get(r.id) ?? [],
                              onOpenSplit: () => setSplitFor(r),
                            })}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => setHistoryFor(r)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              aria-label={`Mapping history for ${r.item_code}`}
                            >
                              <HistoryIcon className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => setConfirmDelete({ table: 'bluestar_item_master', id: r.id, label: `${r.item_code} · ${r.item_name}` })}
                                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                aria-label={`Delete ${r.item_code}`}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  : cyrixRows.map((r) => (
                      <tr key={r.id}>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.includes(r.id)}
                              onChange={() => toggleRow(r.id)}
                              className="h-4 w-4 accent-brand-700"
                              aria-label={`Select ${r.item_code}`}
                            />
                          </td>
                        )}
                        {visibleColumns.map((column) => (
                          <td key={column.key} className={cellClass(column.key)}>
                            {cyrixCell(column.key, r)}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {canEdit && (
                            <button
                              onClick={() =>
                                setConfirmDelete({
                                  table: 'cyrix_item_master',
                                  id: r.id,
                                  label: `${r.item_code} · ${r.item_name}`,
                                })
                              }
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Delete ${r.item_code}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {activeCount === 0
                ? 'No items'
                : `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + shownCount} of ${activeCount.toLocaleString('en-IN')}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= activeCount || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Next <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <BulkUploadModal<CyrixImportRow>
        open={bulkOpen === 'cyrix'}
        onClose={() => setBulkOpen(null)}
        title="Upload Cyrix item master"
        description="Our own catalogue — every column in the file is kept. Re-uploading updates items that already exist, matched on the item code."
        templateName="cyrix_item_master_template"
        templateHeaders={[
          'item_code',
          'item_name',
          'in_stock',
          'item_cost',
          'additional_identifier',
          'item_group',
          'parent_equipment',
          'make',
          'model',
        ]}
        templateSampleRows={[['I-100002', 'Everflo 230V OPI,Old Birt', '1', '0', '1020009', 'Philips', '', '', '']]}
        mappableFields={MAPPABLE_FIELDS.cyrix}
        parseRow={(raw, _line, ctx) => parseCyrixRow(raw, ctx)}
        submitRows={submitCyrixRows}
        onImported={load}
      />

      <BulkUploadModal<BlueStarImportRow>
        open={bulkOpen === 'bluestar'}
        onClose={() => setBulkOpen(null)}
        title="Upload Blue Star item master"
        description="Blue Star's catalogue — every column in the file is kept. Qty is what tagging progress is measured against; without it an item shows no status. Re-uploading updates items that already exist, matched on the item code."
        templateName="bluestar_item_master_template"
        templateHeaders={['item_code', 'item_name', 'quantity']}
        templateSampleRows={[['BS-5501', 'ABC Sensor Assembly', '4']]}
        mappableFields={MAPPABLE_FIELDS.bluestar}
        parseRow={(raw, _line, ctx) => parseBlueStarRow(raw, ctx)}
        submitRows={submitBlueStarRows}
        onImported={load}
      />

      {columnsOpen && (
        <ColumnChooserDialog
          columns={activeColumns}
          onClose={() => setColumnsOpen(false)}
          onSaved={loadColumns}
        />
      )}

      {historyFor && <MappingHistoryDialog item={historyFor} onClose={() => setHistoryFor(null)} />}

      {splitFor && (
        <MappingSplitDialog
          itemCode={splitFor.item_code}
          itemName={splitFor.item_name}
          shares={mappingShares.get(splitFor.id) ?? []}
          onClose={() => setSplitFor(null)}
        />
      )}

      {/* Two different scales of damage, so two different messages. Deleting
          the ticked rows is bounded by what is on screen; clearing a whole
          catalogue is tens of thousands of rows that only a re-upload brings
          back, so that one has to be typed out. */}
      <ConfirmDialog
        open={bulkMode === 'selected'}
        title={`Delete ${selected.length} selected item${selected.length === 1 ? '' : 's'}?`}
        message={
          tab === 'bluestar'
            ? 'Spares already tagged against them stay, but stop counting towards any item until the master file is uploaded again. Their mapping history goes with them.'
            : 'Spares keep the Cyrix code they were mapped to. Lookups and match suggestions will no longer find these items.'
        }
        confirmLabel={bulkBusy ? 'Deleting…' : 'Delete'}
        busy={bulkBusy}
        onConfirm={performBulkDelete}
        onCancel={() => setBulkMode(null)}
      />

      <ConfirmDialog
        open={bulkMode === 'all'}
        title={
          search.trim()
            ? `Delete all ${activeCount.toLocaleString('en-IN')} item${
                activeCount === 1 ? '' : 's'
              } matching “${search.trim()}”?`
            : `Delete the entire ${tab === 'bluestar' ? 'Blue Star' : 'Cyrix'} item master?`
        }
        message={`${activeCount.toLocaleString('en-IN')} item${activeCount === 1 ? '' : 's'} will be removed. ${
          tab === 'bluestar'
            ? 'Spares already tagged against them stay, but stop counting towards any item until the master file is uploaded again.'
            : 'Spares keep the Cyrix code they were mapped to, but lookups and match suggestions will find nothing.'
        } This can't be undone — the only way back is to upload the file again.`}
        confirmText={search.trim() ? undefined : 'DELETE'}
        confirmLabel={bulkBusy ? 'Deleting…' : 'Delete all'}
        busy={bulkBusy}
        onConfirm={performBulkDelete}
        onCancel={() => setBulkMode(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this item?"
        message={`${confirmDelete?.label ?? ''} — this removes it from the catalogue. Re-uploading the master file will bring it back.`}
        busy={deleting}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
