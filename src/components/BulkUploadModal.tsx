import { useRef, useState } from 'react'
import { UploadIcon, DownloadIcon, SpinnerIcon, CheckIcon, XIcon, AlertIcon } from './icons'
import { readTable } from '../lib/importFile'
import { downloadXlsx } from '../lib/xlsx'
import { detectMapping, extraHeaders, type FieldMapping, type MappableField } from '../lib/catalogueColumns'

export interface RowOutcome {
  status: 'ok' | 'error'
  message: string
}

/** What the file turned out to contain, handed to the caller's row parser. */
export interface ImportContext {
  /** Header labels in column order, exactly as the file spells them. */
  headers: string[]
  /** Field key -> header it reads from. Empty unless `mappableFields` is set. */
  mapping: FieldMapping
}

interface ParsedRow<T> {
  line: number
  data?: T
  error?: string
}

const NOT_PRESENT = '__none__'

/**
 * Generic bulk-import dialog: download a template, pick a file, see how its
 * columns were read, see client-side validation per row, import, then see a
 * per-row result list.
 *
 * Callers own the row shape (T) via parseRow, and own how rows actually get
 * submitted (one atomic insert, one call per row, whatever fits) via
 * submitRows -- it just has to return exactly one outcome per row it was
 * given, in the same order.
 *
 * Both .xlsx and .csv are accepted. Excel is where these files are actually
 * maintained, so requiring a CSV was asking for a conversion step that can
 * quietly drop the leading zero off a part number.
 */
export function BulkUploadModal<T>({
  open,
  onClose,
  title,
  description,
  templateName,
  templateHeaders,
  templateSampleRows = [],
  mappableFields,
  parseRow,
  submitRows,
  onImported,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  /** Filename for the template download, without an extension. */
  templateName: string
  templateHeaders: string[]
  templateSampleRows?: string[][]
  /**
   * Fields the caller wants matched to columns by meaning rather than by
   * exact header text. Set this and the dialog shows what it matched and
   * lets the admin correct it; leave it off and headers are read verbatim.
   */
  mappableFields?: MappableField[]
  parseRow: (raw: Record<string, string>, line: number, ctx: ImportContext) => { data: T } | { error: string }
  submitRows: (
    rows: T[],
    onProgress: (done: number, total: number) => void,
    ctx: ImportContext
  ) => Promise<RowOutcome[]>
  onImported?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [raw, setRaw] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<(RowOutcome & { line: number })[] | null>(null)

  if (!open) return null

  function reset() {
    setFileName(null)
    setReadError(null)
    setReading(false)
    setRaw(null)
    setMapping({})
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
    setReadError(null)
    setRaw(null)
    setReading(true)
    try {
      const table = await readTable(file)
      if (table.headers.length === 0) throw new Error('That file has no columns in it.')
      setRaw(table)
      setMapping(mappableFields ? detectMapping(table.headers, mappableFields) : {})
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'That file could not be read.')
    } finally {
      setReading(false)
    }
  }

  // Rows are re-parsed on each render rather than stored, because changing one
  // dropdown in the mapping changes the validity of every row.
  const ctx: ImportContext = { headers: raw?.headers ?? [], mapping }
  const missingRequired = (mappableFields ?? []).filter((f) => f.required && !mapping[f.key])
  const parsed: ParsedRow<T>[] | null =
    raw && missingRequired.length === 0
      ? raw.rows.map((row, i) => {
          const line = i + 2 // row 1 is the header
          const outcome = parseRow(row, line, ctx)
          return 'error' in outcome ? { line, error: outcome.error } : { line, data: outcome.data }
        })
      : null

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
    const rowResults = await submitRows(validRows, (done, total) => setProgress({ done, total }), ctx)
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
  const extras = raw && mappableFields ? extraHeaders(raw.headers, mapping) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col animate-pop-in rounded-2xl bg-surface shadow-xl"
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
            onClick={() => downloadXlsx(`${templateName}.xlsx`, templateHeaders, templateSampleRows, 'Template')}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <DownloadIcon className="h-4 w-4" /> Download Excel template
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {reading ? <SpinnerIcon className="h-4 w-4" /> : <UploadIcon className="h-4 w-4" />}
            {fileName ?? 'Choose an Excel or CSV file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          {readError && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {readError}
            </p>
          )}

          {/* How the file's columns were read. Shown above the row counts
              because a wrong guess here is what makes every row fail, and the
              fix is a dropdown rather than editing the sheet and starting over. */}
          {raw && mappableFields && !results && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {raw.headers.length} column{raw.headers.length === 1 ? '' : 's'} found
              </p>
              <div className="space-y-2">
                {mappableFields.map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 text-slate-600">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </span>
                    <select
                      value={mapping[field.key] ?? NOT_PRESENT}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [field.key]: e.target.value === NOT_PRESENT ? null : e.target.value,
                        }))
                      }
                      className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm ${
                        field.required && !mapping[field.key]
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : 'border-slate-300 bg-surface text-slate-900'
                      }`}
                    >
                      <option value={NOT_PRESENT}>— not in this file —</option>
                      {raw.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {extras.length > 0 && (
                <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <strong className="font-medium text-slate-700">
                    {extras.length} other column{extras.length === 1 ? '' : 's'}
                  </strong>{' '}
                  kept as they are: {extras.slice(0, 6).join(', ')}
                  {extras.length > 6 && `, +${extras.length - 6} more`}. They're stored but start hidden — use{' '}
                  <span className="font-medium text-slate-700">Columns</span> to pick which ones the table shows.
                </p>
              )}

              {missingRequired.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Pick a column for {missingRequired.map((f) => f.label).join(' and ')} before importing.
                </p>
              )}
            </div>
          )}

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
              className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-on-brand disabled:opacity-60"
            >
              {submitting && <SpinnerIcon className="h-4 w-4" />}
              {submitting && progress
                ? `Importing ${progress.done}/${progress.total}…`
                : validCount > 0
                  ? `Import ${validCount} row${validCount === 1 ? '' : 's'}`
                  : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
