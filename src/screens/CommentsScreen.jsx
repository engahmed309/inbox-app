import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { MessageSquare, Send, Check, EyeOff, Facebook, Instagram, Youtube, ExternalLink, X, MessageCircle, Trash2 } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import LinkifiedText from '../components/LinkifiedText'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const STATUS_TABS = ['new', 'handled', 'ignored']
const PAGE_SIZE = 30
const PLATFORM_ICONS = {
  facebook: <Facebook size={13} className="text-blue-400" />,
  instagram: <Instagram size={13} className="text-pink-400" />,
  youtube: <Youtube size={13} className="text-red-500" />,
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [seenCount, setSeenCount] = useState(null)  // عدّاد التبويب وقت آخر تحميل للقائمة
  const [replyTo, setReplyTo] = useState(null)      // { comment, mode: 'private' | 'public' }
  const [deleting, setDeleting] = useState(null)
  const sentinelRef = useRef(null)

  const canSee = agent?.role === 'admin' || ['comments', 'both'].includes(agent?.access_scope)

  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/counts`)
      const data = await res.json()
      if (res.ok) { setCounts(data.counts || {}); return data.counts || {} }
    } catch { /* بنسيب العدادات القديمة معروضة */ }
    return null
  }, [])

  // بيرجّع القائمة لأول صفحة. بنستدعيها عند فتح التبويب وبعد أي إجراء — مش كل ٣٠ ثانية،
  // عشان القائمة ماتتحركش تحت إيد الموظف وهو بيقرا
  const load = useCallback(async () => {
    try {
      const [listRes, fresh] = await Promise.all([
        apiFetch(`${API_URL}/comments?status=${status}&limit=${PAGE_SIZE}`),
        fetchCounts()
      ])
      const listData = await listRes.json()
      if (listRes.ok) {
        setComments(listData.comments || [])
        setHasMore(!!listData.hasMore)
      }
      if (fresh) setSeenCount(fresh[status] ?? 0)
    } catch { /* هنسيب اللي معروض زي ما هو */ } finally { setLoading(false) }
  }, [status, fetchCounts])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await apiFetch(`${API_URL}/comments?status=${status}&limit=${PAGE_SIZE}&offset=${comments.length}`)
      const data = await res.json()
      if (res.ok) {
        // بنستبعد المكرر: لو تعليق جديد وصل بين الصفحتين، الإزاحة بتتحرك وممكن صف يتكرر
        setComments(prev => {
          const seen = new Set(prev.map(c => c.id))
          return [...prev, ...(data.comments || []).filter(c => !seen.has(c.id))]
        })
        setHasMore(!!data.hasMore)
      }
    } catch { /* بنسيب اللي اتحمّل */ } finally { setLoadingMore(false) }
  }, [status, comments.length, hasMore, loadingMore])

  useEffect(() => {
    if (!canSee) return
    setLoading(true)
    setComments([])
    load()
  }, [load, canSee])

  // التحديث الدوري بيجيب العدادات بس (استعلام عدّ في الداتابيز، مش صفوف) — ولو ظهر جديد
  // بنعرض زرار للموظف يحدّث لما يحب، بدل ما نقفز بالقائمة وهو نازل فيها
  useEffect(() => {
    if (!canSee) return
    const id = setInterval(fetchCounts, 30000)
    return () => clearInterval(id)
  }, [fetchCounts, canSee])

  // التحميل التدريجي بيتشغّل لما آخر الصفحة يبان — من غير زرار الموظف يدوّر عليه
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore])

  const pendingChanges = seenCount !== null && counts[status] !== undefined && counts[status] !== seenCount

  // بعد أي إجراء بنعدّل الصف مكانه ونحدّث العدادات بس — مابنعيدش تحميل القائمة، عشان الموظف
  // اللي نازل في تعليق رقم ٢٠٠ مايترميش لأول القائمة كل مرة يعالج واحد
  const patchRow = (id, patch, dropIf) => setComments(prev =>
    prev.flatMap(c => {
      if (c.id !== id) return [c]
      const next = { ...c, ...patch }
      return dropIf?.(next) ? [] : [next]
    })
  )

  const setCommentStatus = async (c, next) => {
    setComments(prev => prev.filter(x => x.id !== c.id))
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      fetchCounts()
    } catch (err) { toast.error(err.message); load() }
  }

  // الحذف نهائي عند ميتا، فبنسأل مرة قبله. الصف عندنا بيفضل معلّم "اتمسح" مش بيختفي
  const deleteComment = async (c) => {
    const platform = t(c.platform === 'facebook' ? 'comments.platformFacebook' : 'comments.platformInstagram')
    if (!window.confirm(t('comments.deleteConfirm', { name: c.author_name || t('comments.unknownAuthor'), platform }))) return
    setDeleting(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('comments.deleteFailed'))
      toast.success(t('comments.deleted'))
      // الحذف بيحوّل الحالة لـ"تمت المعالجة" على السيرفر، فبيخرج من تبويبي "جديدة" و"متجاهلة"
      patchRow(c.id, { deleted_at: new Date().toISOString(), status: 'handled' }, () => status !== 'handled')
      fetchCounts()
    } catch (err) { toast.error(err.message) } finally { setDeleting(null) }
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

      {pendingChanges && !loading && (
        <button onClick={() => { setLoading(true); load() }}
          className="mx-4 mt-2 py-1.5 rounded-full bg-brand/15 text-brand text-[11px] font-medium">
          {t('comments.refreshAvailable')}
        </button>
      )}

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
              {c.deleted_at && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger flex-shrink-0">{t('comments.deletedBadge')}</span>
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

            {/* الرد العام بيتعرض بنصه — سواء اتكتب من هنا أو من الفيسبوك نفسه — عشان الموظف
                يشوف إن حد سبقه ويشوف قال إيه، مايرجعش يرد تاني بحاجة مختلفة */}
            {c.public_reply_at && (
              <div className="mt-2 ps-2.5 border-s-2 border-success/40">
                <p className="text-[11px] text-success">✓ {t('comments.publicReplySent')}</p>
                {c.public_reply_text && (
                  <LinkifiedText text={c.public_reply_text} className="block text-xs text-fg-muted whitespace-pre-wrap break-words" />
                )}
              </div>
            )}

            {c.private_replied_at && (
              <p className="text-[11px] text-success mt-1.5">✓ {t('comments.privateReplySent')}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* يوتيوب استقبال فقط دلوقتي — الرد والحذف محتاجين موافقة جوجل على التطبيق،
                  فبنخفي الأزرار بدل ما الموظف يضغطها وتفشل */}
              {c.platform === 'youtube' ? (
                <a href={c.post_permalink || undefined} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 text-fg-muted hover:text-fg">
                  <ExternalLink size={11} /> {t('comments.openOnYoutube')}
                </a>
              ) : (<>
                {!c.deleted_at && (
                  <button onClick={() => setReplyTo({ comment: c, mode: 'public' })}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20">
                    <MessageCircle size={11} /> {c.public_reply_at ? t('comments.publicReplyAgain') : t('comments.publicReply')}
                  </button>
                )}
                {!c.private_replied_at && (
                  <button onClick={() => setReplyTo({ comment: c, mode: 'private' })}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 text-fg-muted hover:text-fg">
                    <Send size={11} /> {t('comments.privateReply')}
                  </button>
                )}
                {!c.deleted_at && (
                  <button onClick={() => deleteComment(c)} disabled={deleting === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-danger disabled:opacity-40">
                    <Trash2 size={11} /> {t('comments.delete')}
                  </button>
                )}
              </>)}
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

        {/* آخر الصفحة: أول ما يبان بنجيب الدفعة اللي بعده */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {replyTo && (
        <ReplyModal comment={replyTo.comment} mode={replyTo.mode}
          onClose={() => setReplyTo(null)}
          onSent={patch => {
            patchRow(replyTo.comment.id, { ...patch, status: 'handled' }, () => status !== 'handled')
            setReplyTo(null)
            fetchCounts()
          }} />
      )}
    </div>
  )
}

// نفس المودال للردين — الفرق الوحيد المسار والنصوص. الفرق اللي يهم الموظف إن العام بيشوفه
// كل الناس والخاص لأ، وإن الخاص مرة واحدة وخلال ٧ أيام (قاعدة ميتا) — بنقولهاله قبل ما يكتب
// مش بعد ما الرسالة تفشل
function ReplyModal({ comment, mode, onClose, onSent }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const isPublic = mode === 'public'

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}/${isPublic ? 'reply' : 'private-reply'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t(isPublic ? 'comments.publicReplyDone' : 'comments.privateReplyDone'))
      const now = new Date().toISOString()
      onSent(isPublic
        ? { public_reply_at: now, public_reply_text: text.trim() }
        : { private_replied_at: now })
    } catch (err) { toast.error(err.message) } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !sending && onClose()}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[440px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm">
            {t(isPublic ? 'comments.publicReplyTitle' : 'comments.privateReplyTitle', { name: comment.author_name || '' })}
          </span>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-surface-3 rounded-xl p-2.5">
            <LinkifiedText text={comment.content} className="block text-xs text-fg-muted whitespace-pre-wrap break-words" />
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
            placeholder={t(isPublic ? 'comments.publicReplyPlaceholder' : 'comments.privateReplyPlaceholder')}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
          <p className="text-[11px] text-fg-subtle">{t(isPublic ? 'comments.publicReplyHint' : 'comments.privateReplyHint')}</p>
          <button onClick={send} disabled={sending || !text.trim()}
            className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {isPublic ? <MessageCircle size={15} /> : <Send size={15} />}
            {sending ? t('comments.sending') : t(isPublic ? 'comments.sendPublicReply' : 'comments.sendPrivateReply')}
          </button>
        </div>
      </div>
    </div>
  )
}
