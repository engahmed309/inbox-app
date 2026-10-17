import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { MessageSquare, Send, Check, EyeOff, Eye, Facebook, Instagram, Youtube, ExternalLink, X, MessageCircle, Trash2, Film, RefreshCw, Search, Archive, RotateCcw, BarChart3, Lock, CornerDownRight } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import LinkifiedText from '../components/LinkifiedText'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const STATUS_TABS = ['new', 'handled', 'ignored', 'archived']
const INTENT_TABS = ['all', 'actionable', 'price', 'booking', 'lead', 'complaint', 'question', 'praise', 'spam', 'other']
const SCOPE_TABS = ['all', 'mine', 'unassigned']
const INTENT_STYLE = {
  price: 'bg-amber-500/15 text-amber-500',
  booking: 'bg-emerald-500/15 text-emerald-500',
  lead: 'bg-sky-500/15 text-sky-500',
  complaint: 'bg-danger/15 text-danger',
  question: 'bg-brand/15 text-brand',
  spam: 'bg-surface-3 text-fg-subtle',
}
const PAGE_SIZE = 30
const PRIVATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const PLATFORM_ICONS = {
  facebook: <Facebook size={13} className="text-blue-400" />,
  instagram: <Instagram size={13} className="text-pink-400" />,
  youtube: <Youtube size={13} className="text-red-500" />,
}
const PLATFORM_TABS = [
  { key: 'all', labelKey: 'comments.platforms.all', icon: null },
  { key: 'facebook', labelKey: 'comments.platforms.facebook', icon: <Facebook size={12} className="text-blue-400" /> },
  { key: 'instagram', labelKey: 'comments.platforms.instagram', icon: <Instagram size={12} className="text-pink-400" /> },
  { key: 'youtube', labelKey: 'comments.platforms.youtube', icon: <Youtube size={12} className="text-red-500" /> },
]

