/**
 * Somebody's face, or their initials.
 *
 * The same component KPI has, because it is the same photograph: it is a
 * base64 data URL on the employee row that HR maintains, so it arrives
 * with the profile that was being fetched anyway and there is nothing to
 * load. Initials stay the fallback rather than a grey silhouette — an
 * outline of a person reads as "unknown", and we know exactly who this is.
 */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '?')
    .trim().split(/\s+/).slice(0, 2)
    .map(p => p[0] ?? '')
    .join('')
    .toUpperCase() || '?'
}

export default function Avatar({
  name, src, className = 'h-8 w-8 text-xs',
}: {
  name: string | null | undefined
  src?: string | null
  /** Size and type scale, since the rail and the phone header differ. */
  className?: string
}) {
  const base = `shrink-0 overflow-hidden rounded-full bg-slate-200 ${className}`

  if (src) {
    return (
      <img
        src={src}
        // The name is on screen beside every one of these, so repeating it
        // here would have a screen reader say it twice.
        alt=""
        className={`${base} object-cover`}
        loading="lazy"
        draggable={false}
      />
    )
  }

  return (
    <span className={`${base} grid place-items-center font-semibold text-slate-700`} aria-hidden>
      {initialsOf(name)}
    </span>
  )
}
