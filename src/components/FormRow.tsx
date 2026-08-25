import type { ReactNode } from 'react'

/**
 * One labelled field, sized to be a cell in the form's grid.
 *
 * The label always sits above its control, so a phone and a desktop read the
 * same way; what changes is how many of these share a row. Short controls
 * pair up two-across once there's width for it, and anything that needs the
 * full measure -- a photo dropzone, a paragraph, the field carrying the Cyrix
 * suggestions -- claims the whole row via `fullWidth`.
 */
export function FormRow({
  label,
  htmlFor,
  required,
  badge,
  fullWidth,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  /** Small marker shown beside the label, e.g. the "From scan" chip. */
  badge?: ReactNode
  fullWidth?: boolean
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${fullWidth ? 'lg:col-span-2' : ''}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {badge}
      </div>
      {children}
    </div>
  )
}
