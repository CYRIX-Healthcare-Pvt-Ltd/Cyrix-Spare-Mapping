import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { UploadIcon, DownloadIcon, SpinnerIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from '../../components/icons'
import { BulkUploadModal, type RowOutcome } from '../../components/BulkUploadModal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CyrixPickerDialog } from '../../components/CyrixPickerDialog'
import { MappingHistoryDialog } from '../../components/MappingHistoryDialog'
import { downloadXlsx, type CellValue } from '../../lib/xlsx'
import type { BlueStarItemRow, CyrixItemRow } from '../../types/app'
import { SearchInput } from '../../components/SearchInput'

type Tab = 'bluestar' | 'cyrix'

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
}

interface BlueStarImportRow {
  item_code: string
  item_name: string
  barcode: string | null
  cyrix_item_code: string | null
  cyrix_item_name: string | null
}

function parseNumber(value: string | undefined): { ok: true; value: number | null } | { ok: false } {
  const clean = value?.trim()
  if (!clean) return { ok: true, value: null }
  const n = Number(clean.replace(/,/g, ''))
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false }
}

function parseCyrixRow(raw: Record<string, string>): { data: CyrixImportRow } | { error: string } {
  const item_code = raw.item_code?.trim()
  const item_name = raw.item_name?.trim()
  if (!item_code) return { error: 'item_code is required' }
  if (!item_name) return { error: 'item_name is required' }

  const in_stock = parseNumber(raw.in_stock)
  if (!in_stock.ok) return { error: `Invalid in_stock "${raw.in_stock}"` }
  const item_cost = parseNumber(raw.item_cost)
  if (!item_cost.ok) return { error: `Invalid item_cost "${raw.item_cost}"` }

  return {
    data: {
      item_code,
      item_name,
      in_stock: in_stock.value,
      item_cost: item_cost.value,
      additional_identifier: raw.additional_identifier?.trim() || null,
      item_group: raw.item_group?.trim() || null,
      parent_equipment: raw.parent_equipment?.trim() || null,
      make: raw.make?.trim() || null,
      model: raw.model?.trim() || null,
    },
  }
}

function parseBlueStarRow(raw: Record<string, string>): { data: BlueStarImportRow } | { error: string } {
  const item_code = raw.item_code?.trim()
  const item_name = raw.item_name?.trim()
  if (!item_code) return { error: 'item_code is required' }
  if (!item_name) return { error: 'item_name is required' }
  return {
    data: {
      item_code,
      item_name,
      barcode: raw.barcode?.trim() || null,
      cyrix_item_code: raw.cyrix_item_code?.trim() || null,
      cyrix_item_name: raw.cyrix_item_name?.trim() || null,
    },
  }
}

const PAGE_SIZE = 100
const CHUNK_SIZE = 500

function fillOutcomes(outcomes: RowOutcome[], start: number, length: number, errorMessage?: string) {
  for (let i = 0; i < length; i++) {
    outcomes[start + i] = errorMessage ? { status: 'error', message: errorMessage } : { status: 'ok', message: 'Saved' }
  }
}

