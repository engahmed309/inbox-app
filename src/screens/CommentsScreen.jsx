import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { MessageSquare, Send, Check, EyeOff, Facebook, Instagram, ExternalLink, X } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import LinkifiedText from '../components/LinkifiedText'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const STATUS_TABS = ['new', 'handled', 'ignored']
const PLATFORM_ICONS = {
  facebook: <Facebook size={13} className="text-blue-400" />,
  instagram: <Instagram size={13} className="text-pink-400" />,
}

export default function CommentsScreen() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('new')
  const [comments, setComments] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState(null)

  const canSee = agent?.role === 'admin' || ['comments', 'both'].includes(agent?.access_scope)

  const load = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        apiFetch(`${API_URL}/comments?status=${status}&limit=100`),
        apiFetch(`${API_URL}/comments/counts`)
      ])
      const listData = await listRes.json()
      if (listRes.ok) setComments(listData.comments || [])
      const countData = await countRes.json()
      if (countRes.ok) setCounts(countData.counts || {})
    } catch { /* هنسيب اللي معروض زي ما هو */ } finally { setLoading(false) }
  }, [status])

  useEffect(() => {
    if (!canSee) return
    setLoading(true)
    load()
    // التعليقات عددها قليل، فسؤال كل نص دقيقة أبسط وأخف من اشتراك لحظي
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load, canSee])

  const setCommentStatus = async (c, next) => {
    setComments(prev => prev.filter(x => x.id !== c.id))
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      load()
    } catch (err) { toast.error(err.message); load() }
  }

  if (!canSee) return (
    <div className="h-full flex items-center justify-center text-fg-muted p-6 text-center">
      <p>{t('comments.noAccess')}</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate('/')} className="text-fg-muted hover:text-fg"><BackArrow /></button>
        <span className="font-bold text-fg flex-1">{t('comments.title')}</span>
      </div>

      <div className="flex gap-1.5 px-4 py-2 bg-surface-2 border-b border-surface-3 overflow-x-auto">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${status === s ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
            {t(`comments.status.${s}`)}{counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-fg-subtle gap-2">
            <MessageSquare size={32} className="opacity-20" />
            <p className="text-sm">{t('comments.empty')}</p>
          </div>
        ) : comments.map(c => (
          <div key={c.id} className="px-4 py-3 border-b border-surface-3">
            <div className="flex items-center gap-1.5 mb-1">
              {PLATFORM_ICONS[c.platform]}
              <span className="text-sm font-semibold text-fg truncate">{c.author_name || t('comments.unknownAuthor')}</span>
              {c.parent_comment_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">{t('comments.isReply')}</span>
              )}
              <span className="text-[11px] text-fg-subtle ms-auto flex-shrink-0">{localeFormatDateTime(c.posted_at || c.created_at)}</span>
            </div>

            <LinkifiedText text={c.content} className="block text-sm text-fg whitespace-pre-wrap break-words" />

            {/* التعليق لوحده مالوش معنى — الموظف لازم يعرف جاي على أنهي منشور قبل ما يرد */}
            {(c.post_caption || c.post_thumbnail_url || c.post_permalink) && (
              <a href={c.post_permalink || undefined} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-2 mt-2 bg-surface-2 rounded-lg p-1.5 border border-surface-3 ${c.post_permalink ? 'hover:border-brand/50' : 'pointer-events-none'}`}>
                {c.post_thumbnail_url && (
                  <img src={c.post_thumbnail_url} alt="" loading="lazy"
                    className="w-9 h-9 rounded object-cover flex-shrink-0 bg-surface-3"
                    onError={e => { e.target.style.display = 'none' }} />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] text-fg-subtle">{t('comments.onPost')}</span>
                  <span className="block text-[11px] text-fg-muted truncate">{c.post_caption || t('comments.untitledPost')}</span>
                </span>
                {c.post_permalink && <ExternalLink size={12} className="text-fg-subtle flex-shrink-0" />}
              </a>
            )}

            {c.private_replied_at && (
              <p className="text-[11px] text-success mt-1.5">✓ {t('comments.privateReplySent')}</p>
            )}

            <div className="flex items-center gap-2 mt-2">
              {!c.private_replied_at && (
                <button onClick={() => setReplyTo(c)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20">
                  <Send size={11} /> {t('comments.privateReply')}
                </button>
              )}
              {status !== 'handled' && (
                <button onClick={() => setCommentStatus(c, 'handled')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg">
                  <Check size={11} /> {t('comments.markHandled')}
                </button>
              )}
              {status !== 'ignored' && (
                <button onClick={() => setCommentStatus(c, 'ignored')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg">
                  <EyeOff size={11} /> {t('comments.ignore')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {replyTo && <PrivateReplyModal comment={replyTo} onClose={() => setReplyTo(null)} onSent={() => { setReplyTo(null); load() }} />}
    </div>
  )
}

// الرد الخاص بيتبعت مرة واحدة بس لكل تعليق وخلال ٧ أيام منه (قاعدة ميتا) — بنقولها للموظف قبل
// ما يكتب، مش بعد ما الرسالة تفشل
function PrivateReplyModal({ comment, onClose, onSent }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}/private-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('comments.privateReplyDone'))
      onSent()
    } catch (err) { toast.error(err.message) } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !sending && onClose()}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[440px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm">{t('comments.privateReplyTitle', { name: comment.author_name || '' })}</span>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-surface-3 rounded-xl p-2.5">
            <LinkifiedText text={comment.content} className="block text-xs text-fg-muted whitespace-pre-wrap break-words" />
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
            placeholder={t('comments.privateReplyPlaceholder')}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
          <p className="text-[11px] text-fg-subtle">{t('comments.privateReplyHint')}</p>
          <button onClick={send} disabled={sending || !text.trim()}
            className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            <Send size={15} /> {sending ? t('comments.sending') : t('comments.sendPrivateReply')}
          </button>
        </div>
      </div>
    </div>
  )
}
