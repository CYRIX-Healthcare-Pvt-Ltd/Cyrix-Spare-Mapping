/**
 * Minimal .xlsx reader -- the counterpart to the writer in `xlsx.ts`.
 *
 * Admins maintain these master files in Excel, so asking them to "save as CSV
 * first" is a step that can go wrong: it drops every sheet but one, it mangles
 * a part number like 0012 into 12, and whether the columns even split depends
 * on the machine's list-separator locale. Reading the workbook directly avoids
 * all three.
 *
 * An .xlsx is a ZIP of XML parts. Unlike the writer -- which stores its
 * entries uncompressed so it needs no DEFLATE -- anything Excel produces is
 * deflated, so this side has to inflate. The browser already does that in
 * DecompressionStream, so there is still no library.
 *
 * Not handled, deliberately: the old binary .xls format, which shares nothing
 * with this one and would be a far larger job than the number of people still
 * sending .xls files justifies. Those get a message telling them to re-save.
 */

/* ------------------------------------------------------------------ zip --- */

/**
 * Reads the ZIP central directory rather than walking local headers, because
 * a local header is allowed to defer its sizes to a trailing data descriptor
 * (bit 3 of the flags) and then carry zeroes -- the central directory always
 * has the real ones.
 */
async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // The end-of-central-directory record sits at the very end, after a comment
  // of up to 64KB, so it is found by scanning backwards for its signature.
  let eocd = -1
  const lowest = Math.max(0, bytes.length - 0xffff - 22)
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('That file is not a valid .xlsx workbook.')

  const entryCount = view.getUint16(eocd + 10, true)
  let pointer = view.getUint32(eocd + 16, true)

  const decoder = new TextDecoder()
  const parts = new Map<string, Uint8Array>()

  for (let i = 0; i < entryCount; i++) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))

    // The local header repeats the name and extra fields, and its extra-field
    // length is allowed to differ from the central one, so where the data
    // starts has to be computed from the local header rather than assumed.
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) {
      parts.set(name, raw)
    } else if (method === 8) {
      parts.set(name, await inflateRaw(raw))
    }
    // Any other method (bzip2, LZMA...) is not something Excel emits; such an
    // entry is skipped rather than failing the whole workbook.

    pointer += 46 + nameLength + extraLength + commentLength
  }

  return parts
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open .xlsx files. Save the sheet as CSV and upload that instead.')
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/* ------------------------------------------------------------------ xml --- */

function parseXml(bytes: Uint8Array | undefined): Document | null {
  if (!bytes) return null
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  return doc.querySelector('parsererror') ? null : doc
}

/** Elements by local name, so the various namespace prefixes do not matter. */
function tags(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name)
}

/* -------------------------------------------------------------- numbers --- */

// Excel's built-in date and time formats. Anything in this set means the
// number in the cell is a date serial rather than a quantity.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

/**
 * Which cell styles format their number as a date.
 *
 * A date in a spreadsheet is just a number -- 45678 -- and only the style says
 * otherwise. Without this, a "Received on" column imports as five-digit
 * integers, which looks like data but is not.
 */
function dateStyles(styles: Document | null): Set<number> {
  if (!styles) return new Set()

  const dateFormatIds = new Set(BUILTIN_DATE_FORMATS)
  for (const fmt of tags(styles, 'numFmt')) {
    const id = Number(fmt.getAttribute('numFmtId'))
    const code = fmt.getAttribute('formatCode') ?? ''
    // Quoted literals and colour/condition blocks come out first, so a format
    // like 0.00 "days" is not read as a date because of the "d".
    const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
    if (/[ymdhs]/i.test(bare)) dateFormatIds.add(id)
  }

  const cellXfs = tags(styles, 'cellXfs')[0]
  if (!cellXfs) return new Set()

  const result = new Set<number>()
  tags(cellXfs, 'xf').forEach((xf, index) => {
    if (dateFormatIds.has(Number(xf.getAttribute('numFmtId') ?? 0))) result.add(index)
  })
  return result
}

/**
 * Excel serial to an ISO date.
 *
 * Serial 1 is 1900-01-01, but Excel also believes 1900 was a leap year, so
 * from serial 60 onwards every value is one further along than a real day
 * count would put it -- hence the shift. Workbooks saved by old Mac Excel
 * count from 1904 instead and say so in workbook.xml.
 */
function serialToIso(serial: number, epoch1904: boolean): string {
  const shifted = epoch1904 ? serial + 1462 : serial
  const days = shifted < 60 ? shifted : shifted - 1
  const date = new Date(Math.round((days - 25569) * 86400 * 1000))
  if (Number.isNaN(date.getTime())) return String(serial)

  const iso = date.toISOString()
  // A whole-day serial has no time worth showing; a fractional one does.
  return Number.isInteger(shifted) ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
}

/* ---------------------------------------------------------------- cells --- */

