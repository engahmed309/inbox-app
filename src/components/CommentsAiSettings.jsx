import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Power, FileText, Zap, Check, X, ExternalLink, FlaskConical, Save } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'
import LinkifiedText from './LinkifiedText'

const MODES = [
  { key: 'off', icon: Power, tone: 'text-fg-muted' },
  { key: 'draft', icon: FileText, tone: 'text-brand' },
  { key: 'live', icon: Zap, tone: 'text-success' },
]
const STATUS_FILTERS = ['all', 'draft', 'replied', 'skipped', 'escalated', 'failed']
const STATUS_STYLE = {
  replied: 'bg-success/15 text-success', draft: 'bg-brand/15 text-brand', skipped: 'bg-surface-3 text-fg-subtle',
  escalated: 'bg-amber-500/15 text-amber-500', failed: 'bg-danger/15 text-danger', rejected: 'bg-surface-3 text-fg-subtle',
  pending: 'bg-surface-3 text-fg-subtle', processing: 'bg-surface-3 text-fg-subtle',
}

function Section({ title, hint, children }) {
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl p-4">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {hint && <p className="text-[11px] text-fg-subtle mt-0.5 mb-3 leading-relaxed">{hint}</p>}
      {!hint && <div className="h-3" />}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <span className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
        <span className="block w-9 h-5 rounded-full bg-surface-3 peer-checked:bg-brand transition-colors" />
        <span className="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] text-fg">{label}</span>
        {hint && <span className="block text-[11px] text-fg-subtle leading-relaxed">{hint}</span>}
      </span>
    </label>
  )
}

function NumberField({ label, value, onChange, suffix, placeholder, step = 1, min = 0 }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-fg-muted mb-1">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="number" min={min} step={step} value={value ?? ''} placeholder={placeholder}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg tabular-nums" />
        {suffix && <span className="text-[11px] text-fg-subtle flex-shrink-0">{suffix}</span>}
      </div>
    </label>
  )
}

