import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { ExternalLink, Bot } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const RANGES = ['today', '7d', '30d', 'custom']
const PLATFORMS = ['all', 'facebook', 'instagram', 'youtube']
const TABS = ['overview', 'staff', 'posts', 'ai']
const COLORS = { facebook: '#60a5fa', instagram: '#f472b6', youtube: '#ef4444', brand: '#8b7cf6', ok: '#34d399', warn: '#fbbf24', bad: '#f87171', muted: '#9ca3af' }

// حدود الفترة (ISO) بتوقيت جهاز المستخدم. الأيام نفسها بتتجمّع بتوقيت القاهرة جوه الداتابيز
function bounds(range, customFrom, customTo) {
  const now = new Date()
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to: null } }
  if (range === '7d') return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: null }
  if (range === '30d') return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: null }
  if (!customFrom || !customTo) return null
  let a = customFrom, b = customTo
  if (a > b) [a, b] = [b, a]
  const end = new Date(b); end.setHours(23, 59, 59, 999)
  return { from: new Date(a).toISOString(), to: new Date(end.getTime() + 1).toISOString() }
}

function minutesLabel(m, t) {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${m} ${t('comments.reports.min')}`
  const h = Math.floor(m / 60), r = m % 60
  return h >= 24 ? `${(m / 1440).toFixed(1)} ${t('comments.reports.day')}` : `${h} ${t('comments.reports.hr')}${r ? ` ${r} ${t('comments.reports.min')}` : ''}`
}

const fmt = (n) => Number(n || 0).toLocaleString()
const usd = (n, d = 4) => `$${Number(n || 0).toFixed(d)}`

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5">
      <p className="text-[11px] text-fg-subtle">{label}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${tone || 'text-fg'}`}>{value}</p>
      {hint && <p className="text-[10px] text-fg-subtle mt-0.5">{hint}</p>}
    </div>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-surface-2 border border-surface-3 rounded-2xl p-4 ${className}`}>
      {title && <p className="text-sm font-semibold text-fg mb-3">{title}</p>}
      {children}
    </div>
  )
}

function Bars({ rows, color = 'bg-brand' }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 flex-shrink-0 text-fg-muted truncate">{r.label}</span>
          <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${r.color || color}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-12 text-end tabular-nums text-fg">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

const axisProps = { stroke: COLORS.muted, tick: { fontSize: 10, fill: COLORS.muted }, tickLine: false, axisLine: false }
const tooltipProps = { contentStyle: { background: '#1f2030', border: '1px solid #33354a', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#e5e7eb' } }

export default function CommentsReports() {
  const { t } = useTranslation()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState('7d')
  const [platform, setPlatform] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const b = useMemo(() => bounds(range, customFrom, customTo), [range, customFrom, customTo])
  const isAi = tab === 'ai'

  const load = useCallback(async () => {
    if (!b) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: b.from, platform })
      if (b.to) qs.set('to', b.to)
      const res = await apiFetch(`${API_URL}/comments/reports/${isAi ? 'ai' : 'overview'}?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err) { toast.error(err.message); setData(null) } finally { setLoading(false) }
  }, [b, platform, isAi]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setData(null); load() }, [load])

  const days = (data?.by_day || []).map(d => ({ ...d, label: String(d.day).slice(5) }))
  const hours = useMemo(() => {
    const map = new Map((data?.by_hour || []).map(h => [h.hour, h.n]))
    return Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2, '0'), n: map.get(h) || 0 }))
  }, [data])

  const pill = (active) => `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-3 space-y-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map(k => <button key={k} onClick={() => setTab(k)} className={pill(tab === k)}>{t(`comments.reports.tabs.${k}`)}</button>)}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {RANGES.map(k => <button key={k} onClick={() => setRange(k)} className={pill(range === k)}>{t(`comments.reports.ranges.${k}`)}</button>)}
          <span className="w-px bg-surface-3 flex-shrink-0" />
          {PLATFORMS.map(k => <button key={k} onClick={() => setPlatform(k)} className={pill(platform === k)}>{t(`comments.platforms.${k}`)}</button>)}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 bg-surface-2 rounded-xl p-3 border border-surface-3">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="flex-1 bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="flex-1 bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" />
          </div>
        )}

        {loading || !data ? (
          <div className="flex items-center justify-center h-40">
            {loading ? <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <p className="text-sm text-fg-subtle">{t('comments.reports.pickRange')}</p>}
          </div>
        ) : tab === 'overview' ? (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi label={t('comments.reports.received')} value={fmt(data.received)} />
            <Kpi label={t('comments.reports.handled')} value={fmt(data.by_status?.handled)} hint={data.received ? `${Math.round(((data.by_status?.handled || 0) / data.received) * 100)}%` : null} tone="text-success" />
            <Kpi label={t('comments.reports.awaiting')} value={fmt(data.backlog?.total)} hint={t('comments.reports.awaitingHint')} tone={data.backlog?.total ? 'text-amber-500' : undefined} />
            <Kpi label={t('comments.reports.medianResponse')} value={minutesLabel(data.response?.median, t)} hint={t('comments.reports.avgHint', { v: minutesLabel(data.response?.avg, t) })} />
            <Kpi label={t('comments.reports.publicReplies')} value={fmt(data.public_replies)} />
            <Kpi label={t('comments.reports.privateReplies')} value={fmt(data.private_replies)} />
            <Kpi label={t('comments.reports.deleted')} value={fmt(data.deleted)} />
            <Kpi label={t('comments.reports.hidden')} value={fmt(data.hidden)} />
          </div>

          <Card title={t('comments.reports.perDay')}>
            {days.length === 0 ? <p className="text-xs text-fg-subtle">{t('comments.reports.noData')}</p> : (
              <div className="h-56" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={days}>
                    <CartesianGrid stroke="#33354a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={32} />
                    <Tooltip {...tooltipProps} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="facebook" name={t('comments.platforms.facebook')} stackId="a" fill={COLORS.facebook} />
                    <Bar dataKey="instagram" name={t('comments.platforms.instagram')} stackId="a" fill={COLORS.instagram} />
                    <Bar dataKey="youtube" name={t('comments.platforms.youtube')} stackId="a" fill={COLORS.youtube} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card title={t('comments.reports.byHour')}>
              <div className="h-44" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={hours}>
                    <XAxis dataKey="hour" {...axisProps} interval={2} /><YAxis {...axisProps} width={28} />
                    <Tooltip {...tooltipProps} /><Bar dataKey="n" name={t('comments.reports.received')} fill={COLORS.brand} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-fg-subtle mt-1">{t('comments.reports.cairoTime')}</p>
            </Card>
            <Card title={t('comments.reports.aging')}>
              <Bars rows={[
                { label: t('comments.reports.age.lt1h'), value: data.backlog?.lt1h || 0, color: 'bg-success' },
                { label: t('comments.reports.age.h1_6'), value: data.backlog?.h1_6 || 0, color: 'bg-success' },
                { label: t('comments.reports.age.h6_24'), value: data.backlog?.h6_24 || 0, color: 'bg-amber-500' },
                { label: t('comments.reports.age.d1_3'), value: data.backlog?.d1_3 || 0, color: 'bg-amber-500' },
                { label: t('comments.reports.age.gt3d'), value: data.backlog?.gt3d || 0, color: 'bg-danger' },
              ]} />
              <p className="text-[10px] text-fg-subtle mt-2">{t('comments.reports.unassignedCount', { n: fmt(data.backlog?.unassigned) })}</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card title={t('comments.reports.handledBy')}>
              <Bars rows={[
                { label: t('comments.reports.by.human'), value: data.handled_by?.human || 0 },
                { label: t('comments.reports.by.ai'), value: data.handled_by?.ai || 0, color: 'bg-emerald-500' },
                { label: t('comments.reports.by.external'), value: data.handled_by?.external || 0, color: 'bg-surface-3' },
              ]} />
              <p className="text-[10px] text-fg-subtle mt-2">{t('comments.reports.externalHint')}</p>
              {(data.response?.human_median != null || data.response?.ai_median != null) && (
                <p className="text-[11px] text-fg-muted mt-2">
                  {t('comments.reports.human')}: {minutesLabel(data.response?.human_median, t)} · {t('comments.reports.by.ai')}: {minutesLabel(data.response?.ai_median, t)}
                </p>
              )}
            </Card>
            <Card title={t('comments.reports.byPlatform')}>
              <Bars rows={['facebook', 'instagram', 'youtube'].map(p => ({ label: t(`comments.platforms.${p}`), value: data.by_platform?.[p] || 0, color: p === 'facebook' ? 'bg-blue-400' : p === 'instagram' ? 'bg-pink-400' : 'bg-red-500' }))} />
            </Card>
          </div>
        </>) : tab === 'staff' ? (
          <Card title={t('comments.reports.tabs.staff')}>
            {(data.by_agent || []).length === 0 ? <p className="text-xs text-fg-subtle py-4 text-center">{t('comments.reports.noData')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-fg-subtle text-start">
                    <th className="text-start font-medium pb-2">{t('comments.reports.agent')}</th>
                    <th className="font-medium pb-2">{t('comments.reports.handled')}</th>
                    <th className="font-medium pb-2">{t('comments.reports.publicReplies')}</th>
                    <th className="font-medium pb-2">{t('comments.reports.privateReplies')}</th>
                    <th className="font-medium pb-2">{t('comments.reports.medianResponse')}</th>
                  </tr></thead>
                  <tbody>
                    {data.by_agent.map(a => (
                      <tr key={a.id} className="border-t border-surface-3 text-center tabular-nums">
                        <td className="py-2 text-start text-fg font-medium">
                          {a.name}{a.role === 'ai' && <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 inline-flex items-center gap-0.5"><Bot size={9} />AI</span>}
                        </td>
                        <td className="py-2 text-fg">{fmt(a.handled)}</td><td className="py-2 text-fg-muted">{fmt(a.public_replies)}</td>
                        <td className="py-2 text-fg-muted">{fmt(a.private_replies)}</td><td className="py-2 text-fg-muted">{minutesLabel(a.median_minutes, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : tab === 'posts' ? (
          <Card title={t('comments.reports.topPosts')}>
            {(data.top_posts || []).length === 0 ? <p className="text-xs text-fg-subtle py-4 text-center">{t('comments.reports.noData')}</p> : (
              <div className="space-y-2">
                {data.top_posts.map(p => (
                  <a key={p.post_id} href={p.permalink || undefined} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-surface rounded-xl p-2 hover:bg-surface-3">
                    {p.thumbnail && <img src={p.thumbnail} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-surface-3 flex-shrink-0" onError={e => { e.target.style.display = 'none' }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-fg line-clamp-2">{p.caption || t('comments.untitledPost')}</p>
                      <p className="text-[10px] text-fg-subtle mt-0.5">{t(`comments.platforms.${p.platform}`)}</p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="text-sm font-bold text-fg tabular-nums">{fmt(p.n)}</p>
                      {p.pending > 0 && <p className="text-[10px] text-amber-500 tabular-nums">{t('comments.reports.pendingN', { n: fmt(p.pending) })}</p>}
                    </div>
                    {p.permalink && <ExternalLink size={12} className="text-fg-subtle flex-shrink-0" />}
                  </a>
                ))}
              </div>
            )}
          </Card>
        ) : (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi label={t('comments.reports.ai.totalCost')} value={usd(data.cost_usd, 3)} tone="text-brand" hint={t('comments.reports.ai.estimate')} />
            <Kpi label={t('comments.reports.ai.costPerReply')} value={usd(data.by_status?.replied ? data.cost_usd / data.by_status.replied : 0)} hint={t('comments.reports.ai.perPosted')} />
            <Kpi label={t('comments.reports.ai.processed')} value={fmt(data.total)} />
            <Kpi label={t('comments.reports.ai.tokens')} value={fmt((data.input_tokens || 0) + (data.output_tokens || 0))} hint={`${fmt(data.input_tokens)} / ${fmt(data.output_tokens)}`} />
          </div>
          <Card title={t('comments.reports.ai.statuses')}>
            <Bars rows={[
              { label: t('comments.ai.status.replied'), value: data.by_status?.replied || 0, color: 'bg-success' },
              { label: t('comments.ai.status.draft'), value: data.by_status?.draft || 0, color: 'bg-brand' },
              { label: t('comments.ai.status.skipped'), value: data.by_status?.skipped || 0, color: 'bg-surface-3' },
              { label: t('comments.ai.status.escalated'), value: data.by_status?.escalated || 0, color: 'bg-amber-500' },
              { label: t('comments.ai.status.failed'), value: data.by_status?.failed || 0, color: 'bg-danger' },
              { label: t('comments.ai.status.pending'), value: (data.by_status?.pending || 0) + (data.by_status?.processing || 0), color: 'bg-surface-3' },
            ]} />
          </Card>
          <Card title={t('comments.reports.ai.perDay')}>
            {(data.by_day || []).length === 0 ? <p className="text-xs text-fg-subtle">{t('comments.reports.noData')}</p> : (
              <div className="h-56" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={(data.by_day || []).map(d => ({ ...d, label: String(d.day).slice(5) }))}>
                    <CartesianGrid stroke="#33354a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} width={32} />
                    <Tooltip {...tooltipProps} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="replied" name={t('comments.ai.status.replied')} stackId="a" fill={COLORS.ok} />
                    <Bar dataKey="draft" name={t('comments.ai.status.draft')} stackId="a" fill={COLORS.brand} />
                    <Bar dataKey="skipped" name={t('comments.ai.status.skipped')} stackId="a" fill={COLORS.muted} />
                    <Bar dataKey="escalated" name={t('comments.ai.status.escalated')} stackId="a" fill={COLORS.warn} />
                    <Bar dataKey="failed" name={t('comments.ai.status.failed')} stackId="a" fill={COLORS.bad} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card title={t('comments.reports.ai.costPerDay')}>
            {(data.by_day || []).length === 0 ? <p className="text-xs text-fg-subtle">{t('comments.reports.noData')}</p> : (
              <Bars rows={data.by_day.map(d => ({ label: String(d.day).slice(5), value: Number(d.cost) || 0 }))} />
            )}
          </Card>
          <div className="grid lg:grid-cols-2 gap-3">
            <Card title={t('comments.reports.byPlatform')}>
              {(data.by_platform || []).length === 0 ? <p className="text-xs text-fg-subtle">{t('comments.reports.noData')}</p> : (
                <div className="space-y-1.5">
                  {data.by_platform.map(p => (
                    <div key={p.platform || 'x'} className="flex items-center text-xs gap-2">
                      <span className="flex-1 text-fg">{t(`comments.platforms.${p.platform}`, { defaultValue: p.platform || '—' })}</span>
                      <span className="text-fg-muted tabular-nums">{fmt(p.replied)}/{fmt(p.n)}</span>
                      <span className="w-20 text-end text-fg tabular-nums">{usd(p.cost, 3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={t('comments.reports.ai.byModel')}>
              {(data.by_model || []).length === 0 ? <p className="text-xs text-fg-subtle">{t('comments.reports.noData')}</p> : (
                <div className="space-y-1.5">
                  {data.by_model.map(m => (
                    <div key={m.model} className="flex items-center text-xs gap-2">
                      <span className="flex-1 text-fg truncate" dir="ltr">{m.model}</span>
                      <span className="text-fg-muted tabular-nums">{fmt(m.n)}</span>
                      <span className="w-20 text-end text-fg tabular-nums">{usd(m.cost, 3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <p className="text-[10px] text-fg-subtle">{t('comments.reports.ai.disclaimer')}</p>
        </>)}
      </div>
    </div>
  )
}
