const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** dd-mmm-yyyy, e.g. "19-Aug-2026" — used everywhere a date is shown. */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

function clockParts(d: Date) {
  const hours = d.getHours()
  return {
    suffix: hours < 12 ? 'AM' : 'PM',
    // Midnight and noon are 12, not 0, in 12-hour time.
    h12: hours % 12 === 0 ? 12 : hours % 12,
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
  }
}

/**
 * dd-mmm-yyyy h:mm AM/PM, e.g. "19-Aug-2026 2:32 PM" — for audit trails,
 * where two entries on the same day are otherwise impossible to put in order.
 */
export function formatDateTime(value: string | Date, withSeconds = false): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const { suffix, h12, mm, ss } = clockParts(d)
  const time = withSeconds ? `${h12}:${mm}:${ss}` : `${h12}:${mm}`
  return `${formatDate(d)} ${time} ${suffix}`
}

/**
 * Picks one formatter for a whole list of timestamps: seconds appear only if
 * two entries would otherwise render identically. Applied to the list rather
 * than per-entry so the column stays visually consistent -- and so seconds
 * are never shown as noise when the times already differ.
 */
export function pickTimeFormatter(values: (string | Date)[]): (value: string | Date) => string {
  const rendered = values.map((v) => formatDateTime(v))
  const collides = new Set(rendered).size !== rendered.length
  return (value) => formatDateTime(value, collides)
}
