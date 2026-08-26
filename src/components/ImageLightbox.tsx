import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'

/** How far a finger travels before it counts as a drag rather than a tap. */
const TAP_SLOP = 8
/** Below this, the gesture hasn't committed to an axis yet. */
const AXIS_LOCK = 10
/** A flick this fast commits even if it didn't travel far. */
const FLICK_VELOCITY = 0.5 // px per ms
/** Pull down this far and the viewer closes. */
const DISMISS_DISTANCE = 110
/** Resistance applied when dragging past the first or last photo. */
const RUBBER_BAND = 0.35

type Axis = 'x' | 'y' | null

interface Drag {
  dx: number
  dy: number
}

/**
 * Full-screen viewer for a spare's photos.
 *
 * Driven by gestures rather than by controls, because the controls are the
 * part that doesn't work one-handed: on a tall phone the close button sits in
 * the far top corner, which is the hardest place on the screen for a thumb to
 * reach, and side arrows are only reachable if they happen to be on the side
 * the phone is held with.
 *
 * So: swipe sideways to move between photos, pull down to close, tap anywhere
 * off the photo to close. All three work wherever the thumb already is. The
 * arrows come back on a wide screen, where a pointer makes them the natural
 * thing and there is room to lay them over the photo's edges.
 *
 * The X and the keyboard shortcuts stay for anyone not using a touchscreen,
 * and because a dialog needs a control that a screen reader can find.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title,
}: {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  title?: string
}) {
  const count = images.length
  const [drag, setDrag] = useState<Drag | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number; time: number; onPhoto: boolean } | null>(null)
  // Pointer moves arrive faster than React re-renders, so the axis -- which is
  // decided once and then held for the rest of the gesture -- can't live in
  // state: two moves in one frame would both read it as undecided.
  const axisRef = useRef<Axis>(null)

  // Relative rather than absolute, because every caller moves by one, and it
  // keeps the index out of the callers -- including the key handler, which
  // would otherwise have to re-subscribe on every photo.
  const step = useCallback(
    (delta: number) => {
      // Clamped rather than wrapped: on a two-photo spare, "next" jumping
      // back to the first is indistinguishable from "previous", and a swipe
      // that silently loops makes it impossible to tell where the set ends.
      const clamped = Math.max(0, Math.min(count - 1, index + delta))
      if (clamped !== index) onIndexChange(clamped)
    },
    [index, count, onIndexChange]
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, onClose])

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!e.isPrimary) return
    const target = e.target as HTMLElement
    startRef.current = { x: e.clientX, y: e.clientY, time: e.timeStamp, onPhoto: !!target.closest('img') }
    axisRef.current = null
    // Capture keeps the moves coming even once the finger leaves the surface,
    // which matters for a pull-down that ends past the bottom of the screen.
    // It throws if the pointer is already gone, and losing capture is not a
    // reason to lose the gesture.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* the gesture still works from the events that follow */
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current
    if (!start) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y

    // The axis is decided once, at the moment the finger commits, and then
    // held. Without that, a swipe that drifts diagonally keeps switching
    // between paging and dismissing and does neither.
    if (!axisRef.current) {
      if (Math.hypot(dx, dy) <= AXIS_LOCK) return
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }

    if (axisRef.current === 'y') {
      // Downward only. Dragging a photo upward has no meaning here, and
      // allowing it just makes the viewer feel loose.
      setDrag({ dx: 0, dy: Math.max(0, dy) })
      return
    }

    const atEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0)
    setDrag({ dx: atEdge ? dx * RUBBER_BAND : dx, dy: 0 })
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current
    const axis = axisRef.current
    startRef.current = null
    axisRef.current = null
    setDrag(null)
    if (!start) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const elapsed = Math.max(1, e.timeStamp - start.time)

    // A tap that never became a drag. Off the photo that means close, which
    // is what tapping the dark surround already looks like it should do.
    if (!axis && Math.hypot(dx, dy) < TAP_SLOP) {
      if (!start.onPhoto) onClose()
      return
    }

    if (axis === 'y') {
      if (dy > DISMISS_DISTANCE || (dy > 40 && dy / elapsed > FLICK_VELOCITY)) onClose()
      return
    }

    if (axis === 'x' && count > 1) {
      const width = surfaceRef.current?.clientWidth ?? window.innerWidth
      const far = Math.abs(dx) > width * 0.22
      const fast = Math.abs(dx) > 40 && Math.abs(dx) / elapsed > FLICK_VELOCITY
      if (far || fast) step(dx < 0 ? 1 : -1)
    }
  }

  if (count === 0) return null

  const dragging = drag !== null
  // The backdrop thins out as the photo is pulled down, so the gesture shows
  // what it is going to do before it is finished.
  const pullThrough = Math.min((drag?.dy ?? 0) / (DISMISS_DISTANCE * 2), 0.65)

  return (
    <div
      className="fixed inset-0 z-50 animate-pop-in select-none"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Photos: ${title}` : 'Photos'}
    >
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: 0.92 - pullThrough, transition: dragging ? 'none' : 'opacity 220ms ease-out' }}
      />

      {/* touch-none hands every gesture to the handlers above; without it the
          browser starts its own pan halfway through a swipe and the photo
          sticks. */}
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${drag?.dx ?? 0}px), ${drag?.dy ?? 0}px, 0) scale(${
              1 - pullThrough * 0.15
            })`,
            transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {images.map((src, i) => (
            <div
              key={i}
              // The row is minmax(0,1fr) rather than the default auto: an auto
              // row is sized by its content, so the photo's own max-height of
              // 100% would resolve against a row the photo had just sized --
              // circular, and no constraint at all. In landscape that let a
              // tall photo run past the bottom of the screen and cover the
              // filmstrip. A 1fr track is definite, so 100% means the space
              // that is actually left.
              className={`grid h-full w-full shrink-0 grid-rows-[minmax(0,1fr)] place-items-center px-4 pt-16 ${
                count > 1 ? 'pb-36' : 'pb-16'
              }`}
            >
              <img
                src={src}
                alt={title ? `${title} photo ${i + 1}` : `Photo ${i + 1}`}
                draggable={false}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Above the swipe surface, and taking their own pointer events, so a
          tap on a control is never read as a tap on the backdrop. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 text-white/80"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <span className="min-w-0 truncate text-sm">
          {title}
          {count > 1 && (
            <span className="ml-2 text-white/50">
              {index + 1} of {count}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pointer-events-auto shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20 hover:text-white"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Laid over the photo's edges rather than beside it. As flex siblings
          they were stealing width from an image already sized to the full
          container, which pushed the second arrow off the screen entirely.
          Hidden on a phone, where the swipe is the better control anyway. */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0 sm:block"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index === count - 1}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0 sm:block"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </>
      )}

      {count > 1 && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-center gap-2">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === index}
                className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition ${
                  i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          {/* Said once, quietly, on the screens where the arrows are gone --
              a gesture nobody knows about is the same as no control at all. */}
          <p className="text-xs text-white/40 sm:hidden">Swipe to browse · pull down to close</p>
        </div>
      )}
    </div>
  )
}

/**
 * One thumbnail standing in for however many photos there are, with the extra
 * count stacked on it. A cell has to stay the same width whether a spare has
 * one photo or five, so the rest are reached through the viewer rather than
 * laid out in the row.
 */
export function ThumbnailStack({
  images,
  label,
  onOpen,
}: {
  images: string[]
  label: string
  onOpen: (index: number) => void
}) {
  if (images.length === 0) return <span className="text-slate-400">—</span>

  return (
    <button
      type="button"
      onClick={() => onOpen(0)}
      aria-label={`View ${images.length} photo${images.length === 1 ? '' : 's'} for ${label}`}
      className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 transition-transform hover:scale-110 hover:border-brand-300"
    >
      <img src={images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
      {images.length > 1 && (
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-semibold text-white">
          +{images.length - 1}
        </span>
      )}
    </button>
  )
}
