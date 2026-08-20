import { useEffect, useState } from 'react'
import { CheckIcon } from './icons'

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const hide = setTimeout(() => setLeaving(true), 2600)
    return () => clearTimeout(hide)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const remove = setTimeout(onDismiss, 200)
    return () => clearTimeout(remove)
  }, [leaving, onDismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-[opacity,transform] duration-200 ease-[var(--ease-out)] ${
          leaving ? '-translate-y-2 opacity-0' : 'animate-pop-in'
        }`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500">
          <CheckIcon className="h-3 w-3" />
        </span>
        {message}
      </div>
    </div>
  )
}