export default function CommentsScreen() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('new')
  const [platform, setPlatform] = useState('all')
  const [intent, setIntent] = useState('all')
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [comments, setComments] = useState([])
  const [counts, setCounts] = useState({})
  const [byPlatform, setByPlatform] = useState({})
  const [byIntent, setByIntent] = useState({})
  const [byScope, setByScope] = useState({})
  const [showVideos, setShowVideos] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [seenCount, setSeenCount] = useState(null)  // عدّاد التبويب وقت آخر تحميل للقائمة
  const [replyTo, setReplyTo] = useState(null)      // { comment, mode: 'private' | 'public' }
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(null)
  const sentinelRef = useRef(null)

  const isAdmin = agent?.role === 'admin'
  const canSee = isAdmin || ['comments', 'both'].includes(agent?.access_scope)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  const query = `status=${status}&platform=${platform}&intent=${intent}&scope=${scope}&q=${encodeURIComponent(debouncedSearch)}`
  const countsQuery = `platform=${platform}&intent=${intent}&scope=${scope}`

  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/counts?${countsQuery}`)
      const data = await res.json()
      if (res.ok) {
        setCounts(data.counts || {})
        setByPlatform(data.byPlatform || {})
        setByIntent(data.byIntent || {})
        setByScope(data.byScope || {})
        return data.counts || {}
      }
    } catch { /* بنسيب العدادات القديمة معروضة */ }
    return null
  }, [countsQuery])

  // بيرجّع القائمة لأول صفحة. بنستدعيها عند فتح التبويب وبعد أي إجراء — مش كل ٣٠ ثانية،
  // عشان القائمة ماتتحركش تحت إيد الموظف وهو بيقرا
  const load = useCallback(async () => {
    try {
      const [listRes, fresh] = await Promise.all([
        apiFetch(`${API_URL}/comments?${query}&limit=${PAGE_SIZE}`),
        fetchCounts()
      ])
      const listData = await listRes.json()
      if (listRes.ok) {
        setComments(listData.comments || [])
        setHasMore(!!listData.hasMore)
      }
      if (fresh) setSeenCount(fresh[status] ?? 0)
    } catch { /* هنسيب اللي معروض زي ما هو */ } finally { setLoading(false) }
  }, [query, status, fetchCounts])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await apiFetch(`${API_URL}/comments?${query}&limit=${PAGE_SIZE}&offset=${comments.length}`)
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
  }, [query, comments.length, hasMore, loadingMore])

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

  // العدّاد مابيعدّش نتيجة البحث، فمؤشر "فيه جديد" بيتوقف أثناء البحث
  const pendingChanges = !debouncedSearch && seenCount !== null && counts[status] !== undefined && counts[status] !== seenCount

  // بعد أي إجراء بنعدّل الصف مكانه ونحدّث العدادات بس — مابنعيدش تحميل القائمة، عشان الموظف
  // اللي نازل في تعليق رقم ٢٠٠ مايترميش لأول القائمة كل مرة يعالج واحد
  const patchRow = (id, patch, dropIf) => setComments(prev =>
    prev.flatMap(c => {
      if (c.id !== id) return [c]
      const next = { ...c, ...patch }
      return dropIf?.(next) ? [] : [next]
    })
  )

  // التعليق مع زميل (الأدمن بس يتخطى). الأزرار بتتقفل بدل ما الموظف يضغط وياخد رفض
  const ownedByOther = (c) => !isAdmin && c.assigned_agent_id && c.assigned_agent_id !== agent?.id
  const lockedByOther = (c) => c.locked_by_agent_id && c.locked_by_agent_id !== agent?.id && c.locked_until && new Date(c.locked_until) > new Date()
  const blocked = (c) => ownedByOther(c) || lockedByOther(c)

  const setCommentStatus = async (c, next) => {
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComments(prev => prev.filter(x => x.id !== c.id))
      fetchCounts()
    } catch (err) { toast.error(err.message); load() } finally { setBusy(null) }
  }

  const archiveRow = async (c, archived) => {
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComments(prev => prev.filter(x => x.id !== c.id))
      fetchCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const toggleHide = async (c) => {
    const hide = !c.hidden_at
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}/hide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: hide })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t(hide ? 'comments.hideDone' : 'comments.unhideDone'))
      patchRow(c.id, { hidden_at: hide ? new Date().toISOString() : null, ...(hide && c.status === 'new' ? { status: 'handled' } : {}) },
        next => hide && c.status === 'new' && status === 'new')
      fetchCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  // الاستلام قبل فتح الرد: لو زميل سبقك السيرفر بيرفض ونعرف قبل ما تكتب رد كامل
  const openReply = async (c, mode) => {
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}/claim`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReplyTo({ comment: c, mode })
    } catch (err) { toast.error(err.message); load() } finally { setBusy(null) }
  }

  const closeReply = (sent) => {
    const c = replyTo?.comment
    setReplyTo(null)
    if (c && !sent) apiFetch(`${API_URL}/comments/${c.id}/release`, { method: 'POST' }).catch(() => {})
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

  const archiveOld = async () => {
    if (!window.confirm(t('comments.archiveConfirm'))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 7 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('comments.archiveDone', { count: data.archived }))
      load()
    } catch (err) { toast.error(err.message) }
  }

  if (!canSee) return (
    <div className="h-full flex items-center justify-center text-fg-muted p-6 text-center">
      <p>{t('comments.noAccess')}</p>
    </div>
  )

  const chip = (active) => `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`
  const smallBtn = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40'

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate('/')} className="text-fg-muted hover:text-fg"><BackArrow /></button>
        <span className="font-bold text-fg flex-1">{t('comments.title')}</span>
        {isAdmin && (<>
          <button onClick={() => setShowStats(true)} className={smallBtn}><BarChart3 size={12} /> {t('comments.stats.button')}</button>
          <button onClick={archiveOld} className={smallBtn}><Archive size={12} /> {t('comments.archiveOld')}</button>
        </>)}
        {/* اليوتيوب بيسحب الفيديوهات الجديدة لوحده — دي الطريقة للوصول لفيديو قديم */}
        {platform === 'youtube' && (
          <button onClick={() => setShowVideos(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 text-fg-muted hover:text-fg">
            <Film size={12} /> {t('comments.videos.button')}
          </button>
        )}
      </div>

      {/* المنصة فوق والحالة تحتها — عدّاد المنصة بيعرض الجديد فيها مهما كان التبويب المفتوح */}
      <div className="flex gap-1.5 px-4 pt-2 bg-surface-2 overflow-x-auto">
        {PLATFORM_TABS.map(p => (
          <button key={p.key} onClick={() => setPlatform(p.key)} className={`flex items-center gap-1.5 ${chip(platform === p.key)}`}>
            {p.icon}{t(p.labelKey)}{byPlatform[p.key] ? ` (${byPlatform[p.key]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 px-4 pt-2 bg-surface-2 overflow-x-auto">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatus(s)} className={chip(status === s)}>
            {t(`comments.status.${s}`)}{counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* النية: بتتحسب أوتوماتيك من نص التعليق (سعر/حجز/سؤال/شكوى…) عشان الأهم يطلع فوق */}
      <div className="flex gap-1.5 px-4 pt-2 bg-surface-2 overflow-x-auto">
        {INTENT_TABS.map(i => (
          <button key={i} onClick={() => setIntent(i)}
            className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${intent === i ? 'bg-brand/20 text-brand font-semibold' : 'bg-surface-3 text-fg-subtle'}`}>
            {t(`comments.intent.${i}`)}{byIntent[i] ? ` (${byIntent[i]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-surface-3">
        <div className="flex gap-1.5">
          {SCOPE_TABS.map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${scope === s ? 'bg-brand/20 text-brand font-semibold' : 'bg-surface-3 text-fg-subtle'}`}>
              {t(`comments.scope.${s}`)}{s !== 'all' && byScope[s] ? ` (${byScope[s]})` : ''}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-fg-subtle pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('comments.searchPlaceholder')}
            className="w-full bg-surface-3 rounded-full ps-8 pe-3 py-1.5 text-xs text-fg" />
        </div>
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
        ) : comments.map(c => {
          const other = blocked(c)
          const privateOpen = !c.private_replied_at && Date.now() - new Date(c.posted_at || c.created_at).getTime() <= PRIVATE_WINDOW_MS
          return (
          <div key={c.id} className={`px-4 py-3 border-b border-surface-3 ${other ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-1.5 mb-1">
              {PLATFORM_ICONS[c.platform]}
              <span className="text-sm font-semibold text-fg truncate">{c.author_name || t('comments.unknownAuthor')}</span>
              {c.intent && INTENT_STYLE[c.intent] && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${INTENT_STYLE[c.intent]}`}>{t(`comments.intent.${c.intent}`)}</span>
              )}
              {c.parent_comment_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">{t('comments.isReply')}</span>
              )}
              {c.deleted_at && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger flex-shrink-0">{t('comments.deletedBadge')}</span>
              )}
              {c.hidden_at && !c.deleted_at && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">{t('comments.hiddenBadge')}</span>
              )}
              <span className="text-[11px] text-fg-subtle ms-auto flex-shrink-0">{localeFormatDateTime(c.posted_at || c.created_at)}</span>
            </div>

            {/* الرد على تعليق بنعرض الأصل فوقه، عشان الموظف مايرُدش على جملة مقطوعة من سياقها */}
            {c.parent && (
              <div className="flex items-start gap-1 mb-1 ps-1 text-[11px] text-fg-subtle">
                <CornerDownRight size={11} className="mt-0.5 flex-shrink-0 rtl:-scale-x-100" />
                <span className="line-clamp-2 break-words"><b>{c.parent.author_name || t('comments.unknownAuthor')}:</b> {c.parent.content}</span>
              </div>
            )}

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
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-[11px] text-success">✓ {t('comments.privateReplySent')}</p>
                {c.private_reply_conversation_id && (
                  <button onClick={() => navigate(`/chat/${c.private_reply_conversation_id}`)}
                    className="text-[11px] text-brand hover:underline">{t('comments.openConversation')}</button>
                )}
              </div>
            )}

            {/* مين صاحب التعليق / مين شغال عليه / مين عالجه */}
            {(c.agents?.name || c.handler?.name || lockedByOther(c)) && (
              <p className="flex items-center gap-1 mt-1.5 text-[10px] text-fg-subtle">
                {lockedByOther(c)
                  ? <><Lock size={10} /> {t('comments.lockedBy', { name: c.locker?.name || '' })}</>
                  : c.agents?.name && c.assigned_agent_id !== agent?.id && c.status === 'new'
                    ? t('comments.ownedBy', { name: c.agents.name })
                    : c.handler?.name ? t('comments.handledBy', { name: c.handler.name }) : null}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {status === 'archived' ? (
                <button onClick={() => archiveRow(c, false)} disabled={busy === c.id} className={smallBtn}>
                  <RotateCcw size={11} /> {t('comments.restore')}
                </button>
              ) : <>
              {/* يوتيوب استقبال فقط دلوقتي — الرد والحذف محتاجين موافقة جوجل على التطبيق،
                  فبنخفي الأزرار بدل ما الموظف يضغطها وتفشل */}
              {c.platform === 'youtube' ? (
                <a href={c.post_permalink || undefined} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 text-fg-muted hover:text-fg">
                  <ExternalLink size={11} /> {t('comments.openOnYoutube')}
                </a>
              ) : (<>
                {!c.deleted_at && (
                  <button onClick={() => openReply(c, 'public')} disabled={other || busy === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-40">
                    <MessageCircle size={11} /> {c.public_reply_at ? t('comments.publicReplyAgain') : t('comments.publicReply')}
                  </button>
                )}
                {privateOpen && !c.deleted_at && (
                  <button onClick={() => openReply(c, 'private')} disabled={other || busy === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40">
                    <Send size={11} /> {t('comments.privateReply')}
                  </button>
                )}
                {!c.deleted_at && (
                  <button onClick={() => toggleHide(c)} disabled={other || busy === c.id} className={smallBtn}>
                    {c.hidden_at ? <><Eye size={11} /> {t('comments.unhide')}</> : <><EyeOff size={11} /> {t('comments.hide')}</>}
                  </button>
                )}
                {!c.deleted_at && (
                  <button onClick={() => deleteComment(c)} disabled={other || deleting === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-danger disabled:opacity-40">
                    <Trash2 size={11} /> {t('comments.delete')}
                  </button>
                )}
              </>)}
              {status !== 'handled' && (
                <button onClick={() => setCommentStatus(c, 'handled')} disabled={other || busy === c.id} className={smallBtn}>
                  <Check size={11} /> {t('comments.markHandled')}
                </button>
              )}
              {status !== 'ignored' && (
                <button onClick={() => setCommentStatus(c, 'ignored')} disabled={other || busy === c.id} className={smallBtn}>
                  <EyeOff size={11} /> {t('comments.ignore')}
                </button>
              )}
              </>}
            </div>
          </div>
          )
        })}

        {/* آخر الصفحة: أول ما يبان بنجيب الدفعة اللي بعده */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showVideos && <YoutubeVideosModal onClose={() => setShowVideos(false)} onSynced={load} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}

      {replyTo && (
        <ReplyModal comment={replyTo.comment} mode={replyTo.mode}
          onClose={() => closeReply(false)}
          onSent={patch => {
            patchRow(replyTo.comment.id, { ...patch, status: 'handled', assigned_agent_id: replyTo.comment.assigned_agent_id || agent?.id }, () => status !== 'handled')
            closeReply(true)
            fetchCounts()
          }} />
      )}
    </div>
  )
}