export default function ItemMasters() {
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
  const [mappingFor, setMappingFor] = useState<BlueStarItemRow | null>(null)
  const [historyFor, setHistoryFor] = useState<BlueStarItemRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(0)

  // A new search or tab has its own result set, so any page offset from the
  // previous one is meaningless -- and page 3 of a 2-page result renders empty.
  useEffect(() => {
    setPage(0)
  }, [search, tab])

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
      blueStarQuery = blueStarQuery.or(`item_code.ilike.${pattern},item_name.ilike.${pattern},barcode.ilike.${pattern}`)
      cyrixQuery = cyrixQuery.or(
        `item_code.ilike.${pattern},item_name.ilike.${pattern},additional_identifier.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern}`
      )
    }

    const [{ data: blueStar, count: blueStarTotal }, { data: cyrix, count: cyrixTotal }] = await Promise.all([blueStarQuery, cyrixQuery])

    setBlueStarRows(blueStar ?? [])
    setCyrixRows(cyrix ?? [])
    setBlueStarCount(blueStarTotal ?? 0)
    setCyrixCount(cyrixTotal ?? 0)
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // Master files get re-uploaded as they're revised, so a row that already
  // exists should be updated rather than rejected as a duplicate -- hence
  // upsert on item_code rather than a plain insert. Chunked so a very large
  // catalogue doesn't go over the request size limit in one shot.
  async function submitCyrixRows(
    rows: CyrixImportRow[],
    onProgress: (done: number, total: number) => void
  ): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = new Array(rows.length)
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE)
      const { error } = await supabase.from('cyrix_item_master').upsert(chunk, { onConflict: 'item_code' })
      fillOutcomes(outcomes, start, chunk.length, error?.message)
      onProgress(Math.min(start + CHUNK_SIZE, rows.length), rows.length)
    }
    return outcomes
  }

  async function submitBlueStarRows(
    rows: BlueStarImportRow[],
    onProgress: (done: number, total: number) => void
  ): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = new Array(rows.length)
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE)
      const { error } = await supabase.from('bluestar_item_master').upsert(chunk, { onConflict: 'item_code' })
      fillOutcomes(outcomes, start, chunk.length, error?.message)
      onProgress(Math.min(start + CHUNK_SIZE, rows.length), rows.length)
    }
    return outcomes
  }

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

    const rows: CellValue[][] = []
    for (let from = 0; ; from += EXPORT_PAGE) {
      if (tab === 'bluestar') {
        let q = supabase.from('bluestar_item_master').select('*').order('item_code').range(from, from + EXPORT_PAGE - 1)
        if (term) q = q.or(`item_code.ilike.${pattern},item_name.ilike.${pattern},barcode.ilike.${pattern}`)
        const { data } = await q
        const batch = data ?? []
        for (const r of batch) {
          rows.push([r.item_code, r.item_name, r.barcode, r.cyrix_item_code, r.cyrix_item_name])
        }
        setExportDone(rows.length)
        if (batch.length < EXPORT_PAGE) break
      } else {
        let q = supabase.from('cyrix_item_master').select('*').order('item_code').range(from, from + EXPORT_PAGE - 1)
        if (term) {
          q = q.or(
            `item_code.ilike.${pattern},item_name.ilike.${pattern},additional_identifier.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern}`
          )
        }
        const { data } = await q
        const batch = data ?? []
        for (const r of batch) {
          rows.push([
            r.item_code,
            r.item_name,
            r.in_stock,
            r.item_cost,
            r.additional_identifier,
            r.item_group,
            r.parent_equipment,
            r.make,
            r.model,
          ])
        }
        setExportDone(rows.length)
        if (batch.length < EXPORT_PAGE) break
      }
    }

    const headers =
      tab === 'bluestar'
        ? ['item_code', 'item_name', 'barcode', 'cyrix_item_code', 'cyrix_item_name']
        : [
            'item_code',
            'item_name',
            'in_stock',
            'item_cost',
            'additional_identifier',
            'item_group',
            'parent_equipment',
            'make',
            'model',
          ]

    const stamp = new Date().toISOString().slice(0, 10)
    downloadXlsx(
      tab === 'bluestar' ? `bluestar_item_master_${stamp}.xlsx` : `cyrix_item_master_${stamp}.xlsx`,
      headers,
      rows,
      tab === 'bluestar' ? 'Blue Star items' : 'Cyrix items'
    )
    setExporting(false)
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

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8 lg:py-8">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Item masters</h1>
      <p className="mb-4 text-sm text-slate-500">
        Blue Star's catalogue is matched by the barcode already on the spare. Cyrix's is our own naming for the same parts.
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

      <div className="mb-4 flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'bluestar' ? 'Search code, name, or barcode…' : 'Search code, name, identifier, make, or model…'}
          className="flex-1"
        />
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
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400">
          <SpinnerIcon className="h-6 w-6" />
        </div>
      ) : activeCount === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
          {search ? 'No items match that search.' : 'Nothing uploaded yet — use Upload to import a CSV.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Item code</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Item name</th>
                  {tab === 'bluestar' ? (
                    <>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Barcode</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Cyrix item</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Source</th>
                    </>
                  ) : (
                    <>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">In stock</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Item cost</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Addl. identifier</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Item group</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Parent equip</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Make</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Model</th>
                    </>
                  )}
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tab === 'bluestar'
                  ? blueStarRows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-sm text-slate-600">{r.item_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.item_name}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-sm text-slate-500">{r.barcode ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <button
                            onClick={() => setMappingFor(r)}
                            className="rounded-lg px-1.5 py-0.5 text-left hover:bg-slate-100"
                            aria-label={`Change Cyrix mapping for ${r.item_code}`}
                          >
                            {r.cyrix_item_code ? (
                              <span>
                                <span className="tabular-nums text-sm text-slate-500">{r.cyrix_item_code}</span>
                                {r.cyrix_item_name && ` · ${r.cyrix_item_name}`}
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                                Not mapped
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {/* Where the row came from: Blue Star's own master
                              file, or a spare tagged in this app. */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.origin === 'tagged' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.origin === 'tagged' ? 'Tagged' : 'Uploaded'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => setHistoryFor(r)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              aria-label={`Mapping history for ${r.item_code}`}
                            >
                              <HistoryIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ table: 'bluestar_item_master', id: r.id, label: `${r.item_code} · ${r.item_name}` })}
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Delete ${r.item_code}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))
                  : cyrixRows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-sm text-slate-600">{r.item_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.item_name}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              (r.in_stock ?? 0) > 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'
                            }`}
                          >
                            {r.in_stock ?? 0}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                          {r.item_cost == null ? '—' : r.item_cost.toLocaleString('en-IN')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-sm text-slate-500">
                          {r.additional_identifier ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.item_group ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.parent_equipment ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.make ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.model ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setConfirmDelete({ table: 'cyrix_item_master', id: r.id, label: `${r.item_code} · ${r.item_name}` })}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Delete ${r.item_code}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
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
        description="Our own catalogue — columns A to I of the item master workbook. Re-uploading updates items that already exist, matched on item_code."
        templateFilename="cyrix_item_master_template.csv"
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
        templateSampleRows={[
          ['I-100002', 'Everflo 230V OPI,Old Birt', '1', '0', '1020009', 'Philips', '', '', ''],
        ]}
        parseRow={(raw) => parseCyrixRow(raw)}
        submitRows={submitCyrixRows}
        onImported={load}
      />

      <BulkUploadModal<BlueStarImportRow>
        open={bulkOpen === 'bluestar'}
        onClose={() => setBulkOpen(null)}
        title="Upload Blue Star item master"
        description="Blue Star's catalogue, including the barcode printed on each spare. Re-uploading updates items that already exist, matched on item_code. The Cyrix columns are optional — leave them blank to map later."
        templateFilename="bluestar_item_master_template.csv"
        templateHeaders={['item_code', 'item_name', 'barcode', 'cyrix_item_code', 'cyrix_item_name']}
        templateSampleRows={[['BS-5501', 'ABC Sensor Assembly', '8901234567890', '', '']]}
        parseRow={(raw) => parseBlueStarRow(raw)}
        submitRows={submitBlueStarRows}
        onImported={load}
      />

      {mappingFor && (
        <CyrixPickerDialog
          item={mappingFor}
          onClose={() => setMappingFor(null)}
          onMapped={(updated) =>
            setBlueStarRows((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
          }
        />
      )}

      {historyFor && <MappingHistoryDialog item={historyFor} onClose={() => setHistoryFor(null)} />}

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
