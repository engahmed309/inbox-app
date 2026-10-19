import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  MessageSquare, Send, Check, EyeOff, Eye, Facebook, Instagram, Youtube, ExternalLink, X, MessageCircle,
  Trash2, Film, RefreshCw, Search, Archive, RotateCcw, BarChart3, CornerDownRight, Menu, MoreHorizontal,
  Users, UserCheck, UserX, Inbox, FileBarChart, Bot, ArrowLeftRight, MessageSquareText, Wand2, Ban, CheckCheck, Shuffle, UserPlus, ChevronsLeft, ShieldAlert, ThumbsUp, LogOut
} from 'lucide-react'
import BackArrow from '../components/BackArrow'
import LinkifiedText from '../components/LinkifiedText'
import CommentsReports from '../components/CommentsReports'
import CommentsAiSettings from '../components/CommentsAiSettings'
import CommentsModeration from '../components/CommentsModeration'
import CommentThread from '../components/CommentThread'
import { RedistributeModal, SavedRepliesModal, BackfillModal, loadSavedReplies, fillSavedReply } from '../components/CommentsAdminModals'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const PAGE_SIZE = 30
const PRIVATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const SIDEBAR_KEY = 'comments.sidebarOpen'

const PLATFORM_ICONS = {
  facebook: <Facebook size={11} className="text-blue-400" />,
  instagram: <Instagram size={11} className="text-pink-400" />,
  youtube: <Youtube size={11} className="text-red-500" />,
}

// لون ثابت لكل اسم عشان الأفاتار يبقى مميّز من غير صور
const avatarHue = (name = '') => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
const initial = (name = '') => (name.trim()[0] || '?').toUpperCase()

// العمود الجانبي مفتوح افتراضيًا على الشاشة الكبيرة وبيفتكر اختيار الموظف. على الموبايل بيبدأ مقفول دايمًا
// (درج فوق المحتوى) فمابنخزنش اختياره هناك
function readSidebarPref() {
  if (typeof window === 'undefined' || window.innerWidth < 1024) return false
  try {
    const v = localStorage.getItem(SIDEBAR_KEY)
    if (v !== null) return v === '1'
  } catch { /* الخصوصية أو التخزين مقفول — بنكمل بالافتراضي */ }
  return true
}

