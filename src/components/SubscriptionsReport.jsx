import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const fmt = (n) => Number(n || 0).toLocaleString()

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5">
      <p className="text-[11px] text-fg-subtle">{label}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${tone || 'text-fg'}`}>{value}</p>
      {hint && <p className="text-[10px] text-fg-subtle mt-0.5">{hint}</p>}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl p-4">
      {title && <p className="text-sm font-semibold text-fg mb-3">{title}</p>}
      {children}
    </div>
  )
}

// تقرير الاشتراكات والتجديدات: كام عميل جدّد (مرة/اتنين/٣+)، توزيع الباقات، واشتراكات كل شهر (جديد مقابل تجديد)
export default function SubscriptionsReport() {
  const { t } = useTranslation()
  const toast = useToast()
  const [data, setData] = useState(null)

  useEffect(() => {
    apiFetch(`${API_URL}/reports/subscriptions`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d) })
      .catch(err => toast.error(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const pct = data.customers ? Math.round((data.renewed_customers / data.customers) * 100) : 0
  const maxN = Math.max(1, ...(data.by_renewals || []).map(r => r.customers))

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi label={t('reports.subs.customers')} value={fmt(data.customers)} />
        <Kpi label={t('reports.subs.total')} value={fmt(data.total_subscriptions)} />
        <Kpi label={t('reports.subs.renewed')} value={fmt(data.renewed_customers)} tone="text-success" hint={t('reports.subs.renewedPct', { pct })} />
      </div>

      <Card title={t('reports.subs.byRenewals')}>
        <div className="space-y-2">
          {(data.by_renewals || []).map(r => (
            <div key={r.renewals} className="flex items-center gap-2 text-xs">
              <span className="w-24 flex-shrink-0 text-fg-muted">{r.renewals === 0 ? t('reports.subs.noRenewal') : r.renewals >= 5 ? t('reports.subs.renewals5') : t('reports.subs.renewalsN', { n: r.renewals })}</span>
              <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(r.customers / maxN) * 100}%` }} />
              </div>
              <span className="w-14 text-end tabular-nums text-fg">{fmt(r.customers)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('reports.subs.byPackage')}>
        <table className="w-full text-xs">
          <thead><tr className="text-fg-subtle">
            <th className="text-start font-medium pb-2">{t('reports.subs.package')}</th>
            <th className="font-medium pb-2">{t('reports.subs.new')}</th>
            <th className="font-medium pb-2">{t('reports.subs.renewal')}</th>
          </tr></thead>
          <tbody>
            {(data.by_package || []).map(p => (
              <tr key={p.name} className="border-t border-surface-3">
                <td className="py-1.5 text-fg">{p.name}</td>
                <td className="py-1.5 text-center tabular-nums text-fg">{fmt(p.new)}</td>
                <td className="py-1.5 text-center tabular-nums text-success">{fmt(p.renewal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={t('reports.subs.byMonth')}>
        <table className="w-full text-xs">
          <thead><tr className="text-fg-subtle">
            <th className="text-start font-medium pb-2">{t('reports.subs.month')}</th>
            <th className="font-medium pb-2">{t('reports.subs.new')}</th>
            <th className="font-medium pb-2">{t('reports.subs.renewal')}</th>
          </tr></thead>
          <tbody>
            {(data.by_month || []).map(m => (
              <tr key={m.month} className="border-t border-surface-3">
                <td className="py-1.5 text-fg tabular-nums">{m.month}</td>
                <td className="py-1.5 text-center tabular-nums text-fg">{fmt(m.new)}</td>
                <td className="py-1.5 text-center tabular-nums text-success">{fmt(m.renewal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-fg-subtle">{t('reports.subs.note')}</p>
    </div>
  )
}
