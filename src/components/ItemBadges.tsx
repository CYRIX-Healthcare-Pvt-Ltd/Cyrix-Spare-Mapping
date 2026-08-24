/** Quantity on hand, so the tagger can tell a real shelf item from a catalogue entry. */
export function StockBadge({ qty }: { qty: number | null }) {
  const n = typeof qty === 'number' ? qty : 0
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        n > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {n > 0 ? `${n} in stock` : 'No stock'}
    </span>
  )
}

/**
 * How closely the names match, so a weak suggestion is visibly weak rather
 * than looking as authoritative as a perfect one. A full match is labelled
 * rather than shown as "100%" -- it means the names are identical once case
 * and punctuation are ignored, which is a stronger claim than a percentage.
 */
export function MatchBadge({ score }: { score?: number }) {
  if (score === undefined) return null
  if (score === 1) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        Exact
      </span>
    )
  }

  const pct = Math.round(score * 100)
  const tone = pct >= 70 ? 'bg-emerald-50 text-emerald-700' : pct >= 55 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
  return <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{pct}% match</span>
}