export default function CommentsScreen() {
  const { t } = useTranslation()
  const { agent, signOut, setStatus: setAgentStatus } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [view, setView] = useState('inbox')       // inbox | reports | ai | protection
  const [canModerate, setCanModerate] = useState(false)   // الأدمن + فريق التعليقات: مراجعة المحجوز والحظر (السيرفر بيرجّع العدد ليهم بس)
  const [modPending, setModPending] = useState(0)    // تعليقات محجوزة للأدمن (سبام/إساءة) بانتظار موافقة/رفض
  const [status, setStatus] = useState('new')
  const [platform, setPlatform] = useState('all')
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [comments, setComments] = useState([])
  const [counts, setCounts] = useState({})
  const [byPlatform, setByPlatform] = useState({})
  const [byScope, setByScope] = useState({})
  const [team, setTeam] = useState(null)             // { team, members } — فريق التعليقات وحالة أونلاين لكل موظف
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref)
  const [showVideos, setShowVideos] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showRedistribute, setShowRedistribute] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showBackfill, setShowBackfill] = useState(false)
  const [postFilter, setPostFilter] = useState(null)   // { id, caption } — تعليقات بوست واحد (جاي من تقرير المنشورات)
  const [assignFor, setAssignFor] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [ytCanReply, setYtCanReply] = useState(false)   // الأدمن ربط حساب جوجل للرد على يوتيوب
  const [seenCount, setSeenCount] = useState(null)  // عدّاد التبويب وقت آخر تحميل للقائمة
  const [replyTo, setReplyTo] = useState(null)      // { comment, mode: 'private' | 'public' }
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(null)
  const sentinelRef = useRef(null)
  const scrollRef = useRef(null)

  const isAdmin = agent?.role === 'admin'
  const canSee = isAdmin || ['comments', 'both'].includes(agent?.access_scope)
  const isWide = () => typeof window !== 'undefined' && window.innerWidth >= 1024

  const setSidebar = (open) => {
    setSidebarOpen(open)
    if (isWide()) { try { localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0') } catch { /* مش مهم */ } }
  }
  // على الموبايل القايمة درج فوق الشاشة: بنقفلها بعد الاختيار عشان الموظف يشوف النتيجة
  const afterPick = () => { if (!isWide()) setSidebarOpen(false) }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  const query = `status=${status}&platform=${platform}&scope=${scope}&q=${encodeURIComponent(debouncedSearch)}${postFilter ? `&post_id=${encodeURIComponent(postFilter.id)}` : ''}`
  const countsQuery = `platform=${platform}&scope=${scope}`

  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/counts?${countsQuery}`)
      const data = await res.json()
      if (res.ok) {
        setCounts(data.counts || {})
        setByPlatform(data.byPlatform || {})
        setByScope(data.byScope || {})
        setModPending(data.moderation_pending || 0)
        setCanModerate(data.moderation_pending !== undefined)
        return data.counts || {}
      }
    } catch { /* بنسيب العدادات القديمة معروضة */ }
    return null
  }, [countsQuery])

  const fetchTeam = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/team`)
      const data = await res.json()
      if (res.ok) setTeam(data)
    } catch { /* بنسيب القايمة القديمة */ }
  }, [])

  // بيرجّع القائمة لأول صفحة. بنستدعيها عند فتح التبويب وبعد أي إجراء — مش كل ٣٠ ثانية،
  // عشان القائمة ماتتحركش تحت إيد الموظف وهو بيقرا
  const load = useCallback(async () => {
    // العدّادات بتتحمّل بالتوازي مش في الطريق: القائمة تظهر أول ما توصل حتى لو العدّ أبطأ
    fetchCounts().then(fresh => { if (fresh) setSeenCount(fresh[status] ?? 0) })
    try {
      const listRes = await apiFetch(`${API_URL}/comments?${query}&limit=${PAGE_SIZE}`)
      const listData = await listRes.json()
      if (listRes.ok) {
        setComments(listData.comments || [])
        setHasMore(!!listData.hasMore)
        setYtCanReply(!!listData.youtube_can_reply)
      }
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
    setHasMore(false)          // وإلا مؤشر "حمّل المزيد" بتاع الفلتر القديم يفضل ظاهر ويطلب صفحة بإزاحة غلط
    load()
  }, [load, canSee])

  // التحديث الدوري بيجيب العدادات بس (استعلام عدّ في الداتابيز، مش صفوف) — ولو ظهر جديد
  // بنعرض زرار للموظف يحدّث لما يحب، بدل ما نقفز بالقائمة وهو نازل فيها
  useEffect(() => {
    if (!canSee) return
    fetchTeam()
    const id = setInterval(() => { fetchCounts(); fetchTeam() }, 30000)
    return () => clearInterval(id)
  }, [fetchCounts, fetchTeam, canSee])

  // التحميل التدريجي بيتشغّل لما آخر الصفحة يبان — من غير زرار الموظف يدوّر عليه
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore])

  // العدّاد مابيعدّش نتيجة البحث، فمؤشر "فيه جديد" بيتوقف أثناء البحث
  const pendingChanges = !debouncedSearch && !postFilter && seenCount !== null && counts[status] !== undefined && counts[status] !== seenCount
  // الزرار بيظهر بس لما فيه تعليقات جديدة وصلت. لو العدد قلّ (الذكاء الاصطناعي أو زميل عالج تعليقات) ده مش "تحديث" يستاهل زرار —
  // القائمة بتتحدّث لوحدها لما الموظف يكون فوق، وإلا بيفضل اللي قدامه زي ما هو
  const showRefreshButton = pendingChanges && counts[status] > seenCount

  // التعليقات الجديدة تظهر لوحدها: لو الموظف فوق في القائمة ومش في نص إجراء (رد/تعيين/قايمة مفتوحة) بنحدّث من غير ما يضغط.
  // لو نازل في القائمة أو بيرد على حاجة، بنسيب الزرار بدل ما نقفز بالقائمة تحت إيده. التحميل من غير سبينر عشان ماترمّش
  useEffect(() => {
    if (!pendingChanges || loading) return
    const idle = !replyTo && !assignFor && !menuFor && !deleting && !busy
    if (idle && (scrollRef.current?.scrollTop ?? 0) < 200) load()
  }, [pendingChanges, loading, replyTo, assignFor, menuFor, deleting, busy, load])

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
  // تعليق الذكاء الاصطناعي مفتوح للي الأدمن سمح له يرد (aiStatus.can_act) — وبيبقى بتاعه أول ما يتصرف فيه
  const ownedByOther = (c) => !isAdmin && c.assigned_agent_id && c.assigned_agent_id !== agent?.id
    && !(aiStatus?.can_act && c.assigned_agent_id === aiStatus.agent_id)
  const blocked = (c) => ownedByOther(c)

  // حظر صاحب تعليق مسيء (فريق التعليقات والأدمن): بيتحظر من الصفحة لو المنصة بتسمح، وتعليقاته الجديدة بتتخفي تلقائي
  const blockAuthor = async (c) => {
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
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  const patchComment = async (c, body, { remove = true } = {}) => {
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (remove) setComments(prev => prev.filter(x => x.id !== c.id))
      fetchCounts()
      return data
    } catch (err) { toast.error(err.message); load() } finally { setBusy(null) }
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
        () => hide && c.status === 'new' && status === 'new')
      fetchCounts()
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  // لايك الصفحة على تعليق فيسبوك (ميتا مش بتدّي لايك على إنستجرام ويوتيوب من الـAPI)
  const toggleLike = async (c) => {
    const liked = !c.liked_at
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}/like`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liked })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      patchRow(c.id, { liked_at: liked ? new Date().toISOString() : null })
    } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  // الأدمن يسلّم التعليق للذكاء الاصطناعي: بيطلع له مسودة (رد علني + رسالة خاصة) يراجعها ويعدّلها ويختار يبعت إيه
  const [aiFor, setAiFor] = useState(null)
  const [threadFor, setThreadFor] = useState(null)   // محادثة تعليق (الأساسي + الردود الفرعية)

  // إيقاف الذكاء الاصطناعي على تعليق واقف/بيكتب/في الطابور: بيرجع للفريق ويقدر الموظف يرد عليه
  const stopAi = async (c) => {
    if (!window.confirm(t('comments.aiState.stopConfirm'))) return
    setBusy(c.id)
    try {
      const res = await apiFetch(`${API_URL}/comments/${c.id}/ai/stop`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('comments.aiState.stopped'))
      fetchAiStatus(); fetchCounts(); load()
    } catch (err) { toast.error(err.message); load() } finally { setBusy(null) }
  }
  // مفتاح إيقاف سريع للأدمن: يقفل الوكيل كله (التعليقات الواقفة في الطابور بترجع للفريق لوحدها)
  const stopAllAi = async () => {
    if (!window.confirm(t('comments.aiCard.stopAllConfirm'))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'off' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('comments.aiCard.stoppedAll'))
      fetchAiStatus()
    } catch (err) { toast.error(err.message) }
  }

  // الذكاء الاصطناعي كموظف: حالته (نشط/متوقف) وطابوره، ويتحدّث كل ١٥ ثانية. وأي تعليق هو ماسكه دلوقتي (في الطابور/بيكتب)
  // بنحدّث حالته كل ٥ ثواني لوحده من غير ما القايمة تتحمّل وتتحرك تحت إيد الموظف
  const [aiStatus, setAiStatus] = useState(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const fetchAiStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/status`)
      const data = await res.json()
      if (res.ok) setAiStatus(data)
    } catch { /* بنسيب آخر حالة معروضة */ }
  }, [])
  useEffect(() => {
    fetchAiStatus()
    const id = setInterval(fetchAiStatus, 15000)
    return () => clearInterval(id)
  }, [fetchAiStatus])
  const inFlightIds = comments.filter(c => c.ai && ['pending', 'processing'].includes(c.ai.status)).map(c => c.id).join(',')
  useEffect(() => {
    if (!inFlightIds) return undefined
    const id = setInterval(async () => {
      setNowTick(Date.now())
      try {
        const res = await apiFetch(`${API_URL}/comments/refresh?ids=${inFlightIds}`)
        const data = await res.json()
        if (!res.ok || !data.comments?.length) return
        const byId = Object.fromEntries(data.comments.map(c => [c.id, c]))
        setComments(prev => prev.map(c => (byId[c.id] ? { ...c, ...byId[c.id] } : c)))
        if (data.comments.some(c => !['pending', 'processing'].includes(c.ai?.status))) { fetchCounts(); fetchAiStatus() }
      } catch { /* المحاولة الجاية */ }
    }, 5000)
    return () => clearInterval(id)
  }, [inFlightIds, fetchCounts, fetchAiStatus])

  const openReply = (c, mode) => setReplyTo({ comment: c, mode })
  const closeReply = () => setReplyTo(null)

  // الحذف نهائي عند ميتا، فبنسأل مرة قبله. الصف عندنا بيفضل معلّم "اتمسح" مش بيختفي
  const deleteComment = async (c) => {
    const platformName = t(c.platform === 'facebook' ? 'comments.platformFacebook' : 'comments.platformInstagram')
    if (!window.confirm(t('comments.deleteConfirm', { name: c.author_name || t('comments.unknownAuthor'), platform: platformName }))) return
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

  const postTool = async (path, body, confirmKey, doneKey) => {
    if (confirmKey && !window.confirm(t(confirmKey))) return
    try {
      const res = await apiFetch(`${API_URL}/comments/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t(doneKey, { count: data.archived ?? data.distributed ?? 0 }))
      load()
    } catch (err) { toast.error(err.message) }
  }

  if (!canSee) return (
    <div className="h-full flex items-center justify-center text-fg-muted p-6 text-center">
      <p>{t('comments.noAccess')}</p>
    </div>
  )

  const platformItems = [
    { key: 'all', label: t('comments.platforms.all'), icon: <Inbox size={15} /> },
    { key: 'facebook', label: t('comments.platforms.facebook'), icon: <Facebook size={15} className="text-blue-400" /> },
    { key: 'instagram', label: t('comments.platforms.instagram'), icon: <Instagram size={15} className="text-pink-400" /> },
    { key: 'youtube', label: t('comments.platforms.youtube'), icon: <Youtube size={15} className="text-red-500" /> },
  ]
  const statusItems = [
    { key: 'new', icon: <MessageSquare size={15} /> },
    { key: 'handled', icon: <CheckCheck size={15} /> },
    { key: 'ignored', icon: <Ban size={15} /> },
    { key: 'archived', icon: <Archive size={15} /> },
  ]
  const scopeItems = [
    { key: 'all', icon: <Users size={15} /> },
    { key: 'mine', icon: <UserCheck size={15} /> },
    { key: 'unassigned', icon: <Inbox size={15} /> },
  ]

  const NavItem = ({ active, icon, label, count, onClick }) => (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors ${active ? 'bg-brand/15 text-brand font-semibold' : 'text-fg-muted hover:bg-surface-3 hover:text-fg'}`}>
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 text-start truncate">{label}</span>
      {count > 0 && <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${active ? 'bg-brand/20' : 'bg-surface-3 text-fg-subtle'}`}>{count}</span>}
    </button>
  )
  const Section = ({ title, children }) => (
    <div className="mb-4">
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
  const ToolItem = ({ icon, label, onClick, count }) => (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg">
      <span className="flex-shrink-0">{icon}</span><span className="flex-1 text-start truncate">{label}</span>
      {count > 0 && <span className="text-[11px] tabular-nums px-1.5 rounded-full bg-amber-500/20 text-amber-500">{count}</span>}
    </button>
  )

  const sidebar = (
    <aside className="w-64 h-full flex flex-col bg-surface-2 border-e border-surface-3">
      <div className="flex items-center gap-2 px-4 pt-safe pt-4 pb-3">
        <span className="font-bold text-fg flex-1">{t('comments.title')}</span>
        <button onClick={() => setSidebar(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg" aria-label={t('comments.closeMenu')}>
          <ChevronsLeft size={16} className="rtl:rotate-180" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <Section title={t('comments.sections.areas')}>
          <NavItem active={view === 'inbox'} icon={<MessageSquare size={15} />} label={t('comments.areas.inbox')} count={view === 'inbox' ? 0 : byPlatform.all} onClick={() => { setView('inbox'); afterPick() }} />
          {isAdmin && <NavItem active={view === 'reports'} icon={<FileBarChart size={15} />} label={t('comments.areas.reports')} onClick={() => { setView('reports'); afterPick() }} />}
          {isAdmin && <NavItem active={view === 'ai'} icon={<Bot size={15} />} label={t('comments.areas.ai')} onClick={() => { setView('ai'); afterPick() }} />}
          {canModerate && <NavItem active={view === 'protection'} icon={<ShieldAlert size={15} />} label={t('comments.areas.protection')} count={modPending} onClick={() => { setView('protection'); afterPick() }} />}
        </Section>
        {view === 'inbox' && (<>
        <Section title={t('comments.sections.platform')}>
          {platformItems.map(p => (
            <NavItem key={p.key} active={platform === p.key} icon={p.icon} label={p.label}
              count={byPlatform[p.key]} onClick={() => { setPlatform(p.key); afterPick() }} />
          ))}
        </Section>
        <Section title={t('comments.sections.status')}>
          {statusItems.map(s => (
            <NavItem key={s.key} active={status === s.key} icon={s.icon} label={t(`comments.status.${s.key}`)}
              count={counts[s.key]} onClick={() => { setStatus(s.key); afterPick() }} />
          ))}
        </Section>
        <Section title={t('comments.sections.owner')}>
          {scopeItems.map(s => (
            <NavItem key={s.key} active={scope === s.key} icon={s.icon} label={t(`comments.scope.${s.key}`)}
              count={s.key === 'all' ? 0 : byScope[s.key]} onClick={() => { setScope(s.key); afterPick() }} />
          ))}
        </Section>
        </>)}
        {aiStatus && (
          <Section title={t('comments.aiCard.title')}>
            <div className="mx-1 rounded-xl bg-surface-3 px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${aiStatus.available && aiStatus.active ? 'bg-success' : 'bg-fg-subtle'}`} />
                <span className={`text-[12px] font-semibold ${aiStatus.available && aiStatus.active ? 'text-success' : 'text-fg-muted'}`}>
                  {!aiStatus.available ? t('comments.aiCard.unavailable') : t(`comments.aiCard.${aiStatus.mode === 'live' ? 'live' : aiStatus.mode === 'draft' ? 'draft' : 'off'}`)}
                </span>
              </div>
              {aiStatus.active && (<>
                <p className="text-[11px] text-fg-muted">{t('comments.aiCard.queue', { pending: aiStatus.pending, processing: aiStatus.processing, drafts: aiStatus.drafts })}</p>
                {aiStatus.next_run_at && aiStatus.pending > 0 && (
                  <p className="text-[11px] text-fg-subtle">{t('comments.aiCard.next', { s: Math.max(0, Math.round((new Date(aiStatus.next_run_at).getTime() - Date.now()) / 1000)) })}</p>
                )}
                <p className="text-[11px] text-fg-subtle">{t('comments.aiCard.day', { replied: aiStatus.replied_24h, back: aiStatus.handed_back_24h })}</p>
              </>)}
              <div className="flex items-center gap-3 pt-0.5">
                {aiStatus.agent_id && (
                  <button onClick={() => { setView('inbox'); setScope(scope === `agent:${aiStatus.agent_id}` ? 'all' : `agent:${aiStatus.agent_id}`); afterPick() }}
                    className="text-[11px] text-brand hover:underline">{t('comments.aiCard.filter')}</button>
                )}
                {isAdmin && <button onClick={() => { setView('ai'); afterPick() }} className="text-[11px] text-brand hover:underline">{t('comments.aiCard.settings')}</button>}
                {isAdmin && aiStatus.active && <button onClick={stopAllAi} className="text-[11px] text-danger hover:underline">{t('comments.aiCard.stopAll')}</button>}
              </div>
            </div>
          </Section>
        )}
        {team && (
          <Section title={team.team ? t('comments.sections.team', { name: team.team.name }) : t('comments.sections.teamNone')}>
            {team.members.length === 0 ? (
              <p className="px-3 py-1 text-[11px] text-fg-subtle">{t('comments.noMembers')}</p>
            ) : team.members.map(m => (
              <button key={m.id} onClick={() => { setView('inbox'); setScope(scope === `agent:${m.id}` ? 'all' : `agent:${m.id}`); afterPick() }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${scope === `agent:${m.id}` ? 'bg-brand/15' : 'hover:bg-surface-3'}`}>
                <span className="relative flex-shrink-0">
                  {m.is_ai ? (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white bg-brand"><Bot size={15} /></span>
                  ) : (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ background: `hsl(${avatarHue(m.name)} 45% 42%)` }}>{initial(m.name)}</span>
                  )}
                  <span className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-2 ${m.online ? 'bg-success' : 'bg-fg-subtle'}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-fg truncate">{m.name}</span>
                  <span className={`block text-[10px] ${m.online ? 'text-success' : 'text-fg-subtle'}`}>
                    {m.is_ai
                      ? t(`comments.aiCard.${m.mode === 'live' ? 'live' : m.mode === 'draft' ? 'draft' : 'off'}`)
                      : <>{m.online ? t('comments.team.online') : t('comments.team.offline')}{!m.eligible ? ` · ${t('comments.team.noAccess')}` : ''}</>}
                  </span>
                </span>
                {m.pending > 0 && <span className="text-[11px] tabular-nums px-1.5 rounded-full bg-surface-3 text-fg-subtle" title={t('comments.team.pending')}>{m.pending}</span>}
              </button>
            ))}
          </Section>
        )}
        {view === 'inbox' && (
          <Section title={t('comments.sections.tools')}>
            {isAdmin && <ToolItem icon={<BarChart3 size={15} />} label={t('comments.stats.button')} onClick={() => { setShowStats(true); afterPick() }} />}
            {isAdmin && <ToolItem icon={<Shuffle size={15} />} label={t('comments.distribute')}
              onClick={() => { postTool('distribute', {}, 'comments.distributeConfirm', 'comments.distributeDone'); afterPick() }} />}
            {isAdmin && <ToolItem icon={<ArrowLeftRight size={15} />} label={t('comments.admin.redistributeTitle')} onClick={() => { setShowRedistribute(true); afterPick() }} />}
            <ToolItem icon={<MessageSquareText size={15} />} label={t('comments.admin.savedTitle')} count={isAdmin ? team?.pending_saved_replies : 0} onClick={() => { setShowSaved(true); afterPick() }} />
            {isAdmin && <ToolItem icon={<RefreshCw size={15} />} label={t('comments.admin.backfillTitle')} onClick={() => { setShowBackfill(true); afterPick() }} />}
            {isAdmin && <ToolItem icon={<Archive size={15} />} label={t('comments.archiveOld')}
              onClick={() => { postTool('archive', { days: 7 }, 'comments.archiveConfirm', 'comments.archiveDone'); afterPick() }} />}
            {platform === 'youtube' && <ToolItem icon={<Film size={15} />} label={t('comments.videos.button')} onClick={() => { setShowVideos(true); afterPick() }} />}
          </Section>
        )}
      </div>
      {/* موظف التعليقات بس مابيشوفش شاشة المحادثات (اللي فيها الحالة والخروج) — فبنحطهم هنا عشان مايتزنقش:
          يقدر يبقى "نشط" (التوزيع بيعتمد عليها) ويسجّل خروج */}
      {!isAdmin && agent?.access_scope === 'comments' && (
        <div className="border-t border-surface-3 px-3 pt-3 pb-safe pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${agent?.status === 'online' ? 'bg-success' : agent?.status === 'busy' ? 'bg-follow' : 'bg-fg-subtle'}`} />
            <span className="flex-1 min-w-0 text-[13px] text-fg truncate">{agent?.name}</span>
            <select value={agent?.status || 'offline'} onChange={e => setAgentStatus(agent.id, e.target.value)}
              className="bg-surface-3 rounded-lg px-2 py-1 text-[12px] text-fg">
              {['online', 'busy', 'offline'].map(k => <option key={k} value={k}>{t(`conversations.agentStatus.${k}`)}</option>)}
            </select>
          </div>
          <button onClick={async () => { await signOut(); navigate('/login') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-danger hover:bg-danger/10">
            <LogOut size={15} /><span>{t('comments.signOut')}</span>
          </button>
        </div>
      )}
    </aside>
  )

  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40'

  return (
    <div className="h-full flex bg-surface overflow-hidden">
      {/* شاشة كبيرة: عمود ثابت بيتقفل ويتفتح. موبايل: درج فوق المحتوى */}
      {sidebarOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebar(false)} />
          <div className="fixed lg:static inset-y-0 start-0 z-50 lg:z-auto h-full">{sidebar}</div>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 pt-safe pt-3 pb-2.5 bg-surface-2 border-b border-surface-3">
          {!(!isAdmin && agent?.access_scope === 'comments') && <button onClick={() => navigate('/')} className={iconBtn}><BackArrow /></button>}
          {!sidebarOpen && (
            <button onClick={() => setSidebar(true)} className={iconBtn} aria-label={t('comments.openMenu')}><Menu size={18} /></button>
          )}
          {view === 'inbox' ? (
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-fg-subtle pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('comments.searchPlaceholder')}
                className="w-full bg-surface-3 rounded-xl ps-9 pe-3 py-2 text-sm text-fg" />
            </div>
          ) : (
            <span className="flex-1 font-semibold text-fg text-sm">{t(`comments.areas.${view}`)}</span>
          )}
        </div>

        {view === 'reports' && isAdmin && <CommentsReports onOpenPost={(post) => { setPostFilter({ id: post.post_id, caption: post.caption }); setStatus('new'); setPlatform('all'); setScope('all'); setSearch(''); setView('inbox') }} />}
        {view === 'ai' && isAdmin && <CommentsAiSettings />}
        {view === 'protection' && canModerate && <CommentsModeration adminView={isAdmin} />}
        {view === 'inbox' && canModerate && modPending > 0 && (
          <button onClick={() => setView('protection')} className="w-full flex items-center gap-2 px-4 py-2.5 bg-danger/10 border-b border-danger/30 text-danger text-[12px] font-medium hover:bg-danger/15">
            <ShieldAlert size={15} className="flex-shrink-0" />
            <span className="flex-1 text-start">{t('comments.mod.banner', { n: modPending })}</span>
            <span className="underline">{t('comments.mod.bannerOpen')}</span>
          </button>
        )}
        {view === 'inbox' && (<>

        {/* ملخص الفلتر الحالي — عشان الموظف دايمًا عارف هو بيشوف إيه */}
        <div className="px-4 py-2 text-[11px] text-fg-subtle border-b border-surface-3 flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-fg-muted">{t(`comments.status.${status}`)}</span>
          <span>·</span><span>{t(`comments.platforms.${platform}`)}</span>
          {scope !== 'all' && <><span>·</span><span>{scope.startsWith('agent:')
            ? (team?.members.find(m => `agent:${m.id}` === scope)?.name || '')
            : t(`comments.scope.${scope}`)}</span></>}
          {counts[status] > 0 && <span className="ms-auto tabular-nums">{counts[status]}</span>}
        </div>

        {postFilter && (
          <div className="mx-4 mt-2 flex items-center gap-2 bg-brand/10 text-brand rounded-full ps-3 pe-1 py-1 text-[11px]">
            <span className="flex-1 truncate">{t('comments.onPost')} {postFilter.caption || t('comments.untitledPost')}</span>
            <button onClick={() => setPostFilter(null)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-brand/20"><X size={12} /></button>
          </div>
        )}

        {showRefreshButton && !loading && (
          <button onClick={() => { setLoading(true); load() }}
            className="mx-4 mt-2 py-1.5 rounded-full bg-brand/15 text-brand text-[11px] font-medium">
            {t('comments.refreshAvailable')}
          </button>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-fg-subtle gap-2">
              <MessageSquare size={32} className="opacity-20" />
              <p className="text-sm">{t('comments.empty')}</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto p-3 space-y-2.5">
              {comments.map(c => {
                const other = blocked(c)
                const privateOpen = !c.private_replied_at && Date.now() - new Date(c.posted_at || c.created_at).getTime() <= PRIVATE_WINDOW_MS
                const isYoutube = c.platform === 'youtube'
                const live = !c.deleted_at
                const menuOpen = menuFor === c.id
                return (
                  <div key={c.id} className={`bg-surface-2 rounded-2xl border border-surface-3 p-3.5 ${other ? 'opacity-70' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                          style={{ background: `hsl(${avatarHue(c.author_name || '')} 45% 42%)` }}>
                          {initial(c.author_name || '')}
                        </div>
                        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-surface-2 flex items-center justify-center">
                          {PLATFORM_ICONS[c.platform]}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-fg truncate max-w-[60%]">{c.author_name || t('comments.unknownAuthor')}</span>
                          {c.parent_comment_id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle">{t('comments.isReply')}</span>}
                          {c.deleted_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger">{t('comments.deletedBadge')}</span>}
                          {c.hidden_at && live && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle">{t('comments.hiddenBadge')}</span>}
                          <span className="text-[11px] text-fg-subtle ms-auto">{localeFormatDateTime(c.posted_at || c.created_at)}</span>
                        </div>
                        {/* حالة التعيين ظاهرة دايمًا: متعيّن لمين، أو لسه ماحدش استلمه */}
                        <div className="mt-1">
                          {c.assigned_agent_id ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${c.assigned_agent_id === agent?.id ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-fg-muted'}`}>
                              <UserCheck size={10} /> {c.assigned_agent_id === agent?.id ? t('comments.assignedToMe') : t('comments.assignedTo', { name: c.agents?.name || '' })}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                              <UserX size={10} /> {t('comments.unassignedBadge')}
                            </span>
                          )}
                        </div>

                        {/* الرد على تعليق بنعرض الأصل فوقه، عشان الموظف مايرُدش على جملة مقطوعة من سياقها */}
                        {c.parent && (
                          <div className="flex items-start gap-1 mt-1 text-[11px] text-fg-subtle">
                            <CornerDownRight size={11} className="mt-0.5 flex-shrink-0 rtl:-scale-x-100" />
                            <span className="line-clamp-2 break-words"><b>{c.parent.author_name || t('comments.unknownAuthor')}:</b> {c.parent.content}</span>
                          </div>
                        )}

                        {(c.parent_comment_id || c.replies_count > 0) && (
                          <button type="button" onClick={() => setThreadFor(c)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                            <MessageSquareText size={12} />
                            {c.replies_count > 0 ? t('comments.thread.viewWithCount', { n: c.replies_count }) : t('comments.thread.view')}
                          </button>
                        )}

                        <LinkifiedText text={c.content} className="block text-sm text-fg whitespace-pre-wrap break-words mt-1" />
                      </div>
                    </div>

                    {/* التعليق لوحده مالوش معنى — الموظف لازم يعرف جاي على أنهي منشور قبل ما يرد */}
                    {(c.post_caption || c.post_thumbnail_url || c.post_permalink) && (
                      <a href={c.post_permalink || undefined} target="_blank" rel="noopener noreferrer"
                        className={`flex items-center gap-2 mt-2.5 bg-surface rounded-xl p-1.5 ${c.post_permalink ? 'hover:bg-surface-3' : 'pointer-events-none'}`}>
                        {c.post_thumbnail_url && (
                          <img src={c.post_thumbnail_url} alt="" loading="lazy"
                            className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-surface-3"
                            onError={e => { e.target.style.display = 'none' }} />
                        )}
                        <span className="flex-1 min-w-0 text-[11px] text-fg-subtle truncate">{c.post_caption || t('comments.untitledPost')}</span>
                        {c.post_permalink && <ExternalLink size={11} className="text-fg-subtle flex-shrink-0" />}
                      </a>
                    )}

                    {/* الرد العام بيتعرض بنصه — سواء اتكتب من هنا أو من الفيسبوك نفسه — عشان الموظف
                        يشوف إن حد سبقه ويشوف قال إيه، مايرجعش يرد تاني بحاجة مختلفة */}
                    {c.public_reply_at && (
                      <div className="mt-2.5 ps-2.5 border-s-2 border-success/40">
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

                    {c.parent_comment_id && !c.ai && aiStatus?.active && aiStatus.reply_to_replies === false && (
                      <p className="flex items-center gap-1.5 mt-2.5 text-[11px] text-fg-subtle">
                        <Bot size={12} className="flex-shrink-0" /> <span>{t('comments.thread.aiIgnored')}</span>
                      </p>
                    )}
                    <AiBadge c={c} now={nowTick} canStop={isAdmin || !!aiStatus?.can_act} onStop={() => stopAi(c)} stopping={busy === c.id} />

                    <div className="flex items-center gap-2 mt-3">
                      {status === 'archived' ? (
                        <button onClick={() => patchComment(c, { archived: false })} disabled={busy === c.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40">
                          <RotateCcw size={13} /> {t('comments.restore')}
                        </button>
                      ) : (<>
                        {(!isYoutube || ytCanReply) && live && (
                          <button onClick={() => openReply(c, 'public')} disabled={other || busy === c.id}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-brand text-white hover:opacity-90 disabled:opacity-40">
                            <MessageCircle size={13} /> {c.public_reply_at ? t('comments.publicReplyAgain') : t('comments.publicReply')}
                          </button>
                        )}
                        {!isYoutube && live && privateOpen && (
                          <button onClick={() => openReply(c, 'private')} disabled={other || busy === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-40">
                            <Send size={13} /> {t('comments.privateReply')}
                          </button>
                        )}
                        {isYoutube && (
                          <a href={c.post_permalink || undefined} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-surface-3 text-fg-muted hover:text-fg">
                            <ExternalLink size={13} /> {t('comments.openOnYoutube')}
                          </a>
                        )}
                        {c.platform === 'facebook' && live && (
                          <button onClick={() => toggleLike(c)} disabled={other || busy === c.id} aria-pressed={!!c.liked_at}
                            title={c.liked_at ? t('comments.unlike') : t('comments.like')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs disabled:opacity-40 ${c.liked_at ? 'bg-brand/15 text-brand font-medium' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
                            <ThumbsUp size={13} className={c.liked_at ? 'fill-current' : ''} /> {c.liked_at ? t('comments.liked') : t('comments.like')}
                          </button>
                        )}
                        {status !== 'handled' && (
                          <button onClick={() => patchComment(c, { status: 'handled' })} disabled={other || busy === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40">
                            <Check size={13} /> {t('comments.markHandled')}
                          </button>
                        )}

                        <div className="relative ms-auto">
                          <button onClick={() => setMenuFor(menuOpen ? null : c.id)} className={iconBtn} aria-label={t('comments.more')}>
                            <MoreHorizontal size={16} />
                          </button>
                          {menuOpen && (<>
                            <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                            <div className="absolute z-40 bottom-full mb-1 end-0 w-52 bg-surface-2 border border-surface-3 rounded-xl shadow-xl py-1">
                              {status !== 'ignored' && (
                                <MenuItem icon={<Ban size={13} />} label={t('comments.ignore')} disabled={other}
                                  onClick={() => { setMenuFor(null); patchComment(c, { status: 'ignored' }) }} />
                              )}
                              {!isYoutube && live && (
                                <MenuItem icon={c.hidden_at ? <Eye size={13} /> : <EyeOff size={13} />} label={c.hidden_at ? t('comments.unhide') : t('comments.hide')} disabled={other}
                                  onClick={() => { setMenuFor(null); toggleHide(c) }} />
                              )}
                              {isAdmin && (
                                <MenuItem icon={<UserPlus size={13} />} label={t('comments.assign')}
                                  onClick={() => { setMenuFor(null); setAssignFor(c) }} />
                              )}
                              {/* ردّ بالذكاء الاصطناعي: للأدمن ولموظف التعليقات على التعليق اللي يقدر يتصرف فيه (مش مع زميل) */}
                              {(isAdmin || !other) && !isYoutube && live && !c.hidden_at && !(c.public_reply_at && c.private_replied_at) && (
                                <MenuItem icon={<Bot size={13} />} label={t('comments.assignAi')} onClick={() => { setMenuFor(null); setAiFor(c) }} />
                              )}
                              {canModerate && c.author_platform_id && (
                                <MenuItem icon={<UserX size={13} />} label={c.platform === 'instagram' ? t('comments.mod.blockIg') : t('comments.mod.block')} danger
                                  onClick={() => { setMenuFor(null); blockAuthor(c) }} />
                              )}
                              <MenuItem icon={<Archive size={13} />} label={t('comments.archive')} disabled={other}
                                onClick={() => { setMenuFor(null); patchComment(c, { archived: true }) }} />
                              {!isYoutube && live && (
                                <MenuItem icon={<Trash2 size={13} />} label={t('comments.delete')} danger disabled={other || deleting === c.id}
                                  onClick={() => { setMenuFor(null); deleteComment(c) }} />
                              )}
                            </div>
                          </>)}
                        </div>
                      </>)}
                    </div>

                    {/* مين صاحب التعليق / مين شغال عليه / مين عالجه */}
                    {c.status !== 'new' && c.handler?.name && (
                      <p className="flex items-center gap-1 mt-2 text-[10px] text-fg-subtle">
                        <Check size={10} /> {t('comments.handledBy', { name: c.handler.name })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* آخر الصفحة: أول ما يبان بنجيب الدفعة اللي بعده */}
          {hasMore && !loading && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        </>)}
      </div>

      {showVideos && <YoutubeVideosModal onClose={() => setShowVideos(false)} onSynced={load} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showRedistribute && <RedistributeModal onClose={() => setShowRedistribute(false)} onDone={() => { load(); fetchTeam() }} />}
      {threadFor && <CommentThread comment={threadFor} onClose={() => setThreadFor(null)} onReplied={() => { fetchCounts(); load() }} />}
      {aiFor && <AiAssignModal comment={aiFor} onClose={() => setAiFor(null)} onDone={() => { setAiFor(null); fetchCounts(); load() }} />}
      {showSaved && <SavedRepliesModal isAdmin={isAdmin} onClose={() => setShowSaved(false)} onChanged={fetchTeam} />}
      {showBackfill && <BackfillModal onClose={() => setShowBackfill(false)} onDone={() => { load(); fetchTeam() }} />}
      {assignFor && (
        <AssignModal comment={assignFor} onClose={() => setAssignFor(null)}
          onAssigned={(agentRow) => {
            patchRow(assignFor.id, { assigned_agent_id: agentRow?.id || null, agents: agentRow ? { id: agentRow.id, name: agentRow.name } : null })
            setAssignFor(null)
            fetchCounts()
          }} />
      )}

      {replyTo && (
        <ReplyModal comment={replyTo.comment} mode={replyTo.mode}
          onClose={closeReply}
          onSent={patch => {
            patchRow(replyTo.comment.id, { ...patch, status: 'handled', assigned_agent_id: replyTo.comment.assigned_agent_id || agent?.id }, () => status !== 'handled')
            closeReply()
            fetchCounts()
          }} />
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-start disabled:opacity-40 hover:bg-surface-3 ${danger ? 'text-danger' : 'text-fg-muted hover:text-fg'}`}>
      {icon}<span>{label}</span>
    </button>
  )
}

// نقل التعليق لموظف (أدمن بس). القايمة من أعضاء الفرق اللي صلاحيتهم تعليقات
function AssignModal({ comment, onClose, onAssigned }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [agents, setAgents] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch(`${API_URL}/comments/team`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setAgents((d.members || []).filter(m => m.eligible))
      })
      .catch(err => { toast.error(err.message); onClose() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async (agentRow) => {
    setSaving(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent_id: agentRow?.id || null })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAssigned(agentRow)
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !saving && onClose()}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[380px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm">{t('comments.assignTitle')}</span>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!agents ? (
            <div className="flex items-center justify-center h-20"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
          ) : agents.length === 0 ? (
            <p className="text-xs text-fg-subtle text-center py-6">{t('comments.noMembers')}</p>
          ) : agents.map(a => (
            <button key={a.id} onClick={() => assign(a)} disabled={saving}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-start hover:bg-surface-3 disabled:opacity-40 ${comment.assigned_agent_id === a.id ? 'text-brand font-semibold' : 'text-fg'}`}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: `hsl(${avatarHue(a.name)} 45% 42%)` }}>{initial(a.name)}</span>
              <span className="flex-1 truncate">{a.name}</span>
              {comment.assigned_agent_id === a.id && <Check size={14} />}
            </button>
          ))}
        </div>
        {comment.assigned_agent_id && (
          <button onClick={() => assign(null)} disabled={saving} className="m-2 py-2 rounded-xl bg-surface-3 text-fg-muted text-xs hover:text-fg disabled:opacity-40">
            {t('comments.unassign')}
          </button>
        )}
      </div>
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
                <p className="text-xl font-bold text-fg">{data.backlog?.total ?? 0}</p>
              </div>
              <div className="bg-surface-3 rounded-xl p-3">
                <p className="text-[10px] text-fg-subtle">{t('comments.stats.oldest')}</p>
                <p className="text-xs font-semibold text-fg mt-1.5">{data.backlog?.oldest ? localeFormatDateTime(data.backlog.oldest) : '—'}</p>
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
// حالة الذكاء الاصطناعي على التعليق: عشان الموظف والأدمن يفهموا إيه اللي بيحصل بدل ما يكون كله في الخلفية
function AiBadge({ c, now, canStop, onStop, stopping }) {
  const { t } = useTranslation()
  const a = c.ai
  if (!a) return null
  const reason = a.reason || a.error || ''
  const manual = a.manual ? ` · ${t('comments.aiState.manual')}` : ''
  let text = null, tone = 'text-fg-muted', spin = false
  if (a.status === 'pending') {
    const s = Math.round((new Date(a.run_after).getTime() - now) / 1000)
    text = s > 1 ? t('comments.aiState.pending', { s }) : t('comments.aiState.pendingSoon'); tone = 'text-brand'
  } else if (a.status === 'processing') { text = t('comments.aiState.processing'); tone = 'text-brand'; spin = true }
  else if (a.status === 'draft') { text = t('comments.aiState.draft'); tone = 'text-amber-500' }
  else if (a.status === 'replied') { text = t(a.edited ? 'comments.aiState.repliedEdited' : 'comments.aiState.replied'); tone = 'text-success' }
  else if (a.status === 'escalated') { text = reason ? t('comments.aiState.escalated', { reason }) : t('comments.aiState.escalatedNoReason'); tone = 'text-amber-500' }
  else if (a.status === 'failed') { text = t('comments.aiState.failed', { reason: reason || '—' }); tone = 'text-danger' }
  else if (a.status === 'skipped') { text = reason ? t('comments.aiState.skipped', { reason }) : t('comments.aiState.skippedNoReason') }
  if (!text) return null
  return (
    <p className={`flex items-center gap-1.5 mt-2.5 text-[11px] ${tone}`}>
      {spin ? <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin flex-shrink-0" /> : <Bot size={12} className="flex-shrink-0" />}
      <span className="min-w-0 break-words">{text}{manual}</span>
      {canStop && ['pending', 'processing', 'draft'].includes(a.status) && (
        <button type="button" onClick={onStop} disabled={stopping}
          className="ms-auto flex-shrink-0 px-2 py-0.5 rounded-lg bg-danger/10 text-danger text-[10px] font-semibold hover:bg-danger/20 disabled:opacity-40">
          {t('comments.aiState.stop')}
        </button>
      )}
    </p>
  )
}

// ─── ردّ بالذكاء الاصطناعي (تسليم يدوي من الأدمن) ────────────────────────
// بيجيب مسودة من السيرفر (رد علني + رسالة خاصة) من غير نشر، الأدمن يراجعها ويعدّل ويختار يبعت الاتنين أو واحد بس
function AiAssignModal({ comment, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [state, setState] = useState({ loading: true, error: null })
  const [draft, setDraft] = useState(null)   // { id, private_possible, private_skipped }
  const [pubText, setPubText] = useState('')
  const [privText, setPrivText] = useState('')
  const [sendPub, setSendPub] = useState(true)
  const [sendPriv, setSendPriv] = useState(true)
  const [sending, setSending] = useState(false)
  const [privRefused, setPrivRefused] = useState(null)   // رسالة الخطأ لو فيسبوك رفض الرسالة الخاصة

  // noPrivate: بعد ما فيسبوك يرفض الرسالة الخاصة، بنطلب مسودة رد علني بس (من غير ادّعاء رسالة خاصة)
  const generate = async (opts) => {
    const noPrivate = opts?.noPrivate === true
    setPrivRefused(false)
    setState({ loading: true, error: null })
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}/assign-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(noPrivate ? { no_private: true } : {}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('comments.aiAssign.failed'))
      setDraft({ id: data.id, private_possible: data.private_possible !== false, private_skipped: data.private_skipped })
      setPubText(data.reply_text || '')
      setPrivText(data.private_text || '')
      setSendPub(Boolean(data.reply_text) && !comment.public_reply_at)
      setSendPriv(Boolean(data.private_text) && data.private_possible !== false)
      setState({ loading: false, error: null })
    } catch (err) { setState({ loading: false, error: err.message }) }
  }
  useEffect(() => { generate() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // الإلغاء بيرفض المسودة عشان ما تفضلش معلّقة في قايمة مسودات الذكاء الاصطناعي
  const cancel = () => {
    if (sending) return
    if (draft?.id) apiFetch(`${API_URL}/comments/ai/replies/${draft.id}/reject`, { method: 'POST' }).catch(() => {})
    onClose()
  }

  const canPub = !comment.public_reply_at
  const canPriv = draft?.private_possible !== false && !comment.private_replied_at
  const pubOn = sendPub && canPub && pubText.trim()
  const privOn = sendPriv && canPriv && privText.trim()
  const label = pubOn && privOn ? 'sendBoth' : pubOn ? 'sendPublic' : privOn ? 'sendPrivate' : null

  const send = async () => {
    if (!label) return
    setSending(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/ai/replies/${draft.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pubText.trim(), private_text: privText.trim(), send_public: Boolean(pubOn), send_private: Boolean(privOn) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('comments.aiAssign.failed'))
      toast.success(t('comments.aiAssign.sent'))
      onDone()
    } catch (err) {
      // رفض الرسالة الخاصة من ميتا: المسودة اتستهلكت، فنعرض الرسالة ونقترح مسودة رد علني بس
      if (String(err.message).startsWith(t('comments.aiAssign.privatePrefix'))) setPrivRefused(err.message)
      else toast.error(err.message)
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={cancel}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[480px] max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm flex items-center gap-2"><Bot size={16} className="text-brand" /> {t('comments.aiAssign.title')}</span>
          <button onClick={cancel} className="text-fg-subtle hover:text-fg"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-surface-3 rounded-xl p-2.5">
            <p className="text-[11px] text-fg-subtle mb-1">{comment.author_name || t('comments.unknownAuthor')}</p>
            <LinkifiedText text={comment.content} className="block text-xs text-fg-muted whitespace-pre-wrap break-words" />
          </div>

          {state.loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-fg-muted">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" /> {t('comments.aiAssign.preparing')}
            </div>
          ) : state.error ? (
            <div className="space-y-3">
              <p className="text-xs text-danger bg-danger/10 rounded-xl p-3">{state.error}</p>
              <div className="flex gap-2">
                <button onClick={() => generate()} className="flex-1 py-2 rounded-xl bg-brand text-white text-sm font-semibold">{t('comments.aiAssign.retry')}</button>
                <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-3 text-fg-muted text-sm">{t('comments.aiAssign.cancel')}</button>
              </div>
            </div>
          ) : (<>
            <p className="text-[11px] text-fg-subtle">{t('comments.aiAssign.hint')}</p>

            <div className={`rounded-xl border p-2.5 space-y-1.5 ${pubOn ? 'border-brand/40' : 'border-surface-3 opacity-70'}`}>
              <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                <input type="checkbox" checked={sendPub && canPub} disabled={!canPub} onChange={e => setSendPub(e.target.checked)} />
                <MessageCircle size={13} /> {t('comments.aiAssign.publicLabel')}
                <span className="ms-auto text-[10px] font-normal text-fg-subtle">{t('comments.aiAssign.chars', { n: pubText.length })}</span>
              </label>
              <textarea value={pubText} onChange={e => setPubText(e.target.value)} rows={3} disabled={!canPub}
                className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" />
            </div>

            <div className={`rounded-xl border p-2.5 space-y-1.5 ${privOn ? 'border-brand/40' : 'border-surface-3 opacity-70'}`}>
              <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                <input type="checkbox" checked={sendPriv && canPriv} disabled={!canPriv} onChange={e => setSendPriv(e.target.checked)} />
                <Send size={13} /> {t('comments.aiAssign.privateLabel')}
                <span className="ms-auto text-[10px] font-normal text-fg-subtle">{t('comments.aiAssign.chars', { n: privText.length })}</span>
              </label>
              {canPriv ? (
                <textarea value={privText} onChange={e => setPrivText(e.target.value)} rows={4}
                  className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" />
              ) : (
                <p className="text-[11px] text-amber-500">{t('comments.aiAssign.privateUnavailable', { reason: draft?.private_skipped || t('comments.privateReplySent') })}</p>
              )}
            </div>

            {privRefused && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                <p className="text-xs text-amber-500 leading-relaxed">{privRefused}</p>
                <button onClick={() => generate({ noPrivate: true })}
                  className="w-full py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold">{t('comments.aiAssign.publicOnlyButton')}</button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={send} disabled={sending || !label}
                className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40">
                {sending ? t('comments.sending') : label ? t('comments.aiAssign.' + label) : t('comments.aiAssign.pickOne')}
              </button>
              <button onClick={() => generate()} disabled={sending} title={t('comments.aiAssign.regenerate')}
                className="px-3 py-2.5 rounded-xl bg-surface-3 text-fg-muted hover:text-fg text-xs flex items-center gap-1.5 disabled:opacity-40">
                <Wand2 size={14} /> {t('comments.aiAssign.regenerate')}
              </button>
              <button onClick={cancel} disabled={sending} className="px-3 py-2.5 rounded-xl bg-surface-3 text-fg-muted text-xs disabled:opacity-40">{t('comments.aiAssign.cancel')}</button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

function ReplyModal({ comment, mode, onClose, onSent }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState([])
  const [sug, setSug] = useState({ loading: false, items: [], note: null, examples: 0, asked: false })
  // رسالة خاصة: بعدها بنرد علنًا إننا تواصلنا معاه (سياسة الصفحة: ما بنطلبش منه يراسلنا)
  const canAck = mode === 'private' && !comment.public_reply_at && !comment.deleted_at
  const [alsoPublic, setAlsoPublic] = useState(true)
  const [ack, setAck] = useState(t('comments.ai.defaultAck'))
  useEffect(() => { loadSavedReplies().then(setSaved) }, [])

  // اقتراح بالذكاء الاصطناعي: بيتعلم من ردود الدكتور والموظفين السابقة. بيتحط في الصندوق والموظف يعدّل ويبعت
  const suggest = async () => {
    setSug(s => ({ ...s, loading: true }))
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}/suggest-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: isPublic ? 'public' : 'private' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSug({ loading: false, items: data.suggestions || [], note: data.note, examples: data.examples || 0, asked: true })
      if (data.suggestions?.[0]?.text && !text.trim()) setText(data.suggestions[0].text)
      if (data.public_ack) setAck(data.public_ack)
      if (!data.suggestions?.length) toast.error(t('comments.ai.noSuggestion'))
    } catch (err) { toast.error(err.message); setSug(s => ({ ...s, loading: false })) }
  }
  const isPublic = mode === 'public'

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await apiFetch(`${API_URL}/comments/${comment.id}/${isPublic ? 'reply' : 'private-reply'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), ...(canAck && alsoPublic && ack.trim() ? { public_message: ack.trim() } : {}) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t(isPublic ? 'comments.publicReplyDone' : 'comments.privateReplyDone'))
      if (data.public && !data.public.ok) toast.error(t('comments.ai.ackFailed', { error: data.public.error || '' }))
      const now = new Date().toISOString()
      onSent(isPublic
        ? { public_reply_at: now, public_reply_text: text.trim() }
        // الرد الخاص فعليًا بيبقى رسالة في محادثة عادية اتعينت للموظف اللي بعتها — الباك إند
        // بيرجع معرّفها فورًا (من غير ما نستنى الويب هوك) عشان "فتح المحادثة" يظهر على طول
        : { private_replied_at: now, private_reply_conversation_id: data.conversation_id || null, ...(data.public?.ok ? { public_reply_at: now, public_reply_text: ack.trim() } : {}) })
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
          <button type="button" onClick={suggest} disabled={sug.loading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-brand/10 text-brand text-xs font-semibold hover:bg-brand/20 disabled:opacity-50">
            {sug.loading ? <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <Wand2 size={14} />}
            {sug.loading ? t('comments.ai.suggesting') : sug.asked ? t('comments.ai.suggestAgain') : t('comments.ai.suggest')}
          </button>
          {sug.asked && sug.items.length > 0 && (
            <div className="space-y-1.5">
              {sug.items.map((it, i) => (
                <button key={i} type="button" onClick={() => setText(it.text)}
                  className="w-full text-start bg-surface-3 hover:bg-surface rounded-xl px-3 py-2 text-xs text-fg whitespace-pre-wrap break-words border border-transparent hover:border-brand/40">{it.text}</button>
              ))}
              {sug.note && <p className="text-[11px] text-amber-500">💡 {sug.note}</p>}
              <p className="text-[10px] text-fg-subtle">{t('comments.ai.learnedFrom', { n: sug.examples })}</p>
            </div>
          )}
          {saved.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {saved.map(r => (
                <button key={r.id} type="button" onClick={() => setText(fillSavedReply(r.body, comment.author_name))}
                  className="px-2.5 py-1 rounded-full bg-surface-3 text-fg-muted hover:text-fg text-[11px]">{r.title}</button>
              ))}
            </div>
          )}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
            placeholder={t(isPublic ? 'comments.publicReplyPlaceholder' : 'comments.privateReplyPlaceholder')}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
          {canAck && (
            <div className="bg-surface-3 rounded-xl p-2.5 space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                <input type="checkbox" checked={alsoPublic} onChange={e => setAlsoPublic(e.target.checked)} />
                {t('comments.ai.alsoPublic')}
              </label>
              {alsoPublic && (
                <textarea value={ack} onChange={e => setAck(e.target.value)} rows={2}
                  className="w-full bg-surface rounded-lg px-2.5 py-2 text-xs text-fg" />
              )}
            </div>
          )}
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
