import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, ShieldAlert, Check, X, Trash2, Plus, Search, FlaskConical, ExternalLink, EyeOff, Facebook, Instagram, Youtube, Power, Hand, Zap, UserX } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'
import LinkifiedText from './LinkifiedText'

const MODES = [
  { key: 'off', icon: Power, tone: 'text-fg-muted' },
  { key: 'approve', icon: Hand, tone: 'text-brand' },
  { key: 'auto', icon: Zap, tone: 'text-danger' },
]
const CATEGORIES = ['spam', 'profanity', 'insult', 'accusation', 'hate', 'sexual', 'threat']
const CAT_TONE = {
  spam: 'bg-amber-500/15 text-amber-500', profanity: 'bg-danger/15 text-danger', insult: 'bg-danger/15 text-danger',
  accusation: 'bg-brand/15 text-brand', hate: 'bg-danger/15 text-danger', sexual: 'bg-danger/15 text-danger', threat: 'bg-danger/15 text-danger',
}
const PLATFORM_ICONS = {
  facebook: <Facebook size={12} className="text-blue-400" />,
  instagram: <Instagram size={12} className="text-pink-400" />,
  youtube: <Youtube size={12} className="text-red-500" />,
}

function Section({ title, hint, children, right }) {
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-2xl p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          {hint && <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-start gap-3 py-1.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
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

// adminView=false: فريق التعليقات — قايمة المحجوز والمحظورين بس (الإعدادات والقاموس للأدمن)
export default function CommentsModeration({ adminView = true }) {
  const { t } = useTranslation()
  const toast = useToast()
  if (!adminView) return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <Queue t={t} toast={toast} />
        <Blocked t={t} toast={toast} />
      </div>
    </div>
  )
  return <AdminModeration t={t} toast={toast} />
}

function AdminModeration({ t, toast }) {
  const [settings, setSettings] = useState(null)
  const [meta, setMeta] = useState(null)
  const [counts, setCounts] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadCounts = useCallback(() => {
    apiFetch(`${API_URL}/comments/moderation/counts`).then(r => r.json()).then(d => { if (!d.error) setCounts(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch(`${API_URL}/comments/ai/settings`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setSettings(d.settings); setMeta(d.moderation || {}) })
      .catch(err => toast.error(err.message))
    loadCounts()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    setSaving(true)
    const prev = settings
    setSettings(s => ({ ...s, ...patch }))
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSettings(d.settings)
      toast.success(t('comments.mod.saved'))
    } catch (err) { setSettings(prev); toast.error(err.message) } finally { setSaving(false) }
  }

  const pickMode = (mode) => {
    if (mode === settings.moderation_mode) return
    if (mode === 'auto' && !window.confirm(t('comments.mod.autoConfirm'))) return
    save({ moderation_mode: mode })
  }

  if (!settings || !meta) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const cats = settings.moderation_categories || []
  const toggleCat = (c) => save({ moderation_categories: cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c] })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <Section title={t('comments.mod.modeTitle')} hint={t('comments.mod.modeHint')}>
          <div className="grid sm:grid-cols-3 gap-2">
            {MODES.map(m => {
              const Icon = m.icon
              const active = settings.moderation_mode === m.key
              return (
                <button key={m.key} onClick={() => pickMode(m.key)} disabled={saving}
                  className={`text-start rounded-xl p-3 border transition-colors ${active ? 'border-brand bg-brand/10' : 'border-surface-3 bg-surface hover:bg-surface-3'}`}>
                  <span className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-brand' : m.tone}`}><Icon size={15} />{t(`comments.mod.mode.${m.key}`)}</span>
                  <span className="block text-[11px] text-fg-subtle mt-1 leading-relaxed">{t(`comments.mod.modeDesc.${m.key}`)}</span>
                </button>
              )
            })}
          </div>
          {settings.moderation_mode !== 'off' && counts && (
            <p className="text-[11px] text-fg-subtle mt-3">{t('comments.mod.stats', { pending: counts.pending, auto: counts.auto_deleted_24h, approved: counts.approved_24h, ai: counts.ai_used_today })}</p>
          )}
        </Section>

        {settings.moderation_mode !== 'off' && (<>
          <Section title={t('comments.mod.catTitle')} hint={t('comments.mod.catHint')}>
            <div className="grid sm:grid-cols-2 gap-x-4">
              {CATEGORIES.map(c => (
                <Toggle key={c} checked={cats.includes(c)} onChange={() => toggleCat(c)} disabled={saving}
                  label={t(`comments.mod.cat.${c}`)} hint={t(`comments.mod.catDesc.${c}`)} />
              ))}
            </div>
            <Toggle checked={settings.moderation_use_ai !== false} onChange={v => save({ moderation_use_ai: v })} disabled={saving || !meta.ai_available}
              label={t('comments.mod.aiToggle')} hint={meta.ai_available ? t('comments.mod.aiHint') : t('comments.mod.aiNoKey')} />
            <Toggle checked={settings.moderation_hide_pending !== false} onChange={v => save({ moderation_hide_pending: v })} disabled={saving}
              label={t('comments.mod.hideToggle')} hint={t('comments.mod.hideHint')} />
            {settings.moderation_mode === 'approve' && (
              <Toggle checked={settings.moderation_auto_clear === true} onChange={v => save({ moderation_auto_clear: v })} disabled={saving}
                label={t('comments.mod.autoClear')} hint={t('comments.mod.autoClearHint')} />
            )}
          </Section>

          <Queue t={t} toast={toast} onChanged={loadCounts} />
          <Blocked t={t} toast={toast} />
        </>)}

        <Words t={t} toast={toast} aiAvailable={!!meta.ai_available} />
      </div>
    </div>
  )
}

// ─── قايمة المحجوز للأدمن (موافقة على الحذف / رفض) ────────────────────────
function Queue({ t, toast, onChanged }) {
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)         // id | 'bulk'
  const [progress, setProgress] = useState(null) // { done, total } أثناء القرار الجماعي
  const [selected, setSelected] = useState(() => new Set())

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation?scope=${tab}&limit=30&offset=${offset}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setRows(prev => (offset ? [...prev, ...d.comments] : d.comments))
      setHasMore(!!d.hasMore)
      if (!offset) setSelected(new Set())
    } catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0) }, [load])

  const decide = async (id, action) => {
    if (action === 'approve' && !window.confirm(t('comments.mod.approveConfirm'))) return
    setBusy(id)
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/${id}/${action}`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (d.warning) toast.error(d.warning)
      setRows(r => r.filter(x => x.id !== id))
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      onChanged?.()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const bulk = async (action) => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(t(action === 'approve' ? 'comments.mod.bulkApproveConfirm' : 'comments.mod.bulkRejectConfirm', { n: ids.length }))) return
    setBusy('bulk')
    // على دفعات صغيرة عشان الأدمن يشوف التقدم (الحذف من المنصة بياخد ثواني للتعليق) بدل طلب واحد طويل من غير أي إشارة
    let done = 0
    const failed = []
    try {
      for (let i = 0; i < ids.length; i += 8) {
        setProgress({ done: i, total: ids.length })
        const res = await apiFetch(`${API_URL}/comments/moderation/bulk`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids: ids.slice(i, i + 8) })
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        done += d.done || 0
        failed.push(...(d.failed || []))
      }
    } catch (err) { toast.error(err.message) }
    if (done) toast.success(t('comments.mod.bulkDone', { n: done }))
    if (failed.length) toast.error(failed[0].error)
    setProgress(null)
    setBusy(null)
    await load(0)
    onChanged?.()
  }

  const block = async (c) => {
    // انستجرام: بنفتح صفحة الحساب على انستجرام والحظر بيتعمل من هناك (تعليقاته بتفضل توصل عادي)
    if (c.platform === 'instagram') {
      if (c.author_name) window.open(`https://www.instagram.com/${encodeURIComponent(c.author_name)}/`, '_blank', 'noopener')
      return
    }
    if (!window.confirm(t('comments.mod.blockConfirm', { name: c.author_name || '—' }))) return
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}/block-author`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (d.platform_blocked) toast.success(t('comments.mod.blocked'))
      else toast.error(t('comments.mod.blockedLocal', { note: d.note || '' }))
      setRows(r => r.map(x => x.author_platform_id && x.author_platform_id === c.author_platform_id && x.platform === c.platform ? { ...x, _blocked: true } : x))
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const pending = tab === 'pending'
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggle = (id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pill = (active) => `px-3 py-1 rounded-full text-xs font-medium ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`

  return (
    <Section title={t('comments.mod.queueTitle')} hint={t('comments.mod.queueHint')}
      right={<div className="flex gap-1.5 flex-shrink-0">
        <button onClick={() => setTab('pending')} className={pill(pending)}>{t('comments.mod.tabPending')}</button>
        <button onClick={() => setTab('history')} className={pill(!pending)}>{t('comments.mod.tabHistory')}</button>
      </div>}>
      {pending && rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <label className="flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))} />
            {t('comments.mod.selectAll')}
          </label>
          {selected.size > 0 && (<>
            <span className="text-[12px] text-fg-subtle">{progress ? t('comments.mod.bulkProgress', { done: progress.done, total: progress.total }) : t('comments.mod.selected', { n: selected.size })}</span>
            <button disabled={busy === 'bulk'} onClick={() => bulk('approve')} className="px-3 py-1.5 rounded-lg text-xs bg-danger text-white disabled:opacity-50">{t('comments.mod.approveSel')}</button>
            <button disabled={busy === 'bulk'} onClick={() => bulk('reject')} className="px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg disabled:opacity-50">{t('comments.mod.rejectSel')}</button>
          </>)}
        </div>
      )}

      {loading && !rows.length && <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>}
      {!loading && !rows.length && (
        <div className="py-6 text-center text-xs text-fg-subtle flex flex-col items-center gap-2"><ShieldCheck size={22} className="text-success" />{t(pending ? 'comments.mod.empty' : 'comments.mod.emptyHistory')}</div>
      )}

      <div className="space-y-2">
        {rows.map(c => (
          <div key={c.id} className="bg-surface rounded-xl border border-surface-3 p-3">
            <div className="flex items-start gap-2">
              {pending && <input type="checkbox" className="mt-1" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-fg-subtle">
                  {PLATFORM_ICONS[c.platform]}
                  <span className="text-fg font-semibold text-[13px] truncate">{c.author_name || '—'}</span>
                  {c.from_live && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger/15 text-danger">🔴 {t('comments.mod.live')}</span>}
                  <span>·</span><span>{localeFormatDateTime(c.posted_at)}</span>
                  {c.hidden_at && pending && <span className="inline-flex items-center gap-1 text-amber-500"><EyeOff size={11} />{t('comments.mod.hiddenOnPage')}</span>}
                </div>
                <div className="mt-1.5 text-[13px] text-fg whitespace-pre-wrap break-words" dir="auto">
                  {c.content ? <LinkifiedText text={c.content} /> : <span className="text-fg-subtle">{t('comments.mod.noText')}</span>}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_TONE[c.mod_category] || 'bg-surface-3 text-fg-subtle'}`}>{t(`comments.mod.cat.${c.mod_category}`, { defaultValue: c.mod_category })}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-fg-subtle">{t(`comments.mod.source.${c.mod_source}`, { defaultValue: c.mod_source })}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.mod_confidence === 'high' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-fg-subtle'}`}>{t(`comments.mod.confidence.${c.mod_confidence}`, { defaultValue: c.mod_confidence })}</span>
                  {!pending && <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-fg-muted">{t(`comments.mod.status.${c.mod_status}`)}{c.decided_by_name ? ` · ${c.decided_by_name}` : ''}</span>}
                </div>
                {c.mod_reason && <p className="mt-1.5 text-[11px] text-fg-muted leading-relaxed">{c.mod_reason}</p>}
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {pending ? (<>
                <button disabled={busy === c.id} onClick={() => decide(c.id, 'approve')}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-danger text-white disabled:opacity-50"><Trash2 size={13} />{t('comments.mod.approve')}</button>
                <button disabled={busy === c.id} onClick={() => decide(c.id, 'reject')}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-3 text-fg disabled:opacity-50"><Check size={13} />{t('comments.mod.reject')}</button>
                {c.author_platform_id && (
                  <button disabled={busy === c.id || c._blocked} onClick={() => block(c)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-danger/40 text-danger disabled:opacity-50"><UserX size={13} />{c.platform === 'instagram' ? t('comments.mod.blockIg') : c._blocked ? t('comments.mod.blockedShort') : t('comments.mod.block')}</button>
                )}
              </>) : c.mod_decided_at && <span className="text-[11px] text-fg-subtle">{localeFormatDateTime(c.mod_decided_at)}</span>}
              {c.post_permalink && <a href={c.post_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"><ExternalLink size={12} />{t('comments.mod.openPost')}</a>}
            </div>
          </div>
        ))}
      </div>
      {hasMore && <button disabled={loading} onClick={() => load(rows.length)} className="mt-3 w-full py-2 rounded-lg bg-surface-3 text-xs text-fg-muted hover:text-fg">{t('comments.mod.loadMore')}</button>}
    </Section>
  )
}

