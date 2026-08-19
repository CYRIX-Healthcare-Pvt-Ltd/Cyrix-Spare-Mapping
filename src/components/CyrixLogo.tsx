// Recreates the Cyrix Health Care wordmark (black CYRIX, red X, "HEALTH
// CARE PVT LTD" subtitle) from the brand mark, sized in em so a single
// font-size on the wrapper scales the whole thing proportionally.
export function CyrixLogo({ className = '', subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={`select-none text-center leading-none ${className}`}>
      <div className="flex items-start justify-center text-[2em] font-bold tracking-tight">
        <span className="text-slate-950">CYRI</span>
        <span className="relative text-red-600">
          X
          <sup className="absolute -right-[0.55em] top-0 text-[0.3em] font-semibold text-slate-950">®</sup>
        </span>
      </div>
      {subtitle && (
        <p className="mt-[0.35em] text-[0.62em] font-semibold tracking-[0.2em] text-slate-950">
          HEALTH CARE PVT LTD
        </p>
      )}
    </div>
  )
}
