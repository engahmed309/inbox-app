import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/locale'
import { Repeat } from 'lucide-react'

// سجل اشتراكات العميل: كام مرة اشترك وجدّد، وكل مرة أخد باقة إيه ومن امتى لامتى
export default function SubscriptionHistory({ contactId, refreshKey = 0 }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!contactId) return
    let cancelled = false
    supabase.from('contact_subscriptions')
      .select('id, kind, seq, package_name, started_at, expires_at, source')
      .eq('contact_id', contactId).order('seq', { ascending: false })
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [contactId, refreshKey])

  if (!rows?.length) return null
  const renewals = rows.filter(r => r.kind === 'renewal').length

  return (
    <div className="bg-surface-3 rounded-xl p-3 space-y-2">
      <p className="text-xs font-medium text-fg-muted flex items-center gap-1.5">
        <Repeat size={12} /> {t('subscriptions.title')}
        <span className="ms-auto text-fg">{t('subscriptions.summary', { total: rows.length, renewals })}</span>
      </p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-start gap-2 text-xs">
            <span className={`flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${r.kind === 'renewal' ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand'}`}>
              {r.kind === 'renewal' ? t('subscriptions.renewal') : t('subscriptions.new')} #{r.seq}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-fg truncate">{r.package_name || t('subscriptions.unknownPackage')}</p>
              <p className="text-[10px] text-fg-subtle">
                {r.started_at ? formatDate(r.started_at) : t('subscriptions.unknownDate')}
                {r.expires_at ? ` ← ${formatDate(r.expires_at)}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