/** "BC12" -> 54. The row part is ignored; only the column letters matter. */
function columnIndex(ref: string): number {
  let n = 0
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

function columnLetter(index: number): string {
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

function sharedStringsOf(doc: Document | null): string[] {
  if (!doc) return []
  return tags(doc, 'si').map((si) => {
    // Phonetic guides are a pronunciation aid stored alongside the text, not
    // part of it; leaving them in doubles up every CJK string.
    for (const ruby of [...tags(si, 'rPh'), ...tags(si, 'phoneticPr')]) ruby.remove()
    return tags(si, 't')
      .map((t) => t.textContent ?? '')
      .join('')
  })
}

function cellText(cell: Element, shared: string[], dateStyleIndexes: Set<number>, epoch1904: boolean): string {
  const type = cell.getAttribute('t')

  if (type === 'inlineStr') {
    return tags(cell, 't')
      .map((t) => t.textContent ?? '')
      .join('')
      .trim()
  }

  const raw = tags(cell, 'v')[0]?.textContent ?? ''
  if (raw === '') return ''

  if (type === 's') return (shared[Number(raw)] ?? '').trim()
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE'
  // 'e' is a formula error such as #REF!; 'str' is a formula's string result.
  if (type === 'e' || type === 'str') return raw.trim()

  const numeric = Number(raw)
  if (Number.isFinite(numeric) && dateStyleIndexes.has(Number(cell.getAttribute('s') ?? -1))) {
    return serialToIso(numeric, epoch1904)
  }
  return raw.trim()
}

/* --------------------------------------------------------------- public --- */

export interface SheetTable {
  /** Header labels exactly as they read in the sheet, in column order. */
  headers: string[]
  /** One record per non-empty row, keyed by header. */
  rows: Record<string, string>[]
}

/**
 * Headers have to be unique to key a record by, but a real sheet will happily
 * carry two columns called "Remarks" -- or an empty header above a column that
 * still holds data. Both get a usable name rather than being dropped, since
 * dropping them is how data goes missing without anyone noticing.
 */
function uniqueHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>()
  return rawHeaders.map((header, index) => {
    const base = header.trim() || `Column ${columnLetter(index)}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

/** Turns a grid of cells into header + records, ignoring any blank lead-in. */
export function tableFromGrid(grid: string[][]): SheetTable {
  // Leading blank rows are common -- a title, a spacer -- so the header is the
  // first row that actually has something in it.
  const firstUsed = grid.findIndex((row) => row.some((cell) => cell !== ''))
  if (firstUsed < 0) return { headers: [], rows: [] }

  const headers = uniqueHeaders(grid[firstUsed])
  const rows = grid
    .slice(firstUsed + 1)
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, i) => {
        record[header] = (row[i] ?? '').trim()
      })
      return record
    })

  return { headers, rows }
}

/** Reads the first visible sheet of an .xlsx workbook. */
export async function readXlsx(file: File): Promise<SheetTable> {
  const parts = await unzip(await file.arrayBuffer())

  const workbook = parseXml(parts.get('xl/workbook.xml'))
  if (!workbook) throw new Error('That .xlsx file could not be read — it may be corrupt or password-protected.')

  const epoch1904 = tags(workbook, 'workbookPr')[0]?.getAttribute('date1904') === '1'

  // A sheet's XML path comes from its relationship id, not its position: the
  // first sheet in the tab order is regularly sheet3.xml on disk.
  const rels = parseXml(parts.get('xl/_rels/workbook.xml.rels'))
  const targets = new Map<string, string>()
  if (rels) {
    for (const rel of tags(rels, 'Relationship')) {
      const id = rel.getAttribute('Id')
      const target = rel.getAttribute('Target')
      if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, ''))
    }
  }

  // Hidden sheets are usually lookup lists or leftovers, so the visible one
  // the admin was looking at when they saved is the one to read.
  const sheets = tags(workbook, 'sheet')
  const chosen = sheets.find((s) => (s.getAttribute('state') ?? 'visible') === 'visible') ?? sheets[0]
  if (!chosen) throw new Error('That workbook has no sheets in it.')

  const relId = chosen.getAttributeNS(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'id'
  )
  const path = (relId && targets.get(relId)) || 'worksheets/sheet1.xml'
  const sheetXml = parseXml(parts.get(`xl/${path}`))
  if (!sheetXml) throw new Error('The first sheet in that workbook could not be read.')

  const shared = sharedStringsOf(parseXml(parts.get('xl/sharedStrings.xml')))
  const dateStyleIndexes = dateStyles(parseXml(parts.get('xl/styles.xml')))

  const grid: string[][] = []
  for (const rowEl of tags(sheetXml, 'row')) {
    // An empty row is omitted from the XML entirely, so its number has to be
    // honoured -- otherwise a gap in the sheet pulls later rows upwards.
    const rowNumber = Number(rowEl.getAttribute('r') ?? grid.length + 1)
    const cells: string[] = []
    for (const cell of tags(rowEl, 'c')) {
      const ref = cell.getAttribute('r')
      // Same for cells: a blank B with data in C is simply not written, so
      // without the reference every value after a gap shifts one column left.
      const index = ref ? columnIndex(ref) : cells.length
      if (index >= 0) cells[index] = cellText(cell, shared, dateStyleIndexes, epoch1904)
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = ''
    if (rowNumber > 0) grid[rowNumber - 1] = cells
  }
  for (let i = 0; i < grid.length; i++) if (grid[i] === undefined) grid[i] = []

  return tableFromGrid(grid)
}

export function isXlsx(file: File): boolean {
  return /\.xlsx$/i.test(file.name)
}

export function isLegacyXls(file: File): boolean {
  return /\.xls$/i.test(file.name)
}
