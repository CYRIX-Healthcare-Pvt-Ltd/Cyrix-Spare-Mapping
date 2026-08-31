/*
 * Layout harness — `npm run dev`, then /spare/harness.html.
 *
 * Sign-in lives in the portal, so this app's chrome cannot be rendered
 * locally without an account, and a layout change could only be checked
 * by shipping it. This renders the chrome on its own instead.
 *
 * The bottom bar is a *copy* of Layout.tsx's, which is the thing that can
 * drift — change one and change the other, or this stops telling the
 * truth. Real stylesheet, real icons, real class names.
 *
 * Vite builds index.html only, so none of this ships.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, NavLink } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import '@fontsource-variable/inter'
import './index.css'
import { QRScanner } from './components/QRScanner'
import { BarcodeItemInput } from './components/BarcodeItemInput'
import {
  HomeIcon, ScanIcon, PackageIcon, ClipboardIcon, SettingsIcon, GridIcon,
} from './components/icons'
import { CyrixLogo } from './components/CyrixLogo'
import Avatar from './components/Avatar'

/*
 * A stand-in for the camera, switched on with ?fakecam.
 *
 * There is no camera here, so the real start() rejects and the scanner
 * goes straight to its error state — which means the decode path, where
 * the CYR/ check and the hold-steady timer both live, could not be
 * reached locally at all. This lets start() succeed and hands its decode
 * callback out on `window.__scan`, so a code can be held up to it:
 *
 *   __scan('CYR/0000001')   // taken, once it has been held long enough
 *   __scan('4901234567894') // turned away as somebody else's
 *
 * Only where the text comes from is faked. The hold, the check, the
 * message and the render are all the real component.
 */
declare global {
  interface Window {
    __scan?: (text: string) => void
  }
}

if (new URLSearchParams(location.search).has('fakecam')) {
  Html5Qrcode.prototype.start = function (_camera, _config, onSuccess) {
    window.__scan = (text) => onSuccess?.(text, null as never)
    return Promise.resolve(null)
  }
}

const navItems = [
  { to: '/', label: 'Home', icon: HomeIcon, activeText: 'text-brand-700', pillBg: 'bg-brand-50' },
  { to: '/scan', label: 'Scan', icon: ScanIcon, activeText: 'text-purple-600', pillBg: 'bg-purple-50' },
  { to: '/tagged', label: 'Inventory', icon: PackageIcon, activeText: 'text-emerald-600', pillBg: 'bg-emerald-50' },
  { to: '/requests', label: 'Requests', icon: ClipboardIcon, activeText: 'text-yellow-600', pillBg: 'bg-yellow-50' },
  { to: '/admin/facilities', label: 'Admin', icon: SettingsIcon, activeText: 'text-red-600', pillBg: 'bg-red-50' },
]

/*
 * The recode panel and its scanner overlay, copied from EquipmentView so
 * the chrome can be looked at without a spare loaded and an account to
 * load it with. The camera will not start in a pane with no permission —
 * that is fine, QRScanner's error state is part of what needs checking.
 */
function RemapPanel() {
  const [scanning, setScanning] = useState(false)
  const [newQr, setNewQr] = useState('')

  return (
    <div className="border-t border-slate-200 px-4 pt-5">
      <h2 className="text-sm font-semibold text-slate-900">This spare</h2>
      <p className="mt-0.5 text-xs text-slate-500">Applied straight away, and recorded in the history.</p>

      <div className="mt-3 rounded-xl border border-slate-200 bg-surface-muted p-4">
        <p className="text-sm font-medium text-slate-900">Replace the QR code</p>
        <p className="mt-1 text-xs text-slate-500">
          For a sticker that has torn or worn off. The spare keeps its item, its fields
          and its history — only the code changes, and the old one stays in the history.
        </p>
        <label className="mt-3 block text-xs font-medium text-slate-600">
          Current code
          <p className="mt-1 font-mono text-sm text-slate-500">kobiybaamb</p>
        </label>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-600">New code</p>
          {newQr ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="min-w-0 break-all font-mono text-sm text-emerald-900">{newQr}</span>
              <button type="button" onClick={() => { setNewQr(''); setScanning(true) }}
                className="shrink-0 text-xs font-medium text-emerald-700 hover:underline">
                Scan again
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setScanning(true)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-3 text-sm font-medium text-purple-700">
              <ScanIcon className="h-4 w-4" />
              Scan the new sticker
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!newQr}
            className="flex-1 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-on-brand disabled:opacity-60">
            Replace code
          </button>
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-500">Cancel</button>
        </div>
      </div>

      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Scan the new sticker</p>
              <p className="truncate text-xs text-slate-500">Replacing the code on Probe Skin Temperature Warmer</p>
            </div>
            <button type="button" onClick={() => setScanning(false)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QRScanner onDecode={(t) => { setNewQr(t); setScanning(false) }} />
          </div>
        </div>
      )}
    </div>
  )
}

/*
 * The other scanner, the one that must NOT check for CYR/.
 *
 * This field reads the client's own catalogue number off the part, so the
 * code it is pointed at is somebody else's by definition. It sits here
 * next to the remap scanner because the two want opposite answers from
 * the same component, and that is exactly the pair a change to either can
 * quietly break.
 */
function BarcodePanel() {
  const [value, setValue] = useState<unknown>('')
  return (
    <div className="border-t border-slate-200 px-4 pt-5" data-testid="barcode-panel">
      <h2 className="text-sm font-semibold text-slate-900">Client item code</h2>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">Any code goes — this one is not a Cyrix sticker.</p>
      <BarcodeItemInput value={value} onChange={setValue} baseClass="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
  )
}

function Harness() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <CyrixLogo height={18} showSubtitle={false} />
        <Avatar name="Kevin Raju" src={null} className="h-8 w-8 text-xs" />
      </header>

      <main className="flex-1 pb-20 sm:pb-6 lg:pb-10">
        <RemapPanel />
        <BarcodePanel />
        <div className="space-y-3 p-4">
          {['Spares tagged', 'Pending approvals', 'Warehouses'].map((t) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-surface p-5">
              <p className="text-sm text-slate-500">{t}</p>
              <p className="text-2xl font-semibold text-slate-900">1</p>
            </div>
          ))}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto overscroll-x-contain border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_50vh_0_var(--color-surface)] sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map(({ to, label, icon: Icon, activeText, pillBg }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex min-w-[72px] flex-none flex-col items-center gap-1 px-1.5 py-2 text-xs font-medium text-slate-500"
          >
            {({ isActive }) => (
              <>
                <span className={`relative grid h-8 w-11 place-items-center rounded-full transition-colors ${isActive ? pillBg : ''}`}>
                  <Icon className={`h-5 w-5 ${activeText}`} />
                </span>
                <span className={`whitespace-nowrap px-0.5 text-center ${isActive ? activeText : 'text-slate-500'}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        <a
          href="/"
          className="sticky right-0 flex min-w-[72px] flex-none flex-col items-center gap-1 border-l border-slate-200 bg-surface px-1.5 py-2 text-xs font-medium text-slate-500 shadow-[-7px_0_14px_-5px_rgb(0_0_0/0.28)]"
          aria-label="All Cyrix apps"
        >
          <span className="grid h-8 w-11 place-items-center rounded-full">
            <GridIcon className="h-5 w-5" />
          </span>
          <span className="whitespace-nowrap px-0.5 text-center">Apps</span>
        </a>
      </nav>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
)