// أداء المعالجة لكل موظف + كام تعليق مستني. أدمن بس
function StatsModal({ onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [days, setDays] = useState(7)

  useEffect(() => {
    setData(null)
    apiFetch(`${API_URL}/comments/stats?days=${days}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d) })
      .catch(err => { toast.error(err.message); onClose() })
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[520px] max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-3">
          <BarChart3 size={15} className="text-brand" />
          <p className="flex-1 text-sm font-semibold text-fg">{t('comments.stats.title')}</p>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="bg-surface-3 text-fg text-xs rounded-lg px-2 py-1">
            {[1, 7, 30].map(d => <option key={d} value={d}>{t('comments.stats.range', { days: d })}</option>)}
          </select>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!data ? (
            <div className="flex items-center justify-center h-24"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
          ) : (<>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-3 rounded-xl p-3">
                <p className="text-[10px] text-fg-subtle">{t('comments.stats.backlog')}</p>
                <p className="text-xl font-bold text-fg">{data.backlog?.actionable ?? 0}</p>
              </div>
              <div className="bg-surface-3 rounded-xl p-3">
                <p className="text-[10px] text-fg-subtle">{t('comments.stats.oldest')}</p>
                <p className="text-xs font-semibold text-fg mt-1.5">{data.backlog?.oldest_actionable ? localeFormatDateTime(data.backlog.oldest_actionable) : '—'}</p>
              </div>
            </div>
            {data.agents.length === 0 ? (
              <p className="text-xs text-fg-subtle text-center py-6">{t('comments.stats.empty')}</p>
            ) : data.agents.map(a => (
              <div key={a.id} className="bg-surface-3 rounded-xl p-3">
                <p className="text-sm font-semibold text-fg mb-1.5">{a.name}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div><p className="text-base font-bold text-fg">{a.handled}</p><p className="text-[10px] text-fg-subtle">{t('comments.stats.handled')}</p></div>
                  <div><p className="text-base font-bold text-fg">{a.public_replies}</p><p className="text-[10px] text-fg-subtle">{t('comments.stats.publicReplies')}</p></div>
                  <div><p className="text-base font-bold text-fg">{a.private_replies}</p><p className="text-[10px] text-fg-subtle">{t('comments.stats.privateReplies')}</p></div>
                  <div><p className="text-base font-bold text-fg">{a.median_minutes ?? '—'}</p><p className="text-[10px] text-fg-subtle">{t('comments.stats.median')} ({t('comments.stats.minutes')})</p></div>
                </div>
              </div>
            ))}
          </>)}
        </div>
      </div>
    </div>
  )
}

// السحب التلقائي بيغطي أحدث الفيديوهات بس، عشان أرشيف القناة (أكتر من ١٢٠٠ فيديو) مايتصبّش
// في شاشة المفروض تكون طابور شغل. دي الطريقة للوصول لفيديو قديم: تشوفه، تشوف فيه كام تعليق،
// وتسحبه لما تحتاج — ٥ فيديوهات في المرة و"حمّل المزيد" للأقدم
function YoutubeVideosModal({ onClose, onSynced }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [videos, setVideos] = useState([])
  const [pageToken, setPageToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing] = useState(null)

  const fetchPage = useCallback(async (token) => {
    const res = await apiFetch(`${API_URL}/youtube/videos?limit=5${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }, [])

  useEffect(() => {
    fetchPage(null)
      .then(d => { setVideos(d.videos || []); setPageToken(d.nextPageToken || null) })
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [fetchPage, toast])

  const loadMore = async () => {
    if (!pageToken || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await fetchPage(pageToken)
      setVideos(prev => [...prev, ...(d.videos || [])])
      setPageToken(d.nextPageToken || null)
    } catch (err) { toast.error(err.message) } finally { setLoadingMore(false) }
  }

  const sync = async (video) => {
    setSyncing(video.id)
    try {
      const res = await apiFetch(`${API_URL}/youtube/videos/${video.id}/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('comments.videos.synced', { count: data.saved ?? 0 }))
      setVideos(prev => prev.map(v => v.id === video.id ? { ...v, stored_count: (v.stored_count || 0) + (data.saved || 0) } : v))
      onSynced?.()
    } catch (err) { toast.error(err.message) } finally { setSyncing(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[480px] max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-3">
          <Film size={15} className="text-red-500" />
          <p className="flex-1 text-sm font-semibold text-fg">{t('comments.videos.title')}</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            <X size={16} />
          </button>
        </div>

        <p className="px-5 pt-3 text-[11px] text-fg-subtle">{t('comments.videos.hint')}</p>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : videos.map(v => (
            <div key={v.id} className="flex items-center gap-2.5 bg-surface-3 rounded-xl p-2">
              {v.thumbnail && (
                <img src={v.thumbnail} alt="" loading="lazy" className="w-16 h-10 rounded object-cover flex-shrink-0 bg-surface"
                  onError={e => { e.target.style.display = 'none' }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-fg truncate">{v.title || v.id}</p>
                <p className="text-[10px] text-fg-subtle">
                  {v.comment_count === null
                    ? t('comments.videos.commentsOff')
                    : t('comments.videos.counts', { total: v.comment_count, stored: v.stored_count ?? 0 })}
                </p>
              </div>
              <button onClick={() => sync(v)} disabled={syncing === v.id || v.comment_count === null}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-40 flex-shrink-0">
                <RefreshCw size={11} className={syncing === v.id ? 'animate-spin' : ''} />
                {t('comments.videos.sync')}
              </button>
            </div>
          ))}

          {pageToken && !loading && (
            <button onClick={loadMore} disabled={loadingMore}
              className="w-full py-2 rounded-xl bg-surface-3 text-fg-muted text-xs font-medium disabled:opacity-40">
              {loadingMore ? t('comments.sending') : t('comments.videos.loadMore')}
            </button>
          )}
        </div>
      </div>
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
        // الرد الخاص فعليًا بيبقى رسالة في محادثة عادية اتعينت للموظف اللي بعتها — الباك إند
        // بيرجع معرّفها فورًا (من غير ما نستنى الويب هوك) عشان "فتح المحادثة" يظهر على طول
        : { private_replied_at: now, private_reply_conversation_id: data.conversation_id || null })
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
