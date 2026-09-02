import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckIcon, AlertIcon, ImageIcon, SpinnerIcon, RefreshIcon } from './icons'
import { isCyrixQr, NOT_OUR_QR } from '../lib/qrCode'

type ScanState = 'starting' | 'scanning' | 'success' | 'camera-error'

const READER_ID = 'qr-reader-region'
const FILE_READER_ID = 'qr-reader-file-region'

// A code has to be read continuously for this long before it's accepted --
// otherwise the camera sweeping past an unrelated code while the user is
// still aiming at the right one gets grabbed by mistake.
//
// The camera samples at 10fps, so the wait a person feels is this plus up
// to another frame.
const CONFIRM_MS = 700

const CORNER_CLASSES = [
  'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
  'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
]

export function QRScanner({
  onDecode,
  anyCode = false,
}: {
  onDecode: (text: string) => void
  /**
   * Take whatever code is in frame, rather than only a Cyrix sticker.
   *
   * Off by default, so a new caller gets the check without having to know
   * to ask for it. The one place it is turned on is the barcode field,
   * which exists to read the client's own label off the part -- there, a
   * code that is not ours is the entire point.
   */
  anyCode?: boolean
}) {
  /*
   * What this scanner is pointed at, which decides every word on it.
   *
   * The same component reads two different things off two different
   * labels, and calling both of them "the QR code" was wrong half the
   * time: the client's item code is a printed barcode on their own
   * sticker, and somebody holding one in front of a screen asking for a
   * QR code reasonably concludes they have the wrong screen.
   *
   * anyCode already draws exactly this line -- it is on for the client's
   * label and off for a Cyrix sticker -- so the wording follows it rather
   * than becoming a second prop that could disagree with the first.
   */
  const readsBarcode = anyCode
  const codeWord = readsBarcode ? 'barcode' : 'QR code'
  const [state, setState] = useState<ScanState>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resultText, setResultText] = useState<string | null>(null)
  const [holding, setHolding] = useState(false)
  const decodedRef = useRef(false)
  const pendingRef = useRef<{ text: string; since: number } | null>(null)
  // The last code turned away, so it is only announced once rather than on
  // every frame it stays in view.
  const rejectedRef = useRef<string | null>(null)
  const holdingTimeoutRef = useRef<number | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // What the camera can actually do, read once it is running. Null when it
  // has no zoom to offer, which is most laptops and some phones.
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, { verbose: false })
    scannerRef.current = scanner
    decodedRef.current = false
    pendingRef.current = null

    const onDecoded = (decodedText: string) => {
      if (decodedRef.current) return

      const ours = anyCode || isCyrixQr(decodedText)

      // A code is in frame right now -- show "Hold steady" while we
      // confirm it, and clear that hint if the code drops out of frame
      // for a bit (rather than on every single missed scan attempt,
      // which fires constantly and would just flicker the hint).
      //
      // Only for a code that would be taken, though: "Got it" over a
      // label we are about to turn away reads as a promise, and the
      // green corners would go on to be contradicted by an error.
      if (ours) {
        setHolding(true)
        if (holdingTimeoutRef.current) window.clearTimeout(holdingTimeoutRef.current)
        holdingTimeoutRef.current = window.setTimeout(() => setHolding(false), 350)
      }

      const now = Date.now()
      if (pendingRef.current?.text !== decodedText) {
        pendingRef.current = { text: decodedText, since: now }
        return
      }
      if (now - pendingRef.current.since < CONFIRM_MS) return

      // Held still long enough to be sure of what it says. Somebody
      // else's code is turned away here and the camera left running,
      // so the answer is to move it onto the right sticker rather
      // than to start again. Waiting for the same hold as an accepted
      // code is deliberate: a stray QR caught for one frame while the
      // user aims should not throw a warning up.
      if (!ours) {
        if (rejectedRef.current !== decodedText) {
          rejectedRef.current = decodedText
          setErrorMsg(NOT_OUR_QR)
        }
        return
      }

      rejectedRef.current = null
      setErrorMsg(null)
      decodedRef.current = true
      setResultText(decodedText)
      setState('success')
    }

    /*
     * One request, and nothing clever.
     *
     * Asking for a resolution and retrying on refusal both cost the
     * camera outright. html5-qrcode holds a state machine around start(),
     * and calling it again after a failed attempt raises "Cannot
     * transition to a new state, already under transition" -- so the
     * retry chain that was meant to be a safety net became the thing
     * breaking the camera, and reported itself as the camera being
     * unavailable.
     *
     * This is the call that worked before any of it. A 12mm sticker
     * wanting more detail than the default is a real problem and this is
     * not the way to fix it: the zoom control below does the same job
     * without touching how the camera is opened.
     */
    scanner
      .start(
        { facingMode: 'environment' },
        // A barcode is wide and short, and squeezing one into a square
        // box means holding the phone far enough back that the bars stop
        // resolving. The scan region is shaped like the thing being
        // scanned.
        { fps: 10, qrbox: readsBarcode ? { width: 280, height: 140 } : { width: 250, height: 250 } },
        onDecoded,
        () => {
          /* fires continuously while no code is in frame — expected, ignore */
        }
      )
      .then(() => {
        setState((s) => (s === 'starting' ? 'scanning' : s))

        // Zoom is not applied on its own. Zooming in narrows the view,
        // which makes a code harder to find and easier to lose, so it is
        // offered rather than imposed -- the person holding the phone can
        // see whether the sticker is too small and is the one to decide.
        //
        // `zoom` is not in the DOM's MediaTrackCapabilities: it is a
        // separate spec that most phone browsers implement and most
        // laptops do not, hence the cast and the null.
        try {
          const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            zoom?: { min: number; max: number; step: number }
          }
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            setZoomRange({
              min: caps.zoom.min,
              max: Math.min(caps.zoom.max, 5),
              step: caps.zoom.step || 0.1,
            })
            setZoom(caps.zoom.min)
          }
        } catch {
          /* no capabilities to read -- nothing to offer, which is fine */
        }
      })
      .catch((e: unknown) => {
        // Say which failure it was. "Camera unavailable" covers a denied
        // permission, a camera another app is holding, and a device with
        // none at all -- three different things to do about it, and the
        // one message sent somebody looking in the wrong place.
        const name =
          typeof e === 'object' && e !== null && 'name' in e
            ? String((e as { name: unknown }).name)
            : typeof e === 'string'
              ? e
              : ''
        const advice =
          name === 'NotAllowedError' || /permission|denied/i.test(name)
            ? 'Camera permission is blocked for this site. Tap the padlock in the address bar → Permissions → Camera → Allow, then reload.'
            : name === 'NotReadableError'
              ? 'Another app is using the camera. Close it and reload.'
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? `No camera this browser will open. Try another browser, or upload a photo of the ${codeWord} instead.`
                : `Camera unavailable. Allow camera access, or upload a photo of the ${codeWord} instead.`
        setErrorMsg(name && !advice.startsWith('Camera unavailable') ? advice : `${advice}${name ? ` (${name})` : ''}`)
        setState('camera-error')
      })

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [onDecode, anyCode, readsBarcode, codeWord])

  const handleFile = useCallback(async (file: File) => {
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
      // The same rule as the camera: a photo of somebody else's code is
      // still somebody else's code.
      if (!anyCode && !isCyrixQr(text)) {
        rejectedRef.current = text
        setErrorMsg(NOT_OUR_QR)
        return
      }
      rejectedRef.current = null
      decodedRef.current = true
      setResultText(text)
      setState('success')
    } catch {
      setErrorMsg(`No ${codeWord} found in that photo. Try a clearer, closer shot.`)
    } finally {
      fileScanner.clear()
    }
  }, [anyCode, codeWord])

  async function handleContinue() {
    if (!resultText) return
    // Hand the value back no matter what happens to the camera. stop() throws
    // outright when the scanner isn't running (e.g. the value came from an
    // uploaded photo after a camera error), and chaining off it meant a throw
    // there swallowed the handoff and the button appeared dead.
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop()
    } catch {
      /* best-effort -- the camera is torn down on unmount anyway */
    }
    onDecode(resultText)
  }

  function handleRetake() {
    decodedRef.current = false
    pendingRef.current = null
    // Only a rejection is cleared: a camera failure is still true, and its
    // message is the only thing explaining the black frame behind it.
    if (rejectedRef.current) setErrorMsg(null)
    rejectedRef.current = null
    setHolding(false)
    setResultText(null)
    setState((s) => (s === 'success' ? 'scanning' : s))
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-6">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-black">
        <div id={READER_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

        <div className="pointer-events-none absolute inset-0">
          {/* The drawn frame matches the scan region, so aiming inside it
              means what it looks like it means: square for a QR, wide and
              short for a barcode. */}
          <div
            className={`absolute overflow-hidden rounded-xl ${
              readsBarcode ? 'inset-x-6 inset-y-[30%]' : 'inset-8'
            }`}
          >
            {CORNER_CLASSES.map((cls) => (
              <span
                key={cls}
                className={`absolute h-6 w-6 transition-colors duration-200 ${holding ? 'border-emerald-400' : 'border-purple-400'} ${cls}`}
              />
            ))}
            {state === 'scanning' && !holding && (
              <motion.div
                className="absolute inset-x-0 h-0.5 bg-purple-400 shadow-[0_0_8px_2px_rgba(192,132,252,0.8)]"
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

      {state === 'success' && resultText ? (
        <div className="w-full max-w-xs animate-pop-in space-y-3">
          <p className="truncate rounded-lg bg-slate-100 px-3 py-2 text-center tabular-nums text-xs text-slate-600">{resultText}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRetake}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshIcon className="h-4 w-4" /> Retake
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-650"
            >
              <CheckIcon className="h-4 w-4" /> Continue
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Only when the camera has zoom to give -- a slider that moves
              nothing is worse than no slider. For a 12mm sticker the thing
              standing in the way is usually not size but focus: a phone
              cannot focus closer than about 10cm, and inside that the
              picture goes soft however large the code looks. Zooming in
              from a distance the lens can hold is the way round it. */}
          {zoomRange && state === 'scanning' && (
            <label className="flex w-full max-w-xs items-center gap-3 text-xs text-slate-500">
              <span className="shrink-0">Zoom</span>
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setZoom(next)
                  // `zoom` is not part of the DOM's constraint type, so the
                  // shape has to be laundered through unknown to be passed.
                  scannerRef.current
                    ?.applyVideoConstraints({ advanced: [{ zoom: next }] } as unknown as MediaTrackConstraints)
                    .catch(() => {
                      /* the camera refused it; the slider snapping back would
                         be more confusing than a zoom that did not move */
                    })
                }}
                className="h-1 flex-1 cursor-pointer accent-purple-500"
                aria-label="Camera zoom"
              />
              <span className="w-9 shrink-0 text-right tabular-nums">{zoom.toFixed(1)}×</span>
            </label>
          )}

          <p className={`text-center text-sm ${holding ? 'font-medium text-emerald-600' : 'text-slate-500'}`}>
            {holding ? 'Got it — hold steady…' : `Line the ${codeWord} up inside the frame — it scans automatically.`}
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
            <ImageIcon className="h-4 w-4" /> Upload a photo instead
          </button>
        </>
      )}

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
