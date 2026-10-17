import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Trash2, Plus, Pencil, Check } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

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

// نقل تعليقات موظف (إجازة/أوفلاين/سابها) + إعادة التوزيع التلقائي لتعليقات الموظف الغايب
export function RedistributeModal({ onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [agents, setAgents] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [hours, setHours] = useState('')
  const [savedHours, setSavedHours] = useState('')

  useEffect(() => {
    Promise.all([apiFetch(`${API_URL}/teams`), apiFetch(`${API_URL}/comments/settings`)])
      .then(async ([tr, sr]) => {
        const td = await tr.json(), sd = await sr.json()
        if (!tr.ok) throw new Error(td.error)
        const map = new Map()
        for (const team of td.teams || []) for (const m of team.members || []) if (['comments', 'both'].includes(m.access_scope)) map.set(m.id, m)
        setAgents([...map.values()])
        const h = sd.reassign_hours ? String(sd.reassign_hours) : ''
        setHours(h); setSavedHours(h)
      })
      .catch(err => { toast.error(err.message); onClose() })
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

  const saveHours = async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reassign_hours: hours === '' ? null : Number(hours) })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSavedHours(hours)
      toast.success(t('comments.ai.saved'))
    } catch (err) { toast.error(err.message) }
  }

  const sel = 'w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg'
  return (
    <Shell title={t('comments.admin.redistributeTitle')} onClose={onClose}>
      {!agents ? <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div> : (<>
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
        <div className="border-t border-surface-3 pt-4 space-y-2">
          <p className="text-sm font-semibold text-fg">{t('comments.admin.autoTitle')}</p>
          <p className="text-[11px] text-fg-subtle leading-relaxed">{t('comments.admin.autoHint')}</p>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={720} value={hours} onChange={e => setHours(e.target.value)} placeholder={t('comments.ai.noLimit')}
              className="w-28 bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg tabular-nums" />
            <span className="text-xs text-fg-subtle">{t('comments.ai.hours')}</span>
            <button onClick={saveHours} disabled={hours === savedHours} className="ms-auto px-4 py-2 rounded-xl bg-surface-3 text-fg text-xs font-medium disabled:opacity-40">{t('comments.ai.save')}</button>
          </div>
        </div>
      </>)}
    </Shell>
  )
}

// ردود جاهزة: الأدمن يضيف ويعدّل ويمسح، والموظفين بيختاروا منها في نافذة الرد
export function SavedRepliesModal({ onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [draft, setDraft] = useState({ id: null, title: '', body: '' })
  const [busy, setBusy] = useState(false)

  const load = () => apiFetch(`${API_URL}/comments/saved-replies`)
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setItems(d.replies) })
    .catch(err => { toast.error(err.message); onClose() })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setBusy(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/saved-replies${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draft.title, body: draft.body })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setDraft({ id: null, title: '', body: '' })
      invalidateSavedRepliesCache()
      await load()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const remove = async (r) => {
    if (!window.confirm(t('comments.admin.deleteReplyConfirm'))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/saved-replies/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      invalidateSavedRepliesCache()
      await load()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <Shell title={t('comments.admin.savedTitle')} onClose={onClose} width="lg:w-[520px]">
      <p className="text-[11px] text-fg-subtle leading-relaxed">{t('comments.admin.savedHint')}</p>
      <div className="space-y-2 bg-surface rounded-xl p-3">
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder={t('comments.admin.replyTitle')}
          className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg" />
        <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} rows={3} placeholder={t('comments.admin.replyBody')}
          className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold disabled:opacity-40">
            {draft.id ? <Check size={13} /> : <Plus size={13} />}{draft.id ? t('comments.ai.save') : t('comments.admin.addReply')}
          </button>
          {draft.id && <button onClick={() => setDraft({ id: null, title: '', body: '' })} className="px-3 py-2 rounded-xl bg-surface-3 text-fg-muted text-xs">{t('comments.ai.discard')}</button>}
        </div>
      </div>
      {!items ? <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
        : items.length === 0 ? <p className="text-xs text-fg-subtle text-center py-4">{t('comments.admin.noSaved')}</p>
        : items.map(r => (
          <div key={r.id} className="bg-surface rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold text-fg truncate">{r.title}</span>
              <button onClick={() => setDraft({ id: r.id, title: r.title, body: r.body })} className="text-fg-subtle hover:text-fg"><Pencil size={13} /></button>
              <button onClick={() => remove(r)} className="text-fg-subtle hover:text-danger"><Trash2 size={13} /></button>
            </div>
            <p className="text-xs text-fg-muted mt-1 whitespace-pre-wrap break-words">{r.body}</p>
          </div>
        ))}
    </Shell>
  )
}

// كاش بسيط للردود الجاهزة عشان نافذة الرد ماتجيبهاش من السيرفر في كل مرة تتفتح
let savedRepliesCache = null
export function invalidateSavedRepliesCache() { savedRepliesCache = null }
export async function loadSavedReplies() {
  if (savedRepliesCache) return savedRepliesCache
  try {
    const res = await apiFetch(`${API_URL}/comments/saved-replies`)
    const d = await res.json()
    if (res.ok) savedRepliesCache = d.replies || []
  } catch { /* مش حرج: النافذة بتشتغل من غير ردود جاهزة */ }
  return savedRepliesCache || []
}
export const fillSavedReply = (body, authorName) => body.replaceAll('{name}', (authorName || '').trim().split(/\s+/)[0] || '')
