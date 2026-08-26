// Client mark (Blue Star Limited) — Cyrix services their facilities,
// this app is the equipment tracker deployed for that account. Star is a
// generic 5-point mark rather than a trace of their specific angular
// artwork; the recognizable elements are the brand blue and wordmark.
const STAR_POINTS =
  '50,5 60.58,35.44 92.8,36.1 67.12,55.56 76.45,86.4 50,68 23.55,86.4 32.88,55.56 7.2,36.1 39.42,35.44'

export function BlueStarLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex select-none items-stretch text-[1em] ${className}`}>
      {/* Literal white, never the surface token: this is Blue Star's mark and
          the blue-on-white square is part of it. Theming a logo repaints
          someone else's brand, so every colour in here is fixed. */}
      <div className="grid aspect-square place-items-center border-2 border-[#004c97] bg-[#ffffff] p-[0.25em]">
        <svg viewBox="0 0 100 100" className="h-[1.6em] w-[1.6em]" fill="#004c97">
          <polygon points={STAR_POINTS} />
        </svg>
      </div>
      <div className="flex items-center bg-[#004c97] px-[0.6em]">
        <span className="text-[1.1em] font-extrabold tracking-wide text-white">BLUE STAR</span>
      </div>
    </div>
  )
}
