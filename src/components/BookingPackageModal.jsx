import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { getPackages } from '../lib/staticData'
import { useToast } from '../contexts/ToastContext'
import { Package } from 'lucide-react'

const isoDay = (d) => d.toISOString().slice(0, 10)
const addDays = (dayStr, days) => { const d = new Date(`${dayStr}T00:00:00`); d.setDate(d.getDate() + days); return isoDay(d) }

// اختيار الباقة الإجباري لما العميل يتحط في «تم الحجز» / «تجديد الاشتراك». بيسجّل الاشتراك (سجل الاشتراكات: كام مرة جدّد وكل مرة إيه الباقة)
// وبعدها المتصل بيحدّث المرحلة. onDone(contact) بيتنادى بعد ما الباقة اتحفظت
export default function BookingPackageModal({ contact, stageName, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const today = isoDay(new Date())
  const [packages, setPackages] = useState([])
  const [packageId, setPackageId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { getPackages().then(setPackages).catch(() => setPackages([])) }, [])

  const pick = (id, start = startDate) => {
    setPackageId(id)
    const pkg = packages.find(p => p.id === id)
    setExpiresAt(pkg?.default_duration_days ? addDays(start, pkg.default_duration_days) : '')
  }

  const confirm = async () => {
    if (!packageId) return
    setSaving(true)
    try {
      const res = await apiFetch(`${API_URL}/contacts/${contact.id}/package`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: packageId,
          expires_at: expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : null,
          started_at: startDate && startDate !== today ? new Date(`${startDate}T12:00:00`).toISOString() : undefined,
          keep_schedule: false
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'save failed')
      onDone(data.contact, packages.find(p => p.id === packageId))
    } catch (err) {
      toast.error(t('booking.saveError', { message: err.message }))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-surface-3">
          <Package size={16} className="text-brand" />
          <span className="font-semibold text-fg text-sm">{t('booking.title', { stage: stageName })}</span>
        </div>
        <div className="p-4 space-y-3.5">
          <p className="text-xs text-fg-muted">{t('booking.hint')}</p>
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('booking.package')}</label>
            <select value={packageId} onChange={e => pick(e.target.value)} autoFocus
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="">{t('booking.choose')}</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs text-fg-muted mb-1">{t('booking.startDate')}</label>
              <input type="date" value={startDate} max={today} min={addDays(today, -30)}
                onChange={e => { setStartDate(e.target.value); if (packageId) pick(packageId, e.target.value) }}
                className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">{t('booking.expiresAt')}</label>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-surface-3">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-50">{t('booking.cancel')}</button>
          <button onClick={confirm} disabled={saving || !packageId}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('booking.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
