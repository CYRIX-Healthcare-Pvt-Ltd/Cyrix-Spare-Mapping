/**
 * The Cyrix Healthcare lockup, identical in every module.
 *
 * This is BEMMP's drawing, ported verbatim: it is the one measured against
 * the printed artwork. Three apps each approximating the same wordmark in
 * their own HTML is how one company came to have three that are nearly but
 * not quite alike — the ® sat in a different place in each. The
 * coordinates are the lockup, so they are not adjusted here.
 *
 * SVG text rather than an image: the dark half follows `currentColor` and
 * flips with the theme, and the red stays the brand red in both.
 *
 * The old `className`/`subtitle` shape is kept so call sites do not have to
 * change; `className` sizes it through the wrapper as before, and `height`
 * is there for anywhere that wants an exact one.
 */
export function CyrixLogo({
  className = '',
  subtitle = true,
  height,
}: {
  className?: string
  subtitle?: boolean
  height?: number
}) {
  // The full lockup is 78 units tall; the wordmark alone is 52.
  const box = subtitle ? 78 : 52
  const h = height ?? (subtitle ? 34 : 21)

  return (
    <svg
      viewBox={`0 0 300 ${box}`}
      height={h}
      className={`select-none text-slate-950 dark:text-slate-100 ${className}`}
      role="img"
      aria-label="Cyrix Health Care Pvt Ltd"
    >
      <text
        x="0" y="44"
        fontSize="52" fontWeight="700" letterSpacing="1"
        fill="currentColor"
        fontFamily="inherit"
      >
        CYRI<tspan fill="#e30613">X</tspan>
      </text>
      <text
        x="171" y="16"
        fontSize="13" fontWeight="600"
        fill="#e30613"
        fontFamily="inherit"
      >
        ®
      </text>
      {subtitle && (
        <text
          x="1" y="66"
          fontSize="13.5" fontWeight="500" letterSpacing="3.4"
          fill="currentColor"
          fontFamily="inherit"
        >
          HEALTH CARE PVT LTD
        </text>
      )}
    </svg>
  )
}
