import { useEffect } from 'react'
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'

/**
 * Full-screen viewer for a spare's photos.
 *
 * Takes the whole set rather than a single image, so a spare with several
 * photos can be stepped through in place instead of closing and reopening for
 * each one. Arrow keys and Escape work, because anyone who has used a photo
 * viewer will try them.
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && count > 1) onIndexChange((index + 1) % count)
      else if (e.key === 'ArrowLeft' && count > 1) onIndexChange((index - 1 + count) % count)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, count, onClose, onIndexChange])

  if (count === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 animate-pop-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Photos: ${title}` : 'Photos'}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 text-white/80">
        <span className="min-w-0 truncate text-sm">
          {title}
          {count > 1 && <span className="ml-2 text-white/50">{index + 1} of {count}</span>}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-2 hover:bg-white/10 hover:text-white"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Stops the backdrop's close handler firing when the image itself,
          or either arrow, is what was clicked. */}
      <div className="flex min-h-0 flex-1 items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {count > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + count) % count)}
            aria-label="Previous photo"
            className="shrink-0 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}

        <img
          src={images[index]}
          alt={title ? `${title} photo ${index + 1}` : `Photo ${index + 1}`}
          className="mx-auto max-h-full min-h-0 max-w-full rounded-lg object-contain"
        />

        {count > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % count)}
            aria-label="Next photo"
            className="shrink-0 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex shrink-0 justify-center gap-2" onClick={(e) => e.stopPropagation()}>
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
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
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
