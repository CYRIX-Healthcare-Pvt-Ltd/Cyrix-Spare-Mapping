import { useState } from 'react'
import { QRScanner } from './QRScanner'
import { ScanIcon, XIcon } from './icons'
import { client } from '../lib/branding'

/**
 * Captures Blue Star's item code for a spare -- scanned off the label with
 * the camera, or typed in when the sticker won't read. It is the link to
 * Blue Star's catalogue; a scan that yields their barcode instead still
 * matches, as a fallback. Resolving it to an item, and the Cyrix mapping that
 * follows, happens in CyrixMappingPanel, which the form renders under the
 * spare-name field instead of here.
 */
export function BarcodeItemInput({
  id,
  value,
  onChange,
  required,
  baseClass,
}: {
  id?: string
  value: unknown
  onChange: (value: unknown) => void
  required?: boolean
  baseClass: string
}) {
  const [scanning, setScanning] = useState(false)

  return (
    <>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          className={`${baseClass} flex-1`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Scan or type the ${client} item code`}
          required={required}
        />
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-label="Scan the code"
        >
          <ScanIcon className="h-4 w-4" />
        </button>
      </div>

      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm font-medium text-white">Scan barcode</p>
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="rounded-lg p-1.5 text-white hover:bg-surface/10"
              aria-label="Close scanner"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 items-center">
            <QRScanner
              // The one scanner that must take a code Cyrix did not issue:
              // this reads the client's own label off the part. The CYR/
              // check belongs to the sticker that identifies a spare, not
              // to the catalogue number printed on it by somebody else.
              anyCode
              onDecode={(text) => {
                onChange(text)
                setScanning(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
