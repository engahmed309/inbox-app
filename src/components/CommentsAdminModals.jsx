import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Trash2, Plus, Pencil, Check, RefreshCw } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

function Shell({ title, onClose, children, width = 'lg:w-[460px]' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full ${width} max-h-[88vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm">{title}</span>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

const Spinner = () => <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

// أعضاء فريق التعليقات (أو كل اللي صلاحيتهم تعليقات لو مفيش فريق متحدد) — نفس القايمة اللي بيتوزع عليها
async function fetchCommentAgents() {
  const res = await apiFetch(`${API_URL}/comments/team`)
  const d = await res.json()
  if (!res.ok) throw new Error(d.error)
  return (d.members || []).filter(m => m.eligible)
}

// نقل تعليقات موظف (إجازة/غياب/سابها) لموظف تاني في الفريق أو لباقي الفريق بالتساوي
export function RedistributeModal({ onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [agents, setAgents] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchCommentAgents().then(setAgents).catch(err => { toast.error(err.message); onClose() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const move = async () => {
    if (!from) return
    setBusy(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/reassign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_agent_id: from, to_agent_id: to || null })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(t('comments.admin.moved', { count: d.moved }))
      onDone?.()
      onClose()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const sel = 'w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg'
  return (
    <Shell title={t('comments.admin.redistributeTitle')} onClose={onClose}>
      {!agents ? <Spinner /> : (
        <div className="space-y-3">
          <p className="text-[11px] text-fg-subtle leading-relaxed">{t('comments.admin.redistributeHint')}</p>
          <label className="block"><span className="block text-[11px] text-fg-muted mb-1">{t('comments.admin.from')}</span>
            <select value={from} onChange={e => setFrom(e.target.value)} className={sel}>
              <option value="">—</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          <label className="block"><span className="block text-[11px] text-fg-muted mb-1">{t('comments.admin.to')}</span>
            <select value={to} onChange={e => setTo(e.target.value)} className={sel}>
              <option value="">{t('comments.admin.toTeam')}</option>{agents.filter(a => a.id !== from).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          <button onClick={move} disabled={!from || busy} className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40">
            {busy ? t('comments.sending') : t('comments.admin.move')}
          </button>
        </div>
      )}
    </Shell>
  )
}

const STATUS_STYLE = { approved: 'bg-success/15 text-success', pending: 'bg-amber-500/15 text-amber-500', rejected: 'bg-danger/15 text-danger' }

// ردود جاهزة: الموظف يقترح والأدمن يوافق (ردود الأدمن بتتعتمد فورًا). المعتمد بيظهر لكل الموظفين في نافذة الرد
export function SavedRepliesModal({ isAdmin, onClose, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [draft, setDraft] = useState({ id: null, title: '', body: '' })
  const [busy, setBusy] = useState(false)

  const load = () => apiFetch(`${API_URL}/comments/saved-replies`)
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setItems(d.replies) })
    .catch(err => { toast.error(err.message); onClose() })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = async () => { invalidateSavedRepliesCache(); onChanged?.(); await load() }

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setBusy(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/saved-replies${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draft.title, body: draft.body })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (!isAdmin) toast.success(t('comments.admin.sentForApproval'))
      setDraft({ id: null, title: '', body: '' })
      await changed()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const act = async (r, action) => {
    try {
      const res = await apiFetch(`${API_URL}/comments/saved-replies/${r.id}/${action}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      await changed()
    } catch (err) { toast.error(err.message) }
  }

  const remove = async (r) => {
    if (!window.confirm(t('comments.admin.deleteReplyConfirm'))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/saved-replies/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      await changed()
    } catch (err) { toast.error(err.message) }
  }

  const canEdit = (r) => isAdmin || (r.mine && r.status !== 'approved')
  const pending = (items || []).filter(r => r.status === 'pending')
  const rest = (items || []).filter(r => r.status !== 'pending')

  const Row = ({ r }) => (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold text-fg truncate">{r.title}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status]}`}>{t(`comments.admin.status.${r.status}`)}</span>
        {canEdit(r) && <button onClick={() => setDraft({ id: r.id, title: r.title, body: r.body })} className="text-fg-subtle hover:text-fg"><Pencil size={13} /></button>}
        {canEdit(r) && <button onClick={() => remove(r)} className="text-fg-subtle hover:text-danger"><Trash2 size={13} /></button>}
      </div>
      <p className="text-xs text-fg-muted mt-1 whitespace-pre-wrap break-words">{r.body}</p>
      {r.creator?.name && !r.mine && <p className="text-[10px] text-fg-subtle mt-1">{t('comments.admin.proposedBy', { name: r.creator.name })}</p>}
      {isAdmin && r.status !== 'approved' && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => act(r, 'approve')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/15 text-success text-[11px] font-semibold"><Check size={12} />{t('comments.admin.approveBtn')}</button>
          {r.status === 'pending' && <button onClick={() => act(r, 'reject')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-3 text-fg-muted text-[11px]"><X size={12} />{t('comments.ai.reject')}</button>}
        </div>
      )}
    </div>
  )

  return (
    <Shell title={t('comments.admin.savedTitle')} onClose={onClose} width="lg:w-[520px]">
      <p className="text-[11px] text-fg-subtle leading-relaxed">{t(isAdmin ? 'comments.admin.savedHint' : 'comments.admin.savedHintAgent')}</p>
      <div className="space-y-2 bg-surface rounded-xl p-3">
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder={t('comments.admin.replyTitle')}
          className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg" />
        <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} rows={3} placeholder={t('comments.admin.replyBody')}
          className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold disabled:opacity-40">
            {draft.id ? <Check size={13} /> : <Plus size={13} />}{draft.id ? t('comments.ai.save') : t(isAdmin ? 'comments.admin.addReply' : 'comments.admin.proposeReply')}
          </button>
          {draft.id && <button onClick={() => setDraft({ id: null, title: '', body: '' })} className="px-3 py-2 rounded-xl bg-surface-3 text-fg-muted text-xs">{t('comments.ai.discard')}</button>}
        </div>
        {!isAdmin && <p className="text-[10px] text-fg-subtle">{t('comments.admin.needsApproval')}</p>}
      </div>

      {!items ? <Spinner /> : (<>
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-500">{t('comments.admin.pendingTitle', { n: pending.length })}</p>
            {pending.map(r => <Row key={r.id} r={r} />)}
          </div>
        )}
        <div className="space-y-2">
          {rest.length === 0 && pending.length === 0 && <p className="text-xs text-fg-subtle text-center py-4">{t('comments.admin.noSaved')}</p>}
          {rest.map(r => <Row key={r.id} r={r} />)}
        </div>
      </>)}
    </Shell>
  )
}

// مزامنة التعليقات الفايتة من ميتا: تشغيل يدوي لفترة معينة + حالة آخر مزامنة + إيقاف/تشغيل المزامنة الدورية
export function BackfillModal({ onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [state, setState] = useState(null)   // { running, last, enabled }
  const [hours, setHours] = useState(24)
  const timer = useRef(null)

  const fetchStatus = async () => {
    const res = await apiFetch(`${API_URL}/comments/backfill/status`)
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    setState(d)
    return d
  }
  const poll = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { const d = await fetchStatus(); if (d.running) poll(); else onDone?.() } catch { /* هنحاول تاني لو المستخدم لسه فاتح */ }
    }, 2000)
  }
  useEffect(() => {
    fetchStatus().then(d => { if (d.running) poll() }).catch(err => { toast.error(err.message); onClose() })
    return () => clearTimeout(timer.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/backfill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setState(s => ({ ...s, running: true }))
      poll()
    } catch (err) { toast.error(err.message) }
  }

  const toggleAuto = async (enabled) => {
    try {
      const res = await apiFetch(`${API_URL}/comments/backfill/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) })
      if (!res.ok) throw new Error((await res.json()).error)
      setState(s => ({ ...s, enabled }))
    } catch (err) { toast.error(err.message) }
  }

  const last = state?.last
  return (
    <Shell title={t('comments.admin.backfillTitle')} onClose={onClose}>
      {!state ? <Spinner /> : (<>
        <p className="text-[11px] text-fg-subtle leading-relaxed">{t('comments.admin.backfillHint')}</p>
        <div className="flex items-center gap-2">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} disabled={state.running} className="bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg">
            {[6, 24, 72, 168].map(h => <option key={h} value={h}>{t('comments.admin.lastHours', { n: h })}</option>)}
          </select>
          <button onClick={start} disabled={state.running} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50">
            <RefreshCw size={14} className={state.running ? 'animate-spin' : ''} />{state.running ? t('comments.admin.syncing') : t('comments.admin.syncNow')}
          </button>
        </div>
        {last && (
          <div className="bg-surface rounded-xl p-3 space-y-1.5 text-xs">
            <p className="text-fg-subtle">{t('comments.admin.lastRun', { d: localeFormatDateTime(last.at), s: t(`comments.admin.source.${last.source}`) })}</p>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div><p className="text-base font-bold text-fg tabular-nums">{last.posts}</p><p className="text-[10px] text-fg-subtle">{t('comments.admin.postsChecked')}</p></div>
              <div><p className="text-base font-bold text-fg tabular-nums">{last.fetched}</p><p className="text-[10px] text-fg-subtle">{t('comments.admin.fetched')}</p></div>
              <div><p className="text-base font-bold text-success tabular-nums">{last.inserted}</p><p className="text-[10px] text-fg-subtle">{t('comments.admin.newFound')}</p></div>
            </div>
            {last.errors?.length > 0 && (
              <div className="pt-2 border-t border-surface-3">
                <p className="text-[11px] text-danger font-semibold">{t('comments.admin.errors', { n: last.errors.length })}</p>
                {last.errors.slice(0, 4).map((e, i) => <p key={i} className="text-[10px] text-fg-subtle break-words" dir="ltr">{e}</p>)}
              </div>
            )}
          </div>
        )}
        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input type="checkbox" checked={state.enabled} onChange={e => toggleAuto(e.target.checked)} className="mt-1" />
          <span><span className="block text-[13px] text-fg">{t('comments.admin.autoSync')}</span><span className="block text-[11px] text-fg-subtle">{t('comments.admin.autoSyncHint')}</span></span>
        </label>
      </>)}
    </Shell>
  )
}

// كاش بسيط للردود الجاهزة عشان نافذة الرد ماتجيبهاش من السيرفر في كل مرة تتفتح (المعتمد بس)
let savedRepliesCache = null
export function invalidateSavedRepliesCache() { savedRepliesCache = null }
export async function loadSavedReplies() {
  if (savedRepliesCache) return savedRepliesCache
  try {
    const res = await apiFetch(`${API_URL}/comments/saved-replies`)
    const d = await res.json()
    if (res.ok) savedRepliesCache = (d.replies || []).filter(r => r.status === 'approved')
  } catch { /* مش حرج: النافذة بتشتغل من غير ردود جاهزة */ }
  return savedRepliesCache || []
}
export const fillSavedReply = (body, authorName) => body.replaceAll('{name}', (authorName || '').trim().split(/\s+/)[0] || '')
