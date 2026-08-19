import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckIcon, AlertIcon, ImageIcon, SpinnerIcon } from './icons'

type ScanState = 'starting' | 'scanning' | 'success' | 'camera-error'

const READER_ID = 'qr-reader-region'
const FILE_READER_ID = 'qr-reader-file-region'

const CORNER_CLASSES = [
  'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
  'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
]

export function QRScanner({ onDecode }: { onDecode: (text: string) => void }) {
  const [state, setState] = useState<ScanState>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const decodedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, { verbose: false })
    decodedRef.current = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (decodedRef.current) return
          decodedRef.current = true
          setState('success')
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              window.setTimeout(() => onDecode(decodedText), 550)
            })
        },
        () => {
          /* fires continuously while no code is in frame — expected, ignore */
        }
      )
      .then(() => setState((s) => (s === 'starting' ? 'scanning' : s)))
      .catch(() => {
        setErrorMsg('Camera unavailable. Allow camera access, or upload a QR photo instead.')
        setState('camera-error')
      })

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [onDecode])

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null)
      let el = document.getElementById(FILE_READER_ID)
      if (!el) {
        el = document.createElement('div')
        el.id = FILE_READER_ID
        el.style.display = 'none'
        document.body.appendChild(el)
      }
      const fileScanner = new Html5Qrcode(FILE_READER_ID, { verbose: false })
      try {
        const text = await fileScanner.scanFile(file, false)
        decodedRef.current = true
        setState('success')
        window.setTimeout(() => onDecode(text), 400)
      } catch {
        setErrorMsg('No QR code found in that photo. Try a clearer, closer shot.')
      } finally {
        fileScanner.clear()
      }
    },
    [onDecode]
  )

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-6">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-black">
        <div id={READER_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-8 overflow-hidden rounded-xl">
            {CORNER_CLASSES.map((cls) => (
              <span key={cls} className={`absolute h-6 w-6 border-purple-500 ${cls}`} />
            ))}
            {state === 'scanning' && (
              <motion.div
                className="absolute inset-x-0 h-0.5 bg-purple-500 shadow-[0_0_8px_2px_rgba(168,85,247,0.8)]"
                animate={{ top: ['4%', '94%', '4%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>

          <AnimatePresence>
            {state === 'success' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 grid place-items-center bg-emerald-500/30"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white"
                >
                  <CheckIcon className="h-8 w-8" />
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {state === 'starting' && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-white">
              <SpinnerIcon className="h-8 w-8" />
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        Line the QR code up inside the frame — it scans automatically.
      </p>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-center text-sm text-amber-700">
          <AlertIcon className="h-4 w-4 shrink-0" /> {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <ImageIcon className="h-4 w-4" /> Upload a QR photo instead
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
