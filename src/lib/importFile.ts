import { parseCsvGrid } from './csv'
import { readXlsx, tableFromGrid, isXlsx, isLegacyXls, type SheetTable } from './xlsxRead'

export type { SheetTable }

/**
 * Reads an uploaded spreadsheet, whichever of the two shapes it arrives in.
 *
 * Everyone who maintains these master files works in Excel, so .xlsx is the
 * form the file is already in and CSV is a conversion step they were being
 * asked to perform on our behalf. Both are accepted; neither is preferred.
 */
export async function readTable(file: File): Promise<SheetTable> {
  if (isLegacyXls(file)) {
    throw new Error(
      'That is the old .xls format. Open it in Excel and use Save As → Excel Workbook (.xlsx), then upload that.'
    )
  }
  if (isXlsx(file)) return readXlsx(file)
  return tableFromGrid(parseCsvGrid(await file.text()))
}
