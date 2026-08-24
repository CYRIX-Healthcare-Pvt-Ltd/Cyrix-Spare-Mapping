import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { UploadIcon, SearchIcon, SpinnerIcon } from '../../components/icons'
import { BulkUploadModal, type RowOutcome } from '../../components/BulkUploadModal'
import type { BplItemRow, CyrixItemRow } from '../../types/app'

type Tab = 'bpl' | 'cyrix'

interface CyrixImportRow {
  item_code: string
  item_name: string
}

interface BplImportRow {
  item_code: string
  item_name: string
  barcode: string | null
  cyrix_item_code: string | null
  cyrix_item_name: string | null
}

function parseCyrixRow(raw: Record<string, string>): { data: CyrixImportRow } | { error: string } {
  const item_code = raw.item_code?.trim()
  const item_name = raw.item_name?.trim()
  if (!item_code) return { error: 'item_code is required' }
  if (!item_name) return { error: 'item_name is required' }
  return { data: { item_code, item_name } }
}

function parseBplRow(raw: Record<string, string>): { data: BplImportRow } | { error: string } {
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
  const [tab, setTab] = useState<Tab>('bpl')
  const [bplRows, setBplRows] = useState<BplItemRow[]>([])
  const [cyrixRows, setCyrixRows] = useState<CyrixItemRow[]>([])
  const [bplCount, setBplCount] = useState(0)
  const [cyrixCount, setCyrixCount] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [bulkOpen, setBulkOpen] = useState<Tab | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const term = search.trim()

    // Search runs server-side: these catalogues can be many thousands of rows,
    // so filtering a fully-downloaded list in the browser isn't viable.
    let bplQuery = supabase.from('bpl_item_master').select('*', { count: 'exact' }).order('item_code').limit(PAGE_SIZE)
    let cyrixQuery = supabase.from('cyrix_item_master').select('*', { count: 'exact' }).order('item_code').limit(PAGE_SIZE)
    if (term) {
      const pattern = `%${term}%`
      bplQuery = bplQuery.or(`item_code.ilike.${pattern},item_name.ilike.${pattern},barcode.ilike.${pattern}`)
      cyrixQuery = cyrixQuery.or(`item_code.ilike.${pattern},item_name.ilike.${pattern}`)
    }

    const [{ data: bpl, count: bplTotal }, { data: cyrix, count: cyrixTotal }] = await Promise.all([bplQuery, cyrixQuery])

    setBplRows(bpl ?? [])
    setCyrixRows(cyrix ?? [])
    setBplCount(bplTotal ?? 0)
    setCyrixCount(cyrixTotal ?? 0)
    setLoading(false)
  }, [search])

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

  async function submitBplRows(
    rows: BplImportRow[],
    onProgress: (done: number, total: number) => void
  ): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = new Array(rows.length)
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE)
      const { error } = await supabase.from('bpl_item_master').upsert(chunk, { onConflict: 'item_code' })
      fillOutcomes(outcomes, start, chunk.length, error?.message)
      onProgress(Math.min(start + CHUNK_SIZE, rows.length), rows.length)
    }
    return outcomes
  }

  const activeCount = tab === 'bpl' ? bplCount : cyrixCount
  const shownCount = tab === 'bpl' ? bplRows.length : cyrixRows.length

  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:max-w-none sm:px-6 lg:px-8">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Item masters</h1>
      <p className="mb-4 text-sm text-slate-500">
        BPL's catalogue is matched by the barcode already on the spare. Cyrix's is our own naming for the same parts.
      </p>

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            { key: 'bpl' as const, label: 'BPL item master', count: bplCount },
            { key: 'cyrix' as const, label: 'Cyrix item master', count: cyrixCount },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-normal text-slate-400">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'bpl' ? 'Search code, name, or barcode…' : 'Search code or name…'}
            className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setBulkOpen(tab)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
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
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Item code</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Item name</th>
                  {tab === 'bpl' && (
                    <>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Barcode</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Cyrix item</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tab === 'bpl'
                  ? bplRows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">{r.item_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.item_name}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{r.barcode ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.cyrix_item_code ? (
                            <span>
                              <span className="font-mono text-xs text-slate-500">{r.cyrix_item_code}</span>
                              {r.cyrix_item_name && ` · ${r.cyrix_item_name}`}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Not mapped
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  : cyrixRows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">{r.item_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.item_name}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {activeCount > shownCount && (
            <p className="mt-2 text-center text-xs text-slate-400">
              Showing {shownCount} of {activeCount} — search to narrow it down.
            </p>
          )}
        </>
      )}

      <BulkUploadModal<CyrixImportRow>
        open={bulkOpen === 'cyrix'}
        onClose={() => setBulkOpen(null)}
        title="Upload Cyrix item master"
        description="Our own catalogue. Re-uploading updates items that already exist, matched on item_code."
        templateFilename="cyrix_item_master_template.csv"
        templateHeaders={['item_code', 'item_name']}
        templateSampleRows={[['CYX-1001', 'Ab -C Sensor Assembly']]}
        parseRow={(raw) => parseCyrixRow(raw)}
        submitRows={submitCyrixRows}
        onImported={load}
      />

      <BulkUploadModal<BplImportRow>
        open={bulkOpen === 'bpl'}
        onClose={() => setBulkOpen(null)}
        title="Upload BPL item master"
        description="BPL's catalogue, including the barcode printed on each spare. Re-uploading updates items that already exist, matched on item_code. The Cyrix columns are optional — leave them blank to map later."
        templateFilename="bpl_item_master_template.csv"
        templateHeaders={['item_code', 'item_name', 'barcode', 'cyrix_item_code', 'cyrix_item_name']}
        templateSampleRows={[['BPL-5501', 'ABC Sensor Assembly', '8901234567890', '', '']]}
        parseRow={(raw) => parseBplRow(raw)}
        submitRows={submitBplRows}
        onImported={load}
      />
    </div>
  )
}
