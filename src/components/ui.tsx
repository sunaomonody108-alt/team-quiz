import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-white text-blue-700 border-2 border-blue-600 hover:bg-blue-50 disabled:opacity-40',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'bg-transparent text-slate-600 underline disabled:opacity-40',
}

export function Button({
  variant = 'primary',
  big = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      {...rest}
      className={`rounded-2xl font-bold transition disabled:cursor-not-allowed ${
        big ? 'px-8 py-5 text-2xl' : 'px-5 py-3 text-lg'
      } ${variants[variant]} ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100 ${className}`}>{children}</div>
}

export function Screen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className={`mx-auto px-4 py-6 ${wide ? 'max-w-6xl' : 'max-w-md'}`}>{children}</div>
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const c = {
    info: 'bg-blue-50 text-blue-900 ring-blue-200',
    ok: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-900 ring-red-200',
  }[tone]
  return <div className={`rounded-2xl px-4 py-3 ring-1 ${c}`}>{children}</div>
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 20,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
      />
    </label>
  )
}
