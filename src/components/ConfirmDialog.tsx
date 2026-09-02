import { useEffect, useState } from 'react'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmText,
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /**
   * What the way out says. "Cancel" is right when the dialog asks
   * whether to do something; when it asks whether to leave, cancelling
   * is the thing being offered and naming it "Keep editing" is what
   * makes the pair readable in either order.
   */
  cancelLabel?: string
  /**
   * Word the person has to type before the action unlocks.
   *
   * For the handful of actions that destroy more than the person can see --
   * clearing a catalogue of tens of thousands of rows, say -- where a
   * mis-aimed click on a red button is not something they can take back.
   * Left unset, the button is simply live, which is right for anything whose
   * damage is proportional to what is on screen.
   */
  confirmText?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')

  // Reopening for a different action must not arrive pre-unlocked by what was
  // typed the last time.
  useEffect(() => {
    if (open) setTyped('')
  }, [open, confirmText])

  if (!open) return null

  const locked = !!confirmText && typed.trim() !== confirmText

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm animate-pop-in rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold text-slate-900">{title}</h2>
        <p className="mb-5 text-sm text-slate-600">{message}</p>

        {confirmText && (
          <label className="mb-5 block text-sm">
            <span className="text-slate-600">
              Type <span className="font-semibold text-slate-900">{confirmText}</span> to confirm
            </span>
            <input
              type="text"
              value={typed}
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || locked}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-650'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
