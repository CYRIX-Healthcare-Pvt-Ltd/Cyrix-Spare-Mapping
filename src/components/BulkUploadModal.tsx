import { useRef, useState } from 'react'
import { UploadIcon, DownloadIcon, SpinnerIcon, CheckIcon, XIcon, AlertIcon } from './icons'
import { parseCsv, buildCsvTemplate, downloadCsv } from '../lib/csv'

export interface RowOutcome {
  status: 'ok' | 'error'
  message: string
}

interface ParsedRow<T> {
  line: number
  data?: T
  error?: string
}

/**
 * Generic CSV bulk-import dialog: download a template, pick a file, see
 * client-side validation per row, import, then see a per-row result list.
 * Callers own the row shape (T) via parseRow, and own how rows actually get
 * submitted (one atomic insert, one call per row, whatever fits) via
 * submitRows -- it just has to return exactly one outcome per row it was
 * given, in the same order.
 */
export function BulkUploadModal<T>({
  open,
  onClose,
  title,
  description,
  templateFilename,
  templateHeaders,
  templateSampleRows = [],
  parseRow,
  submitRows,
  onImported,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  templateFilename: string
  templateHeaders: string[]
  templateSampleRows?: string[][]
  parseRow: (raw: Record<string, string>, line: number) => { data: T } | { error: string }
  submitRows: (rows: T[], onProgress: (done: number, total: number) => void) => Promise<RowOutcome[]>
  onImported?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedRow<T>[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<(RowOutcome & { line: number })[] | null>(null)

  if (!open) return null

  function reset() {
    setFileName(null)
    setParsed(null)
    setSubmitting(false)
    setProgress(null)
    setResults(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setResults(null)
    const text = await file.text()
    const rawRows = parseCsv(text)
    setParsed(
      rawRows.map((raw, i) => {
        const line = i + 2 // row 1 is the header
        const outcome = parseRow(raw, line)
        return 'error' in outcome ? { line, error: outcome.error } : { line, data: outcome.data }
      })
    )
  }

  async function handleImport() {
    if (!parsed) return
    const validIndices: number[] = []
    const validRows: T[] = []
    parsed.forEach((r, i) => {
      if (r.data !== undefined) {
        validIndices.push(i)
        validRows.push(r.data)
      }
    })
    if (validRows.length === 0) return

    setSubmitting(true)
    setProgress({ done: 0, total: validRows.length })
    const rowResults = await submitRows(validRows, (done, total) => setProgress({ done, total }))
    setSubmitting(false)

    setResults(
      parsed.map((r, i) => {
        if (r.error) return { line: r.line, status: 'error', message: r.error }
        const pos = validIndices.indexOf(i)
        const outcome = rowResults[pos]
        return outcome ? { line: r.line, ...outcome } : { line: r.line, status: 'error', message: 'Not submitted' }
      })
    )
    onImported?.()
  }

  const validCount = parsed?.filter((r) => r.data !== undefined).length ?? 0
  const errorCount = parsed?.filter((r) => r.error).length ?? 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={handleClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col animate-pop-in rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <button
            type="button"
            onClick={() => downloadCsv(templateFilename, buildCsvTemplate(templateHeaders, templateSampleRows))}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <DownloadIcon className="h-4 w-4" /> Download CSV template
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <UploadIcon className="h-4 w-4" /> {fileName ?? 'Choose a CSV file to upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          {parsed && !results && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-700">
                {parsed.length} row{parsed.length === 1 ? '' : 's'} found — <strong className="text-emerald-700">{validCount} ready</strong>
                {errorCount > 0 && (
                  <>
                    {', '}
                    <strong className="text-red-600">{errorCount} with errors</strong>
                  </>
                )}
              </p>
              {errorCount > 0 && (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
                  {parsed
                    .filter((r) => r.error)
                    .map((r) => (
                      <li key={r.line}>
                        Line {r.line}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {results && (
            <div className="rounded-lg border border-slate-200">
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                {results.map((r) => (
                  <li key={r.line} className="flex items-start gap-2 px-3 py-2">
                    {r.status === 'ok' ? (
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    )}
                    <span className={r.status === 'ok' ? 'text-slate-700' : 'text-red-600'}>
                      Line {r.line}: {r.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {results ? 'Done' : 'Cancel'}
          </button>
          {!results && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!parsed || validCount === 0 || submitting}
              className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting && <SpinnerIcon className="h-4 w-4" />}
              {submitting && progress ? `Importing ${progress.done}/${progress.total}…` : `Import ${validCount || ''} row${validCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