// ─── المحظورين: قايمة + فك الحظر ───────────────────────────────────────
function Blocked({ t, toast }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => {
    apiFetch(`${API_URL}/comments/blocked`).then(r => r.json()).then(d => setRows(d.blocked || [])).catch(() => setRows([]))
  }, [])
  useEffect(() => { if (open) load() }, [open, load])
  const unblock = async (b) => {
    if (!window.confirm(t('comments.mod.unblockConfirm', { name: b.author_name || '—' }))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/blocked/${b.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (d.note) toast.error(d.note); else toast.success(t('comments.mod.unblocked'))
      setRows(r => r.filter(x => x.id !== b.id))
    } catch (err) { toast.error(err.message) }
  }
  return (
    <Section title={t('comments.mod.blockedTitle')} hint={t('comments.mod.blockedHint')}
      right={<button onClick={() => setOpen(o => !o)} className="px-3 py-1 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg">{open ? t('comments.mod.hide') : t('comments.mod.show')}</button>}>
      {open && (rows === null
        ? <div className="py-4 flex justify-center"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
        : !rows.length ? <p className="text-xs text-fg-subtle py-2">{t('comments.mod.blockedEmpty')}</p>
        : <div className="space-y-1.5">{rows.map(b => (
            <div key={b.id} className="flex items-center gap-2 bg-surface rounded-lg border border-surface-3 px-3 py-2">
              {PLATFORM_ICONS[b.platform]}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-fg truncate">{b.author_name || b.author_platform_id}</p>
                <p className="text-[10px] text-fg-subtle truncate">{b.platform_blocked ? t('comments.mod.blockedOnPlatform') : t('comments.mod.blockedLocalOnly')}{b.blocked_by_agent?.name ? ` · ${b.blocked_by_agent.name}` : ''} · {localeFormatDateTime(b.created_at)}</p>
              </div>
              <button onClick={() => unblock(b)} className="px-2.5 py-1 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg">{t('comments.mod.unblock')}</button>
            </div>
          ))}</div>)}
    </Section>
  )
}