export default function CommentsAiSettings() {
  const { t } = useTranslation()
  const toast = useToast()
  const [sub, setSub] = useState('settings')
  const [meta, setMeta] = useState(null)       // { available, models, channels }
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)     // آخر نسخة محفوظة — عشان نعرف فيه تعديل ولا لأ
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch(`${API_URL}/comments/ai/settings`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setMeta(d); setForm(d.settings); setSaved(d.settings) })
      .catch(err => toast.error(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved)

  const save = async (override) => {
    const body = { ...form, ...override }
    setSaving(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setForm(d.settings); setSaved(d.settings)
      toast.success(t('comments.ai.saved'))
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const pickMode = (mode) => {
    if (mode === form.mode) return
    if (mode === 'live' && !window.confirm(t('comments.ai.liveConfirm'))) return
    set({ mode })
    save({ mode })   // تغيير الوضع بيتحفظ فورًا — مفيش "حفظ" ناسيه والوكيل شغال بوضع قديم
  }

  if (!form || !meta) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const pill = (active) => `px-3.5 py-1.5 rounded-full text-xs font-medium ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`
  const channelsOfPlatforms = meta.channels.filter(c => form.platforms.includes(c.platform))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <div className="flex gap-2">
          <button onClick={() => setSub('settings')} className={pill(sub === 'settings')}>{t('comments.ai.tabs.settings')}</button>
          <button onClick={() => setSub('review')} className={pill(sub === 'review')}>{t('comments.ai.tabs.review')}</button>
        </div>

        {!meta.available && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl p-3">{t('comments.ai.noKey')}</div>
        )}

        {sub === 'review' ? <ReviewList /> : (<>
          <Section title={t('comments.ai.modeTitle')} hint={t('comments.ai.modeHint')}>
            <div className="grid sm:grid-cols-3 gap-2">
              {MODES.map(m => {
                const Icon = m.icon
                const active = form.mode === m.key
                return (
                  <button key={m.key} onClick={() => pickMode(m.key)} disabled={saving}
                    className={`text-start rounded-xl p-3 border transition-colors ${active ? 'border-brand bg-brand/10' : 'border-surface-3 bg-surface hover:bg-surface-3'}`}>
                    <span className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-brand' : m.tone}`}><Icon size={15} />{t(`comments.ai.mode.${m.key}`)}</span>
                    <span className="block text-[11px] text-fg-subtle mt-1 leading-relaxed">{t(`comments.ai.modeDesc.${m.key}`)}</span>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title={t('comments.ai.scopeTitle')} hint={t('comments.ai.scopeHint')}>
            <div className="flex gap-2 flex-wrap mb-3">
              {['facebook', 'instagram'].map(p => {
                const on = form.platforms.includes(p)
                return (
                  <button key={p} onClick={() => set({ platforms: on ? form.platforms.filter(x => x !== p) : [...form.platforms, p], channel_ids: null })}
                    className={pill(on)}>{on ? '✓ ' : ''}{t(`comments.platforms.${p}`)}</button>
                )
              })}
            </div>
            {channelsOfPlatforms.length > 1 && (
              <div>
                <p className="text-[11px] text-fg-muted mb-1.5">{t('comments.ai.channelsTitle')}</p>
                <div className="flex gap-2 flex-wrap">
                  {channelsOfPlatforms.map(c => {
                    const ids = form.channel_ids || []
                    const on = ids.includes(c.id)
                    return <button key={c.id} onClick={() => set({ channel_ids: on ? ids.filter(x => x !== c.id) : [...ids, c.id] })} className={pill(on)}>
                      {c.custom_name || t(`comments.platforms.${c.platform}`)}</button>
                  })}
                </div>
                <p className="text-[10px] text-fg-subtle mt-1.5">{t('comments.ai.channelsHint')}</p>
              </div>
            )}
            <p className="text-[10px] text-fg-subtle mt-3">{t('comments.ai.youtubeNote')}</p>
          </Section>

          <Section title={t('comments.ai.promptTitle')} hint={t('comments.ai.promptHint')}>
            <textarea value={form.system_prompt} onChange={e => set({ system_prompt: e.target.value })} rows={14}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-[13px] text-fg leading-relaxed" />
            <p className="text-[10px] text-fg-subtle mt-1">{form.system_prompt.length} / 8000</p>
            <div className="mt-2 divide-y divide-surface-3">
              <Toggle checked={form.reply_to_replies} onChange={v => set({ reply_to_replies: v })}
                label={t('comments.ai.replyToReplies')} hint={t('comments.ai.replyToRepliesHint')} />
              <Toggle checked={form.use_knowledge} onChange={v => set({ use_knowledge: v })}
                label={t('comments.ai.useKnowledge')} hint={t('comments.ai.useKnowledgeHint')} />
            </div>
          </Section>

          <Section title={t('comments.ai.paceTitle')} hint={t('comments.ai.paceHint')}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={t('comments.ai.delayMin')} value={form.delay_min_seconds} onChange={v => set({ delay_min_seconds: v ?? 0 })} suffix={t('comments.ai.sec')} />
              <NumberField label={t('comments.ai.delayMax')} value={form.delay_max_seconds} onChange={v => set({ delay_max_seconds: v ?? 0 })} suffix={t('comments.ai.sec')} />
              <NumberField label={t('comments.ai.perHour')} value={form.max_replies_per_hour} onChange={v => set({ max_replies_per_hour: v ?? 1 })} min={1} />
              <NumberField label={t('comments.ai.perDay')} value={form.max_replies_per_day} onChange={v => set({ max_replies_per_day: v ?? 1 })} min={1} />
              <NumberField label={t('comments.ai.maxAge')} value={form.max_age_hours} onChange={v => set({ max_age_hours: v ?? 1 })} min={1} suffix={t('comments.ai.hours')} />
              <label className="block">
                <span className="block text-[11px] text-fg-muted mb-1">{t('comments.ai.model')}</span>
                <select value={form.model} onChange={e => set({ model: e.target.value })} className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" dir="ltr">
                  {meta.models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <NumberField label={t('comments.ai.dailyBudget')} value={form.daily_budget_usd} onChange={v => set({ daily_budget_usd: v })} step={0.5} suffix="USD" placeholder={t('comments.ai.noLimit')} />
              <NumberField label={t('comments.ai.monthlyBudget')} value={form.monthly_budget_usd} onChange={v => set({ monthly_budget_usd: v })} step={1} suffix="USD" placeholder={t('comments.ai.noLimit')} />
            </div>
            <p className="text-[10px] text-fg-subtle mt-2">{t('comments.ai.budgetHint')}</p>
          </Section>

          <TestBox />
        </>)}
      </div>

      {sub === 'settings' && dirty && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-surface-2/95 border-t border-surface-3 flex items-center gap-3 justify-center">
          <span className="text-xs text-fg-muted">{t('comments.ai.unsaved')}</span>
          <button onClick={() => setForm(saved)} className="px-3 py-1.5 rounded-xl bg-surface-3 text-fg-muted text-xs">{t('comments.ai.discard')}</button>
          <button onClick={() => save()} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold disabled:opacity-50">
            <Save size={13} />{saving ? t('comments.sending') : t('comments.ai.save')}
          </button>
        </div>
      )}
    </div>
  )
}

// تجربة الوكيل على تعليق افتراضي من غير ما ينشر حاجة — لتظبيط التعليمات قبل ما نشغّله
function TestBox() {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState(null)

  const run = async () => {
    if (!text.trim()) return
    setBusy(true); setOut(null)
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, caption })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setOut(d)
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <Section title={t('comments.ai.testTitle')} hint={t('comments.ai.testHint')}>
      <input value={caption} onChange={e => setCaption(e.target.value)} placeholder={t('comments.ai.testCaption')}
        className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg mb-2" />
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={t('comments.ai.testComment')}
        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
      <button onClick={run} disabled={busy || !text.trim()}
        className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand/15 text-brand text-xs font-semibold disabled:opacity-40">
        <FlaskConical size={13} />{busy ? t('comments.sending') : t('comments.ai.testRun')}
      </button>
      {out && (
        <div className="mt-3 bg-surface rounded-xl p-3 space-y-1.5">
          <p className="text-[11px] text-fg-subtle">{t('comments.ai.testAction')}: <b className="text-fg">{t(`comments.ai.action.${out.action}`, { defaultValue: out.action || '—' })}</b>
            {out.unsafe && <span className="text-danger"> · {t('comments.ai.testUnsafe')}: {out.unsafe}</span>}</p>
          {out.reply_text && <p className="text-sm text-fg whitespace-pre-wrap">{out.reply_text}</p>}
          <p className="text-[11px] text-fg-subtle">{out.reason}</p>
          <p className="text-[10px] text-fg-subtle">${Number(out.cost_usd).toFixed(5)}</p>
        </div>
      )}
    </Section>
  )
}

// مراجعة اللي الوكيل عمله: المسودات (اعتماد/رفض/تعديل قبل النشر) وباقي القرارات مع السبب والتكلفة
function ReviewList() {
  const { t } = useTranslation()
  const toast = useToast()
  const [status, setStatus] = useState('draft')
  const [rows, setRows] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [edits, setEdits] = useState({})

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/replies?status=${status}&limit=30&offset=${offset}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setRows(prev => offset === 0 ? d.replies : [...prev, ...d.replies])
      setHasMore(d.hasMore)
    } catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0) }, [load])

  const act = async (r, kind) => {
    setBusy(r.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/replies/${r.id}/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'approve' ? { text: edits[r.id] ?? r.reply_text } : {})
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(t(kind === 'approve' ? 'comments.ai.approved' : 'comments.ai.rejected'))
      setRows(prev => prev.filter(x => x.id !== r.id))
    } catch (err) { toast.error(err.message); load(0) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${status === s ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
            {s === 'all' ? t('comments.platforms.all') : t(`comments.ai.status.${s}`)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-fg-subtle gap-2"><Bot size={28} className="opacity-20" /><p className="text-sm">{t('comments.ai.reviewEmpty')}</p></div>
      ) : rows.map(r => (
        <div key={r.id} className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || 'bg-surface-3 text-fg-subtle'}`}>{t(`comments.ai.status.${r.status}`, { defaultValue: r.status })}</span>
            <span className="text-fg-subtle">{t(`comments.platforms.${r.platform}`, { defaultValue: r.platform || '' })}</span>
            <span className="text-fg-subtle ms-auto">{localeFormatDateTime(r.created_at)}</span>
          </div>
          <div className="bg-surface rounded-xl p-2.5">
            <p className="text-[10px] text-fg-subtle mb-0.5">{r.comment?.author_name || ''}</p>
            <LinkifiedText text={r.comment?.content} className="block text-sm text-fg whitespace-pre-wrap break-words" />
            {r.comment?.post_caption && <p className="text-[10px] text-fg-subtle mt-1 line-clamp-1">{r.comment.post_caption}</p>}
          </div>
          {r.status === 'draft' ? (
            <textarea value={edits[r.id] ?? r.reply_text ?? ''} onChange={e => setEdits(prev => ({ ...prev, [r.id]: e.target.value }))} rows={3}
              className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg" />
          ) : r.reply_text && (
            <div className="ps-2.5 border-s-2 border-brand/40"><p className="text-sm text-fg whitespace-pre-wrap break-words">{r.reply_text}</p></div>
          )}
          {(r.reason || r.error) && <p className="text-[11px] text-fg-subtle">{r.error ? `⚠ ${r.error}` : r.reason}</p>}
          <div className="flex items-center gap-2">
            {r.status === 'draft' && (<>
              <button onClick={() => act(r, 'approve')} disabled={busy === r.id}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold disabled:opacity-40"><Check size={13} />{t('comments.ai.approve')}</button>
              <button onClick={() => act(r, 'reject')} disabled={busy === r.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-3 text-fg-muted text-xs disabled:opacity-40"><X size={13} />{t('comments.ai.reject')}</button>
            </>)}
            {r.comment?.post_caption !== undefined && r.comment?.post_permalink && (
              <a href={r.comment.post_permalink} target="_blank" rel="noopener noreferrer" className="text-fg-subtle hover:text-fg"><ExternalLink size={13} /></a>
            )}
            {Number(r.cost_usd) > 0 && <span className="ms-auto text-[10px] text-fg-subtle tabular-nums">${Number(r.cost_usd).toFixed(5)}</span>}
          </div>
        </div>
      ))}
      {hasMore && !loading && (
        <button onClick={() => load(rows.length)} className="w-full py-2 rounded-xl bg-surface-3 text-fg-muted text-xs">{t('comments.ai.loadMore')}</button>
      )}
    </div>
  )
}
