import { SearchIcon, XIcon } from './icons'

/**
 * A search box with a clear button.
 *
 * Every search in the app is a filter over something already on screen, so
 * getting back to the unfiltered list has to be one action -- selecting the
 * text and deleting it is not that. The button only appears once there is
 * something to clear, so it never sits there as dead weight.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  size = 'md',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const small = size === 'sm'
  const icon = small ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div className={`relative ${className}`}>
      <SearchIcon
        className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 ${icon}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // Escape clears too -- the habit most people already have from
        // browser and OS search fields.
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        className={`w-full rounded-lg border border-slate-300 bg-surface pl-8 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
          small ? 'py-1.5 pr-7 text-xs' : 'py-2 pr-9 text-sm'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${
            small ? 'p-1' : 'p-1.5'
          }`}
        >
          <XIcon className={small ? 'h-3 w-3' : 'h-4 w-4'} />
        </button>
      )}
    </div>
  )
}