// ─── قاموس الكلمات + اختبار نص ──────────────────────────────────────────
function Words({ t, toast, aiAvailable }) {
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ word: '', category: 'insult', severity: 'review' })
  const [testText, setTestText] = useState('')
  const [testAi, setTestAi] = useState(false)
  const [testRes, setTestRes] = useState(null)
  const [testing, setTesting] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async (offset = 0) => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/words?limit=100&offset=${offset}&q=${encodeURIComponent(q.trim())}${cat !== 'all' ? `&category=${cat}` : ''}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (id !== reqId.current) return
      setWords(prev => (offset ? [...prev, ...d.words] : d.words)); setTotal(d.total)
    } catch (err) { toast.error(err.message) } finally { if (id === reqId.current) setLoading(false) }
  }, [q, cat]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined
    const h = setTimeout(() => load(0), 250)
    return () => clearTimeout(h)
  }, [open, load])

  const add = async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/words`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(t('comments.mod.wordAdded'))
      setForm(f => ({ ...f, word: '' }))
      load(0)
    } catch (err) { toast.error(err.message) }
  }
  const patch = async (w, body) => {
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/words/${w.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setWords(list => list.map(x => (x.id === w.id ? d.word : x)))
    } catch (err) { toast.error(err.message) }
  }
  const remove = async (w) => {
    if (!window.confirm(t('comments.mod.wordDeleteConfirm', { w: w.word }))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/words/${w.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setWords(list => list.filter(x => x.id !== w.id)); setTotal(n => n - 1)
    } catch (err) { toast.error(err.message) }
  }
  const runTest = async () => {
    if (!testText.trim()) return
    setTesting(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/moderation/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: testText, ai: testAi }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setTestRes(d)
    } catch (err) { toast.error(err.message) } finally { setTesting(false) }
  }

  const field = 'bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg'

  return (
    <Section title={t('comments.mod.wordsTitle')} hint={t('comments.mod.wordsHint')}
      right={<button onClick={() => setOpen(o => !o)} className="px-3 py-1 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg flex-shrink-0">{open ? t('comments.mod.hide') : t('comments.mod.show')}</button>}>
      {open && (
        <div className="space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-fg mb-1.5 flex items-center gap-1.5"><FlaskConical size={13} />{t('comments.mod.testTitle')}</p>
            <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={2} placeholder={t('comments.mod.testPlaceholder')} className={`${field} w-full`} dir="auto" />
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button onClick={runTest} disabled={testing || !testText.trim()} className="px-3 py-1.5 rounded-lg text-xs bg-brand text-white disabled:opacity-50">{t('comments.mod.testButton')}</button>
              {aiAvailable && <label className="flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer"><input type="checkbox" checked={testAi} onChange={e => setTestAi(e.target.checked)} />{t('comments.mod.testWithAi')}</label>}
            </div>
            {testRes && (
              <div className="mt-2 text-[12px] space-y-1">
                {testRes.hits.length === 0 && !testRes.link && !testRes.ai && <p className="text-success">{t('comments.mod.testNoHits')}</p>}
                {testRes.hits.map(h => (
                  <p key={h.word} className="text-fg-muted"><span className={`text-[10px] px-2 py-0.5 rounded-full me-1.5 ${CAT_TONE[h.category]}`}>{t(`comments.mod.cat.${h.category}`)}</span>«{h.word}» — {t(`comments.mod.severity.${h.severity}`)}</p>
                ))}
                {testRes.link && <p className="text-amber-500">{t('comments.mod.testLink')}</p>}
                {testRes.ai && (testRes.ai.error
                  ? <p className="text-danger">{testRes.ai.error}</p>
                  : <p className="text-fg-muted"><ShieldAlert size={12} className="inline me-1" />{t('comments.mod.testAi', { cat: t(`comments.mod.cat.${testRes.ai.category}`, { defaultValue: t('comments.mod.cat.none') }), conf: t(`comments.mod.confidence.${testRes.ai.confidence}`, { defaultValue: testRes.ai.confidence }) })}{testRes.ai.reason ? ` — ${testRes.ai.reason}` : ''}</p>)}
              </div>
            )}
          </div>

          <div>
            <p className="text-[12px] font-semibold text-fg mb-1.5">{t('comments.mod.addTitle')}</p>
            <div className="flex gap-2 flex-wrap">
              <input value={form.word} onChange={e => setForm(f => ({ ...f, word: e.target.value }))} placeholder={t('comments.mod.wordPlaceholder')} maxLength={60}
                onKeyDown={e => { if (e.key === 'Enter') add() }} className={`${field} flex-1 min-w-[140px]`} dir="auto" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={field}>
                {CATEGORIES.map(c => <option key={c} value={c}>{t(`comments.mod.cat.${c}`)}</option>)}
              </select>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className={field}>
                <option value="review">{t('comments.mod.severity.review')}</option>
                <option value="high">{t('comments.mod.severity.high')}</option>
              </select>
              <button onClick={add} disabled={form.word.trim().length < 2} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-brand text-white disabled:opacity-50"><Plus size={13} />{t('comments.mod.add')}</button>
            </div>
            <p className="text-[10px] text-fg-subtle mt-1 leading-relaxed">{t('comments.mod.severityHint')}</p>
          </div>

          <div>
            <div className="flex gap-2 flex-wrap mb-2">
              <div className="relative flex-1 min-w-[140px]">
                <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-fg-subtle pointer-events-none" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('comments.mod.search')} className={`${field} w-full ps-8`} dir="auto" />
              </div>
              <select value={cat} onChange={e => setCat(e.target.value)} className={field}>
                <option value="all">{t('comments.mod.allCats')}</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{t(`comments.mod.cat.${c}`)}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-fg-subtle mb-1.5">{t('comments.mod.total', { n: total })}</p>
            <div className="divide-y divide-surface-3 border border-surface-3 rounded-xl overflow-hidden bg-surface">
              {words.map(w => (
                <div key={w.id} className={`flex items-center gap-2 px-3 py-2 ${w.enabled ? '' : 'opacity-50'}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-fg truncate" dir="auto">{w.word}</span>
                    <span className="block text-[10px] text-fg-subtle">
                      {t(`comments.mod.sourceLabel.${w.source}`)}{w.hits > 0 ? ` · ${t('comments.mod.hits', { n: w.hits })}` : ''}
                    </span>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${CAT_TONE[w.category]}`}>{t(`comments.mod.cat.${w.category}`)}</span>
                  <button onClick={() => patch(w, { severity: w.severity === 'high' ? 'review' : 'high' })} title={t('comments.mod.severityToggle')}
                    className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${w.severity === 'high' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-fg-subtle'}`}>{t(`comments.mod.severity.${w.severity}`)}</button>
                  <button onClick={() => patch(w, { enabled: !w.enabled })} title={t('comments.mod.enabled')}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${w.enabled ? 'text-success' : 'text-fg-subtle'} hover:bg-surface-3`}>{w.enabled ? <Check size={14} /> : <X size={14} />}</button>
                  <button onClick={() => remove(w)} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-fg-subtle hover:text-danger hover:bg-surface-3"><Trash2 size={13} /></button>
                </div>
              ))}
              {!words.length && !loading && <p className="px-3 py-4 text-center text-xs text-fg-subtle">{t('comments.mod.noWords')}</p>}
            </div>
            {words.length < total && <button disabled={loading} onClick={() => load(words.length)} className="mt-2 w-full py-2 rounded-lg bg-surface-3 text-xs text-fg-muted hover:text-fg">{t('comments.mod.loadMore')}</button>}
          </div>
        </div>
      )}
    </Section>
  )
}
