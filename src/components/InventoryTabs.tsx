import { NavLink } from 'react-router-dom'

/**
 * Tagged spares and the item masters, as two views of one section.
 *
 * They were separate top-level tabs, which put two closely related lists a
 * whole navigation apart and cost a slot in a bar that only has room for
 * five on a phone. They answer the same question from opposite ends — what
 * is on this tag, and what does the catalogue call it — so they belong
 * beside each other.
 *
 * The routes are unchanged. /tagged and /items are in people's history and
 * in QR links printed on real equipment; nesting them under a new prefix
 * would have broken those to save a word in this file.
 */
const TABS = [
  { to: '/tagged', label: 'Tagged' },
  { to: '/items', label: 'Items' },
]

export function InventoryTabs() {
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-emerald-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </div>
  )
}
