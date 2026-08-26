// Minimal CSV parser/builder -- handles quoted fields (with commas, newlines,
// and escaped "" quotes inside them), which is enough for admin-authored
// bulk-upload sheets without pulling in a library.
/** The raw grid, header row included -- see `parseCsv` for keyed records. */
export function parseCsvGrid(text: string): string[][] {
  return parseRows(text)
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text)
  if (rows.length === 0) return []

  const headers = rows[0].map((h) => h.trim())
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, i) => {
        record[header] = (row[i] ?? '').trim()
      })
      return record
    })
}

function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const normalized = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildCsvTemplate(headers: string[], sampleRows: string[][] = []): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of sampleRows) lines.push(row.map(escapeCell).join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
