import React from 'react'

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-agent-researcher text-base-950 hover:bg-[#6BDBEE] font-semibold',
    ghost: 'border border-base-600 text-ink-100 hover:bg-base-800',
    danger: 'bg-agent-critic/15 text-agent-critic border border-agent-critic/30 hover:bg-agent-critic/25',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Input({ label, error, className = '', id, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm text-ink-400">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`rounded-md border border-base-600 bg-base-900 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 focus:border-agent-researcher outline-none transition-colors ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-agent-critic">{error}</span>}
    </div>
  )
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`rounded-lg border border-base-700 bg-base-900 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-base-800 text-ink-400 border-base-600',
    running: 'bg-agent-researcher/10 text-agent-researcher border-agent-researcher/30',
    success: 'bg-trust/10 text-trust border-trust/30',
    danger: 'bg-agent-critic/10 text-agent-critic border-agent-critic/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium font-mono ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}


/**
 * Two-up choice cards, used for the role selector on sign-in and sign-up.
 * A radio group rather than a <select> on purpose: there are two options and
 * each needs a line of explanation, and "platform admin" is not a choice
 * anyone should make from a collapsed dropdown without reading what it means.
 */
export function RoleChoice({ label, value, onChange, options, disabled = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-400">{label}</span>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                active
                  ? 'border-agent-researcher bg-agent-researcher/10'
                  : 'border-base-600 hover:bg-base-800'
              }`}
            >
              <span className="block text-sm font-medium text-ink-100">{opt.label}</span>
              <span className="mt-0.5 block font-mono text-[11px] leading-snug text-ink-600">{opt.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'border-agent-researcher/30 bg-agent-researcher/10 text-ink-200',
    warn: 'border-trust-warn/30 bg-trust-warn/10 text-ink-200',
    danger: 'border-agent-critic/30 bg-agent-critic/10 text-ink-200',
  }
  return (
    <div className={`rounded-md border px-3 py-2.5 text-sm ${tones[tone]}`}>{children}</div>
  )
}
