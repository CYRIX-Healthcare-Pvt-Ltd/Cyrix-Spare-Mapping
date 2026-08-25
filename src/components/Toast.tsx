import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon, ChevronRightIcon } from './icons'

/** Somewhere to go from the toast, e.g. the list the new record just joined. */
export interface ToastAction {
  label: string
  to: string
}

export function Toast({
  message,
  action,
  onDismiss,
}: {
  message: string
  action?: ToastAction
  onDismiss: () => void
}) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // A toast you're meant to click needs long enough to read it, decide, and
    // reach it; one that only reports success can go as soon as it's read.
    const hide = setTimeout(() => setLeaving(true), action ? 6000 : 2600)
    return () => clearTimeout(hide)
  }, [action])

  useEffect(() => {
    if (!leaving) return
    const remove = setTimeout(onDismiss, 200)
    return () => clearTimeout(remove)
  }, [leaving, onDismiss])

  // Anchored to the bottom, not the top. The page this appears on most is the
  // scanner, and the viewfinder is the top of that screen -- a toast there
  // covers the frame exactly when someone is lining up the next code.
  // bottom-20 clears the phone tab bar; desktop doesn't have one.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6">
      <div
        // brand-700/on-brand rather than a hardcoded dark fill and white text:
        // both invert with the palette, so the toast stays legible in dark mode.
        className={`pointer-events-auto flex items-center gap-2 rounded-full bg-brand-700 py-2.5 pl-4 text-sm font-medium text-on-brand shadow-lg transition-[opacity,transform] duration-200 ease-[var(--ease-out)] ${
          action ? 'pr-1.5' : 'pr-4'
        } ${leaving ? '-translate-y-2 opacity-0' : 'animate-pop-in'}`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <CheckIcon className="h-3 w-3" />
        </span>
        <span className="min-w-0">{message}</span>
        {action && (
          <Link
            to={action.to}
            onClick={() => setLeaving(true)}
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-on-brand/10 py-1 pl-3 pr-2 text-sm font-semibold hover:bg-on-brand/20"
          >
            {action.label}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}
