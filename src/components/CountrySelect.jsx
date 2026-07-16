import { useState, useRef, useEffect } from 'react'
import { COUNTRIES, COUNTRY_MAP } from '../lib/countries'
import { ChevronDown, Search } from 'lucide-react'

// قايمة اختيار دولة قابلة للبحث — بديل عن مربع نص حر، بتخزن كود ISO2 (زي "EG") مش اسم حر
export default function CountrySelect({ value, onChange, placeholder = 'اختار الدولة' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = value ? COUNTRY_MAP[value] : null
  const filtered = COUNTRIES.filter(c => !search || c.name.includes(search) || c.code.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-2 text-fg-muted">{selected.code}</span>
            <span>{selected.name}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">{placeholder}</span>
        )}
        <ChevronDown size={14} className={`text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-surface-3">
            <div className="relative">
              <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="دور على دولة..."
                className="w-full bg-surface-3 rounded-lg py-1.5 px-3 pr-7 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {value && (
              <button type="button" onClick={() => { onChange(null); setOpen(false); setSearch('') }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface-3/60 text-xs text-danger text-right">
                مسح الاختيار
              </button>
            )}
            {filtered.map(c => (
              <button key={c.code} type="button" onClick={() => { onChange(c.code); setOpen(false); setSearch('') }}
                className={`flex items-center gap-2 w-full px-3 py-2 hover:bg-surface-3/60 text-sm text-right ${value === c.code ? 'bg-surface-3/60' : ''}`}>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-3 text-fg-muted flex-shrink-0">{c.code}</span>
                <span className="text-fg truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-fg-subtle text-xs py-4">مفيش نتايج</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
