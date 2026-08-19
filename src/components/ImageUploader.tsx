import { useRef, useState } from 'react'
import { compressImageToBase64 } from '../lib/imageCompress'
import { ImageIcon, XIcon, SpinnerIcon } from './icons'

export function ImageUploader({
  value,
  onChange,
  max = 3,
}: {
  value: string[]
  onChange: (images: string[]) => void
  max?: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    const remaining = max - value.length
    const toProcess = Array.from(files).slice(0, remaining)
    setBusy(true)
    try {
      const encoded = await Promise.all(toProcess.map((f) => compressImageToBase64(f)))
      onChange([...value, ...encoded])
    } catch {
      setError('Could not process one of those images. Try a different photo.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {value.map((src, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
            <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
              aria-label="Remove photo"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
          >
            {busy ? <SpinnerIcon className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            <span className="text-xs">{busy ? 'Processing' : 'Add photo'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="mt-1 text-xs text-slate-400">
        Up to {max} photos, {value.length}/{max} added.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
