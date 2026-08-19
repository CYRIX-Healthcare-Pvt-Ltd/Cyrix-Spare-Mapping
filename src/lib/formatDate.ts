const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** dd-mmm-yyyy, e.g. "19-Aug-2026" — used everywhere a date is shown. */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}
