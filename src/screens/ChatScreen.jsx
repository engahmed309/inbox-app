import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import ContactSidebar from '../components/ContactSidebar'
import RequestAdminModal from '../components/RequestAdminModal'
import EmojiPicker from '../components/EmojiPicker'
import { logActivity } from '../lib/activityLog'
import {
  ArrowRight, Send, Paperclip, ChevronDown, Search, X,
  User, Check, CheckCheck, Facebook, Instagram, Phone, Mic, Trash2, UserCog, Clock, Ban, StickyNote, MessageSquareText, FolderOpen, Copy, Reply, Smile, Bot, Wand2, Megaphone
} from 'lucide-react'

const STATUS_OPTS = [
  { key: 'open', label: 'مفتوحة', color: 'bg-success' },
  { key: 'follow_up', label: 'متابعة', color: 'bg-follow' },
  { key: 'closed', label: 'مغلقة', color: 'bg-slate-500' },
]

const MAX_RECORD_SECONDS = 180 // ٣ دقايق أقصى مدة لتسجيل الرسالة الصوتية
const MESSAGES_PAGE_SIZE = 50 // بنجيب آخر ٥٠ رسالة بس، والأقدم بتتحمل عند الطلب بزرار "تحميل رسائل أقدم"

// فيسبوك وانستجرام وواتساب كلهم بيطبّقوا "نافذة الـ٢٤ ساعة": من آخر رسالة العميل بعتها، عندنا ٢٤ ساعة
// نرد فيها برسالة عادية — بعد كده الرد بيترفض (واتساب بيتطلب Template معتمد، فيسبوك/انستجرام بيمنعوا الرد خالص)
const MESSAGE_WINDOW_HOURS = 24
const WINDOW_EXPIRED_TEXT = {
  whatsapp: 'عدّت ٢٤ ساعة من آخر رسالة للعميل — واتساب مايسمحش برسالة عادية دلوقتي، لازم تبعت Template معتمد مسبقاً من ميتا.',
  instagram: 'عدّت ٢٤ ساعة من آخر رسالة للعميل — انستجرام بيرفض أي رد عادي بعد المدة دي. المحادثة تترجع تشتغل تاني بس لو العميل بعت رسالة جديدة.',
  facebook: 'عدّت ٢٤ ساعة من آخر رسالة للعميل — فيسبوك بيرفض أي رد عادي بعد المدة دي. المحادثة تترجع تشتغل تاني بس لو العميل بعت رسالة جديدة.',
}
const PLATFORM_LABEL = { facebook: 'فيسبوك', instagram: 'إنستجرام', whatsapp: 'واتساب' }

// الاسم اللي بيظهر للقناة: الاسم المختصر لو المستخدم حطه، وإلا لكل واتساب بنعرض اسم الـ WABA +
// آخر رقمين من الـ ID عشان نفرّق بين أرقام كتير بنفس الاسم، ولباقي المنصات بنرجع لاسم الحساب من ميتا
function getChannelLabel(ch) {
  if (!ch) return null
  if (ch.custom_name) return ch.custom_name
  if (ch.platform === 'whatsapp') {
    const last2 = String(ch.external_id || '').slice(-2)
    return `${ch.display_name || 'واتساب'} #${last2}`
  }
  return ch.display_name || null
}

function AgentAvatar({ agent, size = 20 }) {
  const [broken, setBroken] = useState(false)
  const name = agent?.name || ''
  const src = agent?.avatar_url
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0 bg-surface-3"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="rounded-full bg-brand/20 text-brand font-bold flex items-center justify-center flex-shrink-0"
    >
      {name ? name[0] : '?'}
    </span>
  )
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'اليوم'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'أمس'
  return d.toLocaleDateString('ar')
}

// اسم مؤقت مميّز لحد ما يتسجل اسم حقيقي (فيسبوك بيمنع جلب الاسم/الصورة لأغلب الحسابات)
function displayName(contact) {
  if (contact?.name) return contact.name
  if (contact?.platform_id) return `زائر ${contact.platform_id.slice(-4)}`
  return 'مجهول'
}

export default function ChatScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { agent } = useAuth()
  const toast = useToast()

  const [conv, setConv] = useState(null)
  const [contact, setContact] = useState(null)
  const [channelActive, setChannelActive] = useState(true)
  const [channelLabel, setChannelLabel] = useState(null)
  const [messages, setMessages] = useState([])
  const [assignLogs, setAssignLogs] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null) // الرسالة اللي الموظف بيرد عليها (ريبلاي)، لو فيه
  const [actionSheetMsg, setActionSheetMsg] = useState(null) // الرسالة اللي فتحنا لها قائمة نسخ/رد (اضغط مطول)
  const [showStatus, setShowStatus] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [agents, setAgents] = useState([])
  const [showAssign, setShowAssign] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [pendingFile, setPendingFile] = useState(null) // { file, url, previewUrl, type, name }
  const [lightbox, setLightbox] = useState(null) // { type: 'image'|'video', url }
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showLibraryModal, setShowLibraryModal] = useState(false)
  const [libraryItems, setLibraryItems] = useState([])
  const [librarySearch, setLibrarySearch] = useState('')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [showNoteBox, setShowNoteBox] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)

  // بيكتب دلوقتي — { label: expiresAtMs } لأي حد فاتح نفس المحادثة (موظف تاني، الـ AI). كل إشارة
  // ليها صلاحية قصيرة (بتتجدد باستمرار طول ما هو بيكتب)، فلو حد قفل التاب فجأة من غير ما يبعت
  // إشارة "خلصت" هتختفي لوحدها من غير ما تفضل عالقة
  const [typingUsers, setTypingUsers] = useState({})
  const typingChannelRef = useRef(null)
  const myTypingRef = useRef({ lastSentAt: 0, offTimeout: null })

  // القنوات المتصلة بمحادثة واتساب واحدة (كل الأرقام اللي العميل كلّم بيها) — لو أكتر من رقم لسه
  // في نافذة الـ٢٤ ساعة، الموظف يقدر يختار يرد من أنهي رقم بدل ما يبقى مقفول على آخر رقم رد بيه بس
  const [connectedChannels, setConnectedChannels] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState(null)

  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDateTime, setFollowUpDateTime] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [savingFollowUp, setSavingFollowUp] = useState(false)

  const [lifecycles, setLifecycles] = useState([])
  const [showLifecycle, setShowLifecycle] = useState(false)

  const [quickReplies, setQuickReplies] = useState([])
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplyFilter, setQuickReplyFilter] = useState('')

  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const messagesCountRef = useRef(0)
  const firstLoadDoneRef = useRef(false)
  const realtimeRef = useRef(null)
  const fileInputRef = useRef(null)
  const tempIdRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const textareaRef = useRef(null)

  // مربع الكتابة يفرد لحد ما وصل لـ٣-٤ سطور تقريباً وبعد كده يبقى فيه سكرول جواه بدل ما يكبر أكتر
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`
  }, [text])

  // بنسكرول الحاوية نفسها بس (scrollTop) مش scrollIntoView، عشان الأخيرة ممكن
  // "تسرّب" السكرول لصفحة الموبايل كلها وتطيّر الهيدر بره الشاشة
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      const el = messagesContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 30)
  }, [])

  // ─── جيب الرسائل + سجل التعيين من الـ DB ────────────────────────────
  // بنجيب بس آخر MESSAGES_PAGE_SIZE رسالة (مش كل تاريخ المحادثة) وبندمجهم مع اللي محمّل قبل كده
  // (زي رسايل أقدم اتحملت بزرار "تحميل رسائل أقدم")، عشان محادثة طويلة العمر متتقلش كل ٤ ثواني كاملة
  const fetchMessages = useCallback(async (scroll = true) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE)

    const latest = (data || []).slice().reverse()
    if (!firstLoadDoneRef.current) {
      setHasMoreMessages(latest.length === MESSAGES_PAGE_SIZE)
      firstLoadDoneRef.current = true
    }

    setMessages(prev => {
      // شيل أي رسايل مؤقتة (temp) قبل الدمج — دي مجرد placeholder وقت الإرسال، ولازم تستبدل
      // بالرسالة الحقيقية اللي جايالنا دلوقتي، مش تتراكم جنبها
      const withoutTemps = prev.filter(m => !m._temp)
      const existingIds = new Set(withoutTemps.map(m => m.id))
      const merged = [...withoutTemps, ...latest.filter(m => !existingIds.has(m.id))]
      merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      // اسكرول لو فيه رسايل جديدة فعلاً (مش كل مرة الـ polling بيجري)
      const hasNewOnes = merged.length > messagesCountRef.current
      messagesCountRef.current = merged.length
      if (scroll || hasNewOnes) scrollToBottom()
      return merged
    })

    const { data: logs } = await supabase
      .from('conversation_assignment_log')
      .select('*, assigned_to_agent:assigned_to(name), assigned_by_agent:assigned_by(name)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setAssignLogs(logs || [])

    const { data: activity } = await supabase
      .from('conversation_activity_log')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setActivityLogs(activity || [])
  }, [id, scrollToBottom])

  useEffect(() => {
    messagesCountRef.current = 0 // محادثة جديدة، صفّر العداد عشان السكرول يشتغل صح
    firstLoadDoneRef.current = false
    setHasMoreMessages(false)
    setMessages([])
    const loadData = async () => {
      // Conversation + Contact
      const { data: convData } = await supabase
        .from('conversations')
        .select('*, contacts(*)')
        .eq('id', id)
        .single()
      if (convData) {
        setConv(convData)
        setContact(convData.contacts)
      }

      // Agent name
      if (convData?.assigned_agent_id) {
        const { data: ag } = await supabase
          .from('agents').select('name, avatar_url').eq('id', convData.assigned_agent_id).single()
        if (ag) setConv(prev => ({ ...prev, agentName: ag.name, agentAvatarUrl: ag.avatar_url }))
      }

      // Messages + Assignment log
      await fetchMessages(false)
      scrollToBottom(false)

      // ملحوظة: مبنعملش "mark as read" عالمي هنا — المحادثة تفضل غير مقروءة للكل لحد ما نرد فعلياً.
      // بس بمجرد ما الموظف ده يفتح الشات، نسجّل قراءته الشخصية (خاصة بيه بس)
      if (agent?.id) {
        // await ضروري هنا — كويري سوبابيز lazy، من غير await/.then() الطلب مبيتبعتش خالص للسيرفر
        await supabase.from('conversation_reads')
          .upsert({ conversation_id: id, agent_id: agent.id, read_at: new Date().toISOString() })
      }
      // إيصال قراءة فعلي على المنصة نفسها (تيك أزرق للعميل) — منفصل تمامًا عن القراءة الداخلية فوق
      fetch(`${API_URL}/conversations/${id}/mark-seen`, { method: 'POST' }).catch(() => {})

      // القنوات المتصلة بمحادثة الواتساب دي (كل رقم كلّم بيه العميل) — لتحديد رقم افتراضي وعرضها للموظف
      if (convData?.platform === 'whatsapp') {
        try {
          const chRes = await fetch(`${API_URL}/conversations/${id}/channels`)
          const chData = await chRes.json()
          setConnectedChannels(chData.channels || [])
        } catch { setConnectedChannels([]) }
      } else {
        setConnectedChannels([])
      }
      setSelectedChannelId(convData?.channel_id || null)

      // Agents list (لأي agent يقدر يعيّن/يستلم محادثات) — بنستبعد صف الـ AI Agent نفسه، عشان
      // مربع "تعيين" ده لتحويل المحادثة لموظف بشري بس، مش وسيلة لتفعيل رد الـ AI
      const { data: ags } = await supabase.from('agents').select('id, name, is_online, status, avatar_url').neq('role', 'ai').order('name')
      setAgents(ags || [])

      // Quick replies
      const { data: qrs } = await supabase.from('quick_replies').select('*').order('name')
      setQuickReplies(qrs || [])

      // Lifecycle stages
      const { data: lcs } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
      setLifecycles(lcs || [])
    }

    loadData()

    // ─── Realtime ─────────────────────────────────────────
    // بنستخدم subscription من غير filter سيرفر-سايد ونفلتر يدوي بالـ conversation_id،
    // لأن الـ filtered subscriptions أحياناً بتفوت أحداث وقت التبديل بين محادثات بسرعة
    if (realtimeRef.current) realtimeRef.current.unsubscribe()
    realtimeRef.current = supabase
      .channel(`messages-${id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new
        if (newMsg.conversation_id !== id) return
        setMessages(prev => {
          // شيل أي temp messages وضيف الحقيقي
          const withoutTemps = prev.filter(m => !m._temp)
          if (withoutTemps.find(m => m.id === newMsg.id)) return withoutTemps
          return [...withoutTemps, newMsg]
        })
        scrollToBottom()
        // ملحوظة: مبنعملش mark as read هنا — تفضل غير مقروءة لحد ما نرد فعلياً
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        // بيغطي تحديث حالة التسليم/القراءة (sent/delivered/read) وأي تعديل تاني على رسالة موجودة
        const updated = payload.new
        if (updated.conversation_id !== id) return
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_assignment_log',
      }, (payload) => {
        if (payload.new.conversation_id !== id) return
        fetchMessages(false)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_activity_log',
      }, (payload) => {
        if (payload.new.conversation_id !== id) return
        fetchMessages(false)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, (payload) => {
        if (payload.new.id !== id) return
        setConv(prev => prev ? { ...prev, ...payload.new } : prev)
      })
      .subscribe((status) => {
        // الـ Realtime أحياناً بيقفل الاتصال بصمت (شبكة موبايل، الجهاز نام، إلخ) من غير ما
        // React يعرف — لو حصل كده نجيب أي رسايل فاتت فوراً بدل ما نستنى الـ polling البطيء
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          fetchMessages(false)
        }
      })

    // بث "بيكتب" — قناة منفصلة تمامًا عن رسايل الداتابيز فوق، مفيش أي حاجة بتتسجل هنا. أي حد
    // (موظف تاني أو الـ AI) فاتح نفس المحادثة بيشوف اللي بيكتبوا دلوقتي، وبيختفي تلقائي بعد ٤
    // ثواني من آخر إشارة وصلت (حماية لو إشارة "خلص" ضاعت)
    typingChannelRef.current = supabase
      .channel(`typing:${id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.agentId && payload.agentId === agent?.id) return // متجاهلش إشارة نفسك
        setTypingUsers(prev => {
          const next = { ...prev }
          if (payload.typing) next[payload.label] = Date.now() + 4000
          else delete next[payload.label]
          return next
        })
      })
      .subscribe()

    const typingCleanup = setInterval(() => {
      setTypingUsers(prev => {
        const now = Date.now()
        const next = {}
        let changed = false
        Object.entries(prev).forEach(([label, expiresAt]) => {
          if (expiresAt > now) next[label] = expiresAt
          else changed = true
        })
        return changed ? next : prev
      })
    }, 1000)

    // لو التاب/التطبيق راح للخلفية (زي فتح تطبيق تاني تبعت منه) وبعدين رجع،
    // المتصفح ممكن يكون وقف اتصال الـ Realtime، فلما يرجع نجيب أي رسايل فاتت فوراً
    const handleVisibility = () => { fetchMessages() }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    // شبكة الضمان جوه محادثة مفتوحة: تحديث كل ٦ ثواني (مش زي شاشة القائمة اللي كل ٧٥ ثانية)،
    // لأن استعلام رسايل محادثة واحدة رخيص جداً، وده بيغطي أي مرة الـ Realtime يفشل بصمت من غير
    // ما نضطر ننتظر معاه — الموظف واقف فعلياً بيقرا في الشات دي دلوقتي فلازم يكون سريع
    const pollInterval = setInterval(() => { fetchMessages(false) }, 6000)

    return () => {
      realtimeRef.current?.unsubscribe()
      typingChannelRef.current?.unsubscribe()
      clearInterval(typingCleanup)
      clearTimeout(myTypingRef.current.offTimeout)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      clearInterval(pollInterval)
    }
  }, [id])

  // ─── التأكد إن قناة المحادثة دي (فيسبوك/انستجرام/واتساب) لسه متربطة ────
  // لو حد فصل القناة من الإعدادات (أو التوكن بقى منتهي) وإحنا واقفين في شات بتاعها،
  // نقفل مربع الكتابة ونوضح السبب بدل ما نسيب الموظف يبعت رسالة هتفشل من غير تفسير
  useEffect(() => {
    if (!conv?.platform) return
    let cancelled = false
    const checkChannel = async () => {
      try {
        const res = await fetch(`${API_URL}/channels`)
        const data = await res.json()
        if (cancelled) return
        // لو المحادثة دي مرتبطة برقم/قناة معينة، اتأكد من القناة دي بالظبط (مش أي قناة من نفس المنصة)
        const platformChannels = data.channels?.filter(c => c.platform === conv.platform) || []
        const ch = conv.channel_id
          ? platformChannels.find(c => c.id === conv.channel_id)
          : platformChannels[0]
        setChannelActive(ch?.status === 'active')
        setChannelLabel(getChannelLabel(ch))
      } catch {
        // لو فشل الفحص نفسه (مشكلة شبكة مثلاً)، منقفلش المربع بناءً على معلومة مش أكيدة
      }
    }
    checkChannel()
    const interval = setInterval(checkChannel, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [conv?.platform])

  // ─── تحميل رسايل أقدم (pagination) ─────────────────────────
  const loadOlderMessages = async () => {
    if (loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    const oldest = messages[0]?.created_at
    const container = messagesContainerRef.current
    const prevScrollHeight = container?.scrollHeight || 0

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE)

    const older = (data || []).slice().reverse()
    setMessages(prev => [...older, ...prev])
    messagesCountRef.current += older.length
    setHasMoreMessages(older.length === MESSAGES_PAGE_SIZE)
    setLoadingOlder(false)

    // حافظ على مكان السكرول عشان الشاشة متقفزش لما نضيف رسايل قديمة فوق القائمة
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevScrollHeight
    })
  }

  // ─── إرسال رسالة (نص و/أو ملف) ─────────────────────────────
  const uploadPendingFile = async (pf) => {
    if (pf.url) return pf.url // ملف جاهز من مكتبة الردود السريعة
    const safeName = pf.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `media/${id}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('inbox-media').upload(path, pf.file)
    if (error) throw error
    const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
    return urlData.publicUrl
  }

  const sendOne = async (content, content_type, media_url, replyToId) => {
    const res = await fetch(`${API_URL}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: id, content, content_type, media_url, agent_id: agent?.id,
        reply_to_message_id: replyToId || undefined,
        channel_id: conv?.platform === 'whatsapp' ? (selectedChannelId || undefined) : undefined
      })
    })
    if (!res.ok) throw new Error()
  }

  const sendMessage = async () => {
    const msgText = text.trim()
    const pf = pendingFile
    const replyToId = replyingTo?.id
    if (!msgText && !pf) return
    if (sending) return
    setSending(true)
    sendTyping(false)
    setText('')
    setPendingFile(null)
    setReplyingTo(null)

    const tempId = `temp-${Date.now()}`
    tempIdRef.current = tempId
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: id,
      direction: 'outbound',
      content: msgText || pf?.name,
      content_type: pf ? pf.type : 'text',
      media_url: pf?.previewUrl,
      reply_to_message_id: replyToId || null,
      created_at: new Date().toISOString(),
      _temp: true,
    }])
    scrollToBottom()

    let textSent = false
    try {
      // النص والملف مع بعض بيتبعتوا كرسالتين متتاليتين (فيسبوك مايدعمش caption مع الملف) —
      // الريبلاي (لو فيه) بيتحط على أول رسالة بتتبعت بس
      if (msgText) { await sendOne(msgText, 'text', null, replyToId); textSent = true }
      if (pf) {
        const url = await uploadPendingFile(pf)
        await sendOne(pf.name || 'ملف', pf.type, url, msgText ? null : replyToId)
      }
      await fetchMessages()
      // اتردّ فعلاً، دلوقتي بس تتعلّم "مقروءة"
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
      setConv(prev => prev ? { ...prev, unread_count: 0 } : prev)
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      if (textSent) {
        // النص اتبعت فعلاً وسجّل في القاعدة — منرجعوش عشان مايتبعتش تاني، بس نرجّع الملف عشان يعيد المحاولة بيه بس
        await fetchMessages()
        setPendingFile(pf)
        toast.error('اتبعتت الرسالة النصية، لكن فشل إرسال الملف — جرب تبعته تاني')
      } else {
        setText(msgText)
        setPendingFile(pf)
        toast.error('فشل الإرسال')
      }
    } finally {
      setSending(false)
    }
  }

  const copyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content || '')
      toast.success('اتنسخت الرسالة')
    } catch {
      toast.error('فشل النسخ')
    }
  }

  const startReply = (msg) => {
    setReplyingTo(msg)
    setActionSheetMsg(null)
    textareaRef.current?.focus()
  }

  const sendNote = async () => {
    const noteContent = noteText.trim()
    if (!noteContent || sendingNote) return
    setSendingNote(true)
    try {
      const res = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, content: noteContent, agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الملاحظة')
      setNoteText('')
      setShowNoteBox(false)
      await fetchMessages(false)
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setSendingNote(false)
    }
  }

  const changeStatus = async (s) => {
    // "متابعة" محتاجة معاد ترجع فيه — بنفتح مودال بدل ما نغيّر الحالة على طول
    if (s === 'follow_up') {
      setShowStatus(false)
      openFollowUpModal()
      return
    }
    const oldLabel = currentStatus.label
    const oldStatus = conv?.status
    setConv(prev => ({ ...prev, status: s, follow_up_at: null }))
    setShowStatus(false)
    // لو خرجنا من "متابعة" لحالة تانية يدوي، لازم نلغي أي معاد كان متحدد قبل كده
    const { error } = await supabase.from('conversations').update({ status: s, follow_up_at: null }).eq('id', id)
    if (error) {
      setConv(prev => ({ ...prev, status: oldStatus }))
      toast.error('فشل تغيير حالة المحادثة، حاول تاني')
      return
    }
    const newLabel = STATUS_OPTS.find(o => o.key === s)?.label || s
    if (oldLabel !== newLabel) logActivity(id, agent?.id, `غيّر حالة المحادثة من "${oldLabel}" إلى "${newLabel}"`)
    // قفل المحادثة بيفضي مساحة عند الموظف، جرب توزّع أي محادثة مستنية
    if (s === 'closed') fetch(`${API_URL}/rebalance`, { method: 'POST' }).catch(() => {})
  }

  // بيحسب افتراضي معقول (بعد ساعة من دلوقتي) عشان يبقى فيه قيمة جاهزة في المودال بدل مربع فاضي
  const defaultFollowUpDateTime = () => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setSeconds(0, 0)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }

  const openFollowUpModal = () => {
    setFollowUpDateTime(defaultFollowUpDateTime())
    setFollowUpNote('')
    setShowFollowUpModal(true)
  }

  const confirmFollowUp = async () => {
    if (!followUpDateTime) { toast.error('حدد معاد الرجوع الأول'); return }
    const followUpAt = new Date(followUpDateTime)
    if (followUpAt.getTime() <= Date.now()) { toast.error('المعاد لازم يكون في المستقبل'); return }

    setSavingFollowUp(true)
    const oldLabel = currentStatus.label
    const { error } = await supabase.from('conversations')
      .update({ status: 'follow_up', follow_up_at: followUpAt.toISOString() })
      .eq('id', id)
    if (error) {
      setSavingFollowUp(false)
      toast.error('فشل حفظ المتابعة، حاول تاني')
      return
    }
    setConv(prev => ({ ...prev, status: 'follow_up', follow_up_at: followUpAt.toISOString() }))

    const readableTime = followUpAt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    if (oldLabel !== 'متابعة') logActivity(id, agent?.id, `غيّر حالة المحادثة من "${oldLabel}" إلى "متابعة" — هترجع الساعة ${readableTime}`)

    if (followUpNote.trim()) {
      try {
        const res = await fetch(`${API_URL}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: id, content: `🔔 متابعة (${readableTime}): ${followUpNote.trim()}`, agent_id: agent?.id })
        })
        if (!res.ok) throw new Error()
        await fetchMessages(false)
      } catch {
        toast.error('اتحفظت المتابعة بس فشل حفظ الملاحظة')
      }
    }

    setSavingFollowUp(false)
    setShowFollowUpModal(false)
    toast.success(`هترجع المحادثة تاني الساعة ${readableTime}`)
  }

  const changeLifecycle = async (stageId) => {
    const oldLabel = currentLifecycle?.name || 'بدون مرحلة'
    const oldStageId = contact?.lifecycle_stage_id
    setContact(prev => prev ? { ...prev, lifecycle_stage_id: stageId || null } : prev)
    setShowLifecycle(false)
    const { error } = await supabase.from('contacts').update({ lifecycle_stage_id: stageId || null }).eq('id', contact.id)
    if (error) {
      setContact(prev => prev ? { ...prev, lifecycle_stage_id: oldStageId } : prev)
      toast.error('فشل تغيير مرحلة الـ Lifecycle، حاول تاني')
      return
    }
    const newLabel = lifecycles.find(l => l.id === stageId)?.name || 'بدون مرحلة'
    if (oldLabel !== newLabel) logActivity(id, agent?.id, `غيّر مرحلة الـ Lifecycle من "${oldLabel}" إلى "${newLabel}"`)
  }

  const assignAgent = async (agentId) => {
    const { error } = await supabase.from('conversations').update({ assigned_agent_id: agentId }).eq('id', id)
    if (error) { toast.error('فشل تعيين المحادثة، حاول تاني'); return }
    await supabase.from('conversation_assignment_log').insert({
      conversation_id: id, assigned_to: agentId, assigned_by: agent?.id
    })
    const ag = agents.find(a => a.id === agentId)
    setConv(prev => ({ ...prev, agentName: ag?.name, agentAvatarUrl: ag?.avatar_url, assigned_agent_id: agentId }))
    setShowAssign(false)
    fetchMessages(false)
  }

  // استلام المحادثة من الـ AI Agent — بيوقف رد الـ AI التلقائي ويفتح مربع الكتابة للموظف البشري
  const takeOverFromAi = async () => {
    const { error } = await supabase.from('conversations').update({ ai_active: false }).eq('id', id)
    if (error) { toast.error('فشل استلام المحادثة، حاول تاني'); return }
    setConv(prev => ({ ...prev, ai_active: false }))
    if (!conv?.assigned_agent_id && agent?.id) {
      await supabase.from('conversations').update({ assigned_agent_id: agent.id }).eq('id', id)
      await supabase.from('conversation_assignment_log').insert({ conversation_id: id, assigned_to: agent.id, assigned_by: agent?.id })
      setConv(prev => ({ ...prev, assigned_agent_id: agent.id, agentName: agent.name, agentAvatarUrl: agent.avatar_url }))
    }
    toast.success('استلمت المحادثة من الـ AI Agent')
  }

  // عكس الـ takeover — يرجّع التحكم للـ AI تاني بعد ما موظف كان استلمها
  const assignToAi = async () => {
    const { error } = await supabase.from('conversations').update({ ai_active: true }).eq('id', id)
    if (error) { toast.error('فشل تحويل المحادثة للـ AI، حاول تاني'); return }
    setConv(prev => ({ ...prev, ai_active: true }))
    toast.success('اتحوّلت المحادثة للـ AI Agent')
  }

  // زرار "عصاية سحرية" — الـ AI بيقترح رد بناءً على المحادثة، والموظف يعدّله ويبعته أو يتجاهله
  const [suggesting, setSuggesting] = useState(false)
  const suggestReply = async () => {
    setSuggesting(true)
    try {
      const res = await fetch(`${API_URL}/ai/suggest-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل توليد اقتراح')
      onTextChange(data.suggestion || '')
      textareaRef.current?.focus()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setSuggesting(false)
    }
  }

  // ─── اختيار ملف من الجهاز (بريفيو قبل الإرسال) ─────────────────
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'file'
    setPendingFile({ file, url: null, previewUrl: URL.createObjectURL(file), type, name: file.name })
  }

  const removePendingFile = () => {
    if (pendingFile?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingFile.previewUrl)
    setPendingFile(null)
  }

  // ─── مكتبة الملفات (ملفات الردود السريعة بس — صور/فيديو/PDF، من غير الردود النصية) ─────────────
  const openLibrary = async () => {
    setShowAttachMenu(false)
    setShowLibraryModal(true)
    const { data } = await supabase
      .from('quick_replies')
      .select('*')
      .not('file_url', 'is', null)
      .in('file_type', ['image', 'video', 'file'])
      .order('name')
    setLibraryItems(data || [])
  }

  const pickFromLibrary = (item) => {
    setPendingFile({ file: null, url: item.file_url, previewUrl: item.file_url, type: item.file_type, name: item.name })
    setShowLibraryModal(false)
  }

  const filteredLibraryItems = useMemo(() => {
    const q = librarySearch.toLowerCase()
    return libraryItems.filter(i => !q || i.name.toLowerCase().includes(q))
  }, [libraryItems, librarySearch])

  // ─── تسجيل الرسائل الصوتية ─────────────────────────────
  // بنسجل WebM دايماً (الصيغة الأوثق دعماً من كل المتصفحات)، وتحويلها لصيغة
  // متوافقة مع إنستجرام (m4a) بيتم على السيرفر وقت الإرسال
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      toast.error('لازم تسمح بالوصول للميكروفون')
    }
  }

  // أوقف التسجيل تلقائي لو وصل للحد الأقصى، عشان موظف مايسبش التسجيل شغال بالغلط لفترة طويلة
  useEffect(() => {
    if (isRecording && recordSeconds >= MAX_RECORD_SECONDS) {
      stopRecording(true)
      toast.info('وصلت لأقصى مدة تسجيل (٣ دقايق)، اتوقف التسجيل تلقائياً')
    }
  }, [recordSeconds, isRecording])

  // لو الموظف قفل الشات أو انتقل لصفحة تانية وهو لسه بيسجل، اقفل الميكروفون فوراً (متسبوش الترخيص شغال في الخلفية)
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stream.getTracks().forEach(t => t.stop())
        recorder.stop()
      }
      clearInterval(recordTimerRef.current)
    }
  }, [])

  const stopRecording = (send) => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    clearInterval(recordTimerRef.current)
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
      if (!send) return
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
      setPendingFile({ file, url: null, previewUrl: URL.createObjectURL(blob), type: 'audio', name: 'رسالة صوتية' })
    }
    recorder.stop()
  }

  // ─── الردود السريعة (اكتب / في الرسالة) ─────────────────────
  const onTextChange = (v) => {
    setText(v)
    const slashIdx = v.lastIndexOf('/')
    if (slashIdx !== -1 && (slashIdx === 0 || /\s/.test(v[slashIdx - 1])) && !v.slice(slashIdx).includes(' ')) {
      setQuickReplyFilter(v.slice(slashIdx + 1))
      setShowQuickReplies(true)
    } else {
      setShowQuickReplies(false)
    }
    sendTyping(v.trim().length > 0)
  }

  // بيبعت إشارة "بيكتب" — داخليًا (لأي حد فاتح نفس المحادثة) وللعميل نفسه على المنصة (لو مدعومة).
  // متردّدة (throttled) عشان مانضربش الـ API/الـ Realtime مع كل حرف — إشارة "بدأ" كل ٥ ثواني بس
  // طول ما لسه بيكتب، وإشارة "خلص" واحدة بعد ٣ ثواني سكوت أو لما يبعت فعليًا
  const sendTyping = (isTyping) => {
    const ref = myTypingRef.current
    clearTimeout(ref.offTimeout)
    if (isTyping) {
      const now = Date.now()
      if (now - ref.lastSentAt > 5000) {
        ref.lastSentAt = now
        const label = agent?.name || 'موظف'
        typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { typing: true, label, agentId: agent?.id } })
        fetch(`${API_URL}/conversations/${id}/typing`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: true })
        }).catch(() => {})
      }
      ref.offTimeout = setTimeout(() => sendTyping(false), 3000)
    } else {
      ref.lastSentAt = 0
      const label = agent?.name || 'موظف'
      typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { typing: false, label, agentId: agent?.id } })
      fetch(`${API_URL}/conversations/${id}/typing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: false })
      }).catch(() => {})
    }
  }

  // بيحط الإيموجي مكان الكيرسور بالظبط بدل ما يضيفه في آخر النص دايماً
  const insertEmoji = (emoji) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const newText = text.slice(0, start) + emoji + text.slice(end)
    setText(newText)
    setShowEmojiPicker(false)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const pickQuickReply = (qr) => {
    const slashIdx = text.lastIndexOf('/')
    const before = slashIdx !== -1 ? text.slice(0, slashIdx) : text
    setText(before + (qr.text || ''))
    if (qr.file_url) {
      setPendingFile({ file: null, url: qr.file_url, previewUrl: qr.file_url, type: qr.file_type, name: qr.name })
    }
    setShowQuickReplies(false)
    textareaRef.current?.focus()
  }

  const filteredQuickReplies = useMemo(() => {
    const q = quickReplyFilter.toLowerCase()
    return quickReplies.filter(qr => qr.name.toLowerCase().includes(q)).slice(0, 8)
  }, [quickReplies, quickReplyFilter])

  // اسم الموظف اللي بعت كل رسالة outbound، عشان لو المحادثة اتنقلت بين موظفين نقدر نتراك مين قال إيه
  const agentsMap = useMemo(() => {
    const map = {}
    agents.forEach(a => { map[a.id] = a.name })
    return map
  }, [agents])

  const currentStatus = STATUS_OPTS.find(s => s.key === conv?.status) || STATUS_OPTS[0]
  const currentLifecycle = lifecycles.find(l => l.id === contact?.lifecycle_stage_id)
  const isWindowExpired = conv?.last_inbound_at
    ? (Date.now() - new Date(conv.last_inbound_at).getTime()) / 3600000 > MESSAGE_WINDOW_HOURS
    : false
  const PlatformIcon = conv?.platform === 'instagram' ? Instagram : conv?.platform === 'whatsapp' ? Phone : Facebook

  // خريطة id → رسالة، عشان نقدر نعرض معاينة سريعة للرسالة الأصلية لما رسالة تانية ترد عليها
  const messagesById = useMemo(() => {
    const map = {}
    messages.forEach(m => { map[m.id] = m })
    return map
  }, [messages])

  // ─── دمج الرسائل وسجل التعيين في تايم لاين واحد ─────────────
  const timeline = useMemo(() => {
    const msgItems = messages
      .filter(m => !searchQuery || (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
      .map(m => ({ ...m, _kind: 'message' }))
    const logItems = searchQuery ? [] : assignLogs.map(l => ({ ...l, _kind: 'assignment' }))
    const activityItems = searchQuery ? [] : activityLogs.map(l => ({ ...l, _kind: 'activity' }))
    return [...msgItems, ...logItems, ...activityItems].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [messages, assignLogs, activityLogs, searchQuery])

  const groupedMessages = timeline.reduce((groups, item) => {
    const date = formatDate(item.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(item)
    return groups
  }, {})

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 flex-shrink-0 flex flex-col gap-2 px-4 pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        {/* الصف الأول: رجوع + صورة/اسم العميل + بحث + Lifecycle */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-fg-muted hover:text-fg flex-shrink-0">
            <ArrowRight size={20} />
          </button>

          <div onClick={() => setShowSidebar(true)} className="flex items-center gap-2 flex-1 min-w-0 text-right cursor-pointer">
            {contact?.profile_pic ? (
              <img src={contact.profile_pic} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt=""
                onError={e => e.target.style.display = 'none'} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-fg-muted" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-fg truncate">{displayName(contact)}</p>
                {contact?.is_blocked && (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-danger text-white flex-shrink-0">
                    <Ban size={9} /> محظور
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <PlatformIcon size={11} className="text-fg-muted" />
                {!contact?.name && (
                  <span className="text-xs text-fg-muted truncate">اضغط لإضافة الاسم</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => { setShowSearch(v => !v); setSearchQuery('') }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showSearch ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
              <Search size={14} />
            </button>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowLifecycle(v => !v)}
                className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded-full text-white max-w-[90px]"
                style={{ background: currentLifecycle?.color || '#64748B' }}>
                <span className="truncate">{currentLifecycle ? `${currentLifecycle.icon ? currentLifecycle.icon + ' ' : ''}${currentLifecycle.name}` : 'بدون مرحلة'}</span> <ChevronDown size={9} className="flex-shrink-0" />
              </button>
              {showLifecycle && (
                <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden max-h-64 overflow-y-auto">
                  <button onClick={() => changeLifecycle(null)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-500" />
                    بدون مرحلة
                  </button>
                  {lifecycles.map(l => (
                    <button key={l.id} onClick={() => changeLifecycle(l.id)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                      {l.icon && `${l.icon} `}{l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* الصف الثاني: تعيين الموظف + حالة المحادثة */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button onClick={() => { setShowAssign(!showAssign); setShowStatus(false) }}
              className="px-2.5 py-1.5 text-xs bg-surface-3 rounded-lg text-fg-muted hover:text-fg max-w-[140px] truncate">
              {conv?.agentName || 'غير معين'}
            </button>
            {showAssign && (
              <div className="absolute right-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
                {agents.map(ag => (
                  <button key={ag.id} onClick={() => assignAgent(ag.id)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right">
                    <span className="relative flex-shrink-0">
                      <AgentAvatar agent={ag} size={18} />
                      <span className={`absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full border border-surface-2 ${ag.status === 'busy' ? 'bg-follow' : ag.is_online ? 'bg-success' : 'bg-slate-500'}`} />
                    </span>
                    {ag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!conv?.ai_active && (
            <button onClick={assignToAi} title="رجّع التحكم للـ AI Agent"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-brand/10 text-brand rounded-lg hover:bg-brand/20 flex-shrink-0">
              <Bot size={12} /> AI
            </button>
          )}

          <div className="relative">
            <button onClick={() => { setShowStatus(!showStatus); setShowAssign(false) }}
              title={conv?.status === 'follow_up' && conv?.follow_up_at ? `هترجع الساعة ${new Date(conv.follow_up_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white ${currentStatus.color}`}>
              {currentStatus.label}
              {conv?.status === 'follow_up' && conv?.follow_up_at && (
                <span className="opacity-90">⏰ {new Date(conv.follow_up_at).toLocaleString('ar-EG', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'numeric' })}</span>
              )}
              <ChevronDown size={11} />
            </button>
            {showStatus && (
              <div className="absolute right-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden">
                {STATUS_OPTS.map(s => (
                  <button key={s.key} onClick={() => changeStatus(s.key)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="flex-shrink-0 px-3 py-2 bg-surface-2 border-b border-surface-3">
          <div className="relative">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث في هذه المحادثة..."
              className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3"
        onClick={() => { setShowStatus(false); setShowAssign(false) }}>
        {hasMoreMessages && !searchQuery && (
          <div className="flex justify-center mb-3">
            <button onClick={loadOlderMessages} disabled={loadingOlder}
              className="text-xs text-brand font-medium px-3 py-1.5 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors disabled:opacity-50">
              {loadingOlder ? 'جاري التحميل...' : 'تحميل رسائل أقدم'}
            </button>
          </div>
        )}
        {!hasMoreMessages && !searchQuery && conv?.ad_referral && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%] sm:max-w-sm bg-surface-2 border border-surface-3 rounded-2xl overflow-hidden">
              <p className="text-[11px] text-fg-subtle px-3 pt-2 flex items-center gap-1">
                <Megaphone size={11} /> جاي من إعلان ممول
              </p>
              {conv.ad_referral.image_url && (
                <img src={conv.ad_referral.image_url} alt="" className="w-full max-h-48 object-cover" />
              )}
              <div className="p-3 space-y-1">
                {conv.ad_referral.headline && <p className="text-sm text-fg font-medium">{conv.ad_referral.headline}</p>}
                {conv.ad_referral.body && <p className="text-xs text-fg-muted">{conv.ad_referral.body}</p>}
                {conv.ad_referral.source_url && (
                  <a href={conv.ad_referral.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:underline block truncate">
                    {conv.ad_referral.source_url}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {Object.entries(groupedMessages).map(([date, items]) => (
          <div key={date}>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-surface-3" />
              <span className="text-xs text-fg-subtle px-2">{date}</span>
              <div className="flex-1 h-px bg-surface-3" />
            </div>
            <div className="space-y-1">
              {items.map((item, i) => item._kind === 'assignment' ? (
                <AssignmentEvent key={item.id} log={item} />
              ) : item._kind === 'activity' ? (
                <ActivityEvent key={item.id} log={item} agentsMap={agentsMap} />
              ) : (
                <MessageBubble key={item.id} msg={item} prev={items[i - 1]?._kind === 'message' ? items[i - 1] : null}
                  onMediaClick={setLightbox} agentsMap={agentsMap}
                  repliedMsg={item.reply_to_message_id ? messagesById[item.reply_to_message_id] : null}
                  canReply={conv?.platform === 'whatsapp' && !item._temp}
                  onLongPress={() => setActionSheetMsg(item)}
                  onSwipeReply={() => startReply(item)} />
              ))}
            </div>
          </div>
        ))}
        {timeline.length === 0 && searchQuery && (
          <p className="text-center text-fg-subtle text-sm mt-8">مفيش نتايج لـ "{searchQuery}"</p>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-3 bg-surface-2 border-t border-surface-3 relative">
        <div className="flex items-center gap-1.5 mb-2">
          <button onClick={() => setShowNoteBox(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${showNoteBox ? 'bg-follow text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <StickyNote size={13} /> ملاحظة داخلية
          </button>
          <button onClick={() => { setShowQuickReplies(v => !v); setQuickReplyFilter('') }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${showQuickReplies ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <MessageSquareText size={13} /> ردود سريعة
          </button>
        </div>
        {showNoteBox && (
          <div className="mb-2 bg-follow/10 border border-follow/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-follow mb-1.5">
              <StickyNote size={12} /> ملاحظة داخلية — مش هتتبعت للعميل، الموظفين بس هيشوفوها
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNote() } }}
                placeholder="اكتب ملاحظتك للموظفين هنا..."
                rows={2}
                autoFocus
                className="flex-1 bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-follow resize-none"
              />
              <button onClick={sendNote} disabled={!noteText.trim() || sendingNote}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-follow hover:brightness-110 text-white rounded-lg transition-colors disabled:opacity-40">
                {sendingNote
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send size={14} />
                }
              </button>
            </div>
          </div>
        )}
        {showEmojiPicker && <EmojiPicker onPick={insertEmoji} />}
        {showQuickReplies && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 max-h-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-surface-3 flex-shrink-0">
              <div className="relative">
                <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input autoFocus value={quickReplyFilter} onChange={e => setQuickReplyFilter(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setShowQuickReplies(false) }}
                  placeholder="دور على رد سريع..."
                  className="w-full bg-surface-3 rounded-lg py-1.5 px-3 pr-7 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>
            <div className="overflow-y-auto">
              {filteredQuickReplies.length > 0 ? filteredQuickReplies.map(qr => (
                <button key={qr.id} onClick={() => pickQuickReply(qr)}
                  className="flex flex-col items-start w-full px-3 py-2.5 hover:bg-surface-3 text-right border-b border-surface-3 last:border-0">
                  <span className="text-sm text-fg font-medium">/{qr.name}</span>
                  {qr.text && <span className="text-xs text-fg-muted truncate w-full">{qr.text}</span>}
                </button>
              )) : (
                <p className="text-xs text-fg-subtle text-center py-4">مفيش ردود سريعة مطابقة</p>
              )}
            </div>
            {agent?.role !== 'admin' && (
              <button onClick={() => { setShowQuickReplies(false); setShowRequestModal(true) }}
                className="flex items-center gap-1.5 justify-center w-full px-3 py-2 text-xs text-brand hover:bg-surface-3 border-t border-surface-3 flex-shrink-0">
                <Send size={11} /> اطلب رد سريع جديد من الأدمن
              </button>
            )}
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center gap-2">
            <button onClick={() => stopRecording(false)}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-danger hover:bg-surface-3 rounded-xl transition-colors">
              <Trash2 size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg">
              <span className="w-2 h-2 rounded-full bg-danger pulse-dot" />
              جاري التسجيل... {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
            </div>
            <button onClick={() => stopRecording(true)}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors">
              <Send size={16} />
            </button>
          </div>
        ) : !channelActive ? (
          <div className="flex items-center gap-2.5 bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger">
            <Ban size={18} className="flex-shrink-0" />
            <span>قناة {PLATFORM_LABEL[conv?.platform] || conv?.platform} اتفصلت من التطبيق — لازم تتربط تاني من الإعدادات → القنوات عشان تقدر ترد.</span>
          </div>
        ) : contact?.is_blocked ? (
          <div className="flex items-center gap-2.5 bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger">
            <Ban size={18} className="flex-shrink-0" />
            <span>العميل ده محظور — مينفعش تبعتله رسايل. تقدر تلغي الحظر من بيانات العميل.</span>
          </div>
        ) : conv?.ai_active ? (
          <div className="flex items-center gap-2.5 bg-brand/10 rounded-xl px-4 py-3 text-sm text-fg">
            <Bot size={18} className="flex-shrink-0 text-brand" />
            <span className="flex-1">الـ AI Agent بيرد على المحادثة دي دلوقتي.</span>
            <button onClick={takeOverFromAi}
              className="flex-shrink-0 px-3 py-1.5 bg-brand rounded-lg text-xs text-white font-medium hover:brightness-110">
              استلم المحادثة
            </button>
          </div>
        ) : isWindowExpired ? (
          <div className="flex items-center gap-2.5 bg-surface-3 rounded-xl px-4 py-3 text-sm text-fg-muted">
            <Clock size={18} className="flex-shrink-0 text-follow" />
            <span>{WINDOW_EXPIRED_TEXT[conv?.platform] || WINDOW_EXPIRED_TEXT.facebook}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {replyingTo && (
              <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2 border-r-2 border-brand">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-brand-light">
                    {replyingTo.direction === 'outbound' ? 'أنت' : displayName(contact)}
                  </p>
                  <p className="text-xs text-fg-muted truncate">
                    {replyingTo.content_type === 'text' ? replyingTo.content : `📎 ${replyingTo.content || 'ملف'}`}
                  </p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-fg-muted hover:text-danger flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
            )}
            {pendingFile && (
              <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2">
                {pendingFile.type === 'image' ? (
                  <img src={pendingFile.previewUrl} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 text-lg">
                    {pendingFile.type === 'video' ? '🎥' : pendingFile.type === 'audio' ? '🎵' : '📎'}
                  </div>
                )}
                <span className="flex-1 text-xs text-fg-muted truncate">{pendingFile.name}</span>
                <button onClick={removePendingFile} className="text-fg-muted hover:text-danger flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
            )}
            {/* العميل ده كلّم من أكتر من رقم واتساب — اختار ترد من أنهي رقم منهم (لسه في نافذة الـ٢٤ ساعة) */}
            {conv?.platform === 'whatsapp' && connectedChannels.filter(c => Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000).length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                <span className="text-[11px] text-fg-subtle flex-shrink-0">رد من:</span>
                {connectedChannels
                  .filter(c => Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000)
                  .map(c => (
                    <button key={c.channel_id} onClick={() => setSelectedChannelId(c.channel_id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${selectedChannelId === c.channel_id ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                      {c.channels?.custom_name || c.channels?.display_name || 'رقم'}
                    </button>
                  ))}
              </div>
            )}
            {Object.keys(typingUsers).length > 0 && (
              <p className="text-[11px] text-brand px-1 animate-pulse">
                {Object.keys(typingUsers).join('، ')} {Object.keys(typingUsers).length > 1 ? 'بيكتبوا الآن...' : 'بيكتب الآن...'}
              </p>
            )}
            <div className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx" />
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowAttachMenu(v => !v)}
                  className="w-10 h-10 flex items-center justify-center text-fg-muted hover:text-fg rounded-xl hover:bg-surface-3 transition-colors">
                  <Paperclip size={18} />
                </button>
                {showAttachMenu && (
                  <div className="absolute bottom-full right-0 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
                    <button onClick={openLibrary}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                      <FolderOpen size={14} className="text-fg-muted" /> من المكتبة
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click() }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                      <Paperclip size={14} className="text-fg-muted" /> من الجهاز
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setShowEmojiPicker(v => !v)}
                className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-colors ${showEmojiPicker ? 'bg-brand text-white' : 'text-fg-muted hover:text-fg hover:bg-surface-3'}`}>
                <Smile size={18} />
              </button>
              <button onClick={suggestReply} disabled={suggesting} title="اقترح رد بالـ AI"
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-fg-muted hover:text-brand hover:bg-surface-3 transition-colors disabled:opacity-40">
                {suggesting ? <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <Wand2 size={18} />}
              </button>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => onTextChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setShowQuickReplies(false) }}
                onFocus={() => {
                  // بنكرر السكرول بعد شوية كمان، عشان أنيميشن فتح الكيبورد بياخد وقت أطول من الـ٣٠ مللي
                  // ثانية العادية، فلو سكرولنا مرة واحدة بس هيبقى قبل ما الكيبورد يخلص يفتح فعلياً
                  scrollToBottom()
                  setTimeout(scrollToBottom, 350)
                }}
                placeholder="اكتب رسالة... (اكتب / للردود السريعة)"
                rows={1}
                className="flex-1 bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none overflow-y-auto min-h-[42px]"
                style={{ maxHeight: '104px' }}
              />
              {text.trim() || pendingFile ? (
                <button onClick={sendMessage} disabled={sending}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors disabled:opacity-40">
                  {sending
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={16} />
                  }
                </button>
              ) : (
                <button onClick={startRecording}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-fg-muted hover:text-fg rounded-xl hover:bg-surface-3 transition-colors">
                  <Mic size={18} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showSidebar && (
        <ContactSidebar contact={contact} conv={conv} channelLabel={channelLabel}
          onClose={() => setShowSidebar(false)} onUpdate={setContact}
          onDeleted={() => navigate('/')} />
      )}

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}

      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowLibraryModal(false)}>
          <div className="w-full max-w-md h-[70vh] bg-surface-2 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-brand" />
                <span className="font-semibold text-fg text-sm">مكتبة الملفات</span>
              </div>
              <button onClick={() => setShowLibraryModal(false)} className="text-fg-muted hover:text-fg"><X size={18} /></button>
            </div>
            <div className="p-3 border-b border-surface-3 flex-shrink-0">
              <div className="relative">
                <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input autoFocus value={librarySearch} onChange={e => setLibrarySearch(e.target.value)}
                  placeholder="دور على ملف..."
                  className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2 content-start">
              {filteredLibraryItems.map(item => (
                <button key={item.id} onClick={() => pickFromLibrary(item)}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-surface-3 transition-colors">
                  {item.file_type === 'image' ? (
                    <img src={item.file_url} className="w-full aspect-square rounded-lg object-cover bg-surface-3" alt="" />
                  ) : (
                    <div className="w-full aspect-square rounded-lg bg-surface-3 flex items-center justify-center text-2xl">
                      {item.file_type === 'video' ? '🎥' : '📎'}
                    </div>
                  )}
                  <span className="text-xs text-fg-muted truncate w-full text-center">{item.name}</span>
                </button>
              ))}
              {filteredLibraryItems.length === 0 && (
                <p className="col-span-3 text-center text-fg-subtle text-sm py-8">
                  مفيش ملفات في المكتبة — ضيف ملفات من الإعدادات → الردود السريعة
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showRequestModal && (
        <RequestAdminModal type="quick_reply" onClose={() => setShowRequestModal(false)} />
      )}

      {actionSheetMsg && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setActionSheetMsg(null)}>
          <div className="w-full sm:max-w-xs bg-surface-2 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { copyMessage(actionSheetMsg); setActionSheetMsg(null) }}
              className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-surface-3 text-sm text-fg text-right">
              <Copy size={16} className="text-fg-muted" /> نسخ
            </button>
            {conv?.platform === 'whatsapp' && (
              <button onClick={() => startReply(actionSheetMsg)}
                className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-surface-3 text-sm text-fg text-right border-t border-surface-3">
                <Reply size={16} className="text-fg-muted" /> رد
              </button>
            )}
            <button onClick={() => setActionSheetMsg(null)}
              className="flex items-center justify-center w-full px-4 py-3.5 text-sm text-fg-muted border-t border-surface-3">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !savingFollowUp && setShowFollowUpModal(false)}>
          <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-surface-3">
              <Clock size={16} className="text-follow" />
              <span className="font-semibold text-fg text-sm">تحديد معاد المتابعة</span>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <label className="block text-xs text-fg-muted mb-1">هترجع المحادثة تفتح تاني في</label>
                <input type="datetime-local" value={followUpDateTime} onChange={e => setFollowUpDateTime(e.target.value)}
                  min={defaultFollowUpDateTime()}
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs text-fg-muted mb-1">ملاحظة (اختياري) — تفكرك ليه حطيت المتابعة</label>
                <textarea value={followUpNote} onChange={e => setFollowUpNote(e.target.value)}
                  placeholder="مثال: العميل هيدفع بكرة بليل، تابع معاه..."
                  rows={3}
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setShowFollowUpModal(false)} disabled={savingFollowUp}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={confirmFollowUp} disabled={savingFollowUp}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-follow text-white hover:brightness-110 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingFollowUp ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'تأكيد المتابعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignmentEvent({ log }) {
  const toName = log.assigned_to_agent?.name || 'غير معين'
  const byName = log.assigned_by_agent?.name
  return (
    <div className="flex justify-center my-2">
      <span className="flex items-center gap-1.5 text-xs text-fg-muted bg-surface-2 px-3 py-1.5 rounded-full">
        <UserCog size={11} />
        {byName
          ? <>تم تعيين المحادثة لـ <b className="text-fg">{toName}</b> بواسطة <b className="text-fg">{byName}</b></>
          : <>تم توزيع المحادثة تلقائياً لـ <b className="text-fg">{toName}</b></>}
        <span className="text-fg-subtle">· {formatTime(log.created_at)}</span>
      </span>
    </div>
  )
}

function ActivityEvent({ log, agentsMap }) {
  const agentName = agentsMap?.[log.agent_id] || 'موظف'
  return (
    <div className="flex justify-center my-2">
      <span className="flex items-center gap-1.5 text-xs text-fg-muted bg-surface-2 px-3 py-1.5 rounded-full text-center">
        <b className="text-fg">{agentName}</b> {log.description}
        <span className="text-fg-subtle">· {formatTime(log.created_at)}</span>
      </span>
    </div>
  )
}

// المسافة اللي لازم تتسحب لحد ما نعتبرها "سحب لتفعيل الرد" فعلي، مش مجرد لمسة عرضية
const SWIPE_REPLY_THRESHOLD = 56

function MessageBubble({ msg, prev, onMediaClick, agentsMap, repliedMsg, canReply, onLongPress, onSwipeReply }) {
  const [dragX, setDragX] = useState(0)
  const dragInfo = useRef({ startX: 0, startY: 0, dragging: false, longPressTimer: null, longPressFired: false })

  const clearLongPress = () => {
    if (dragInfo.current.longPressTimer) clearTimeout(dragInfo.current.longPressTimer)
    dragInfo.current.longPressTimer = null
  }

  const handlePointerDown = (e) => {
    if (msg.content_type === 'note') return
    const point = e.touches ? e.touches[0] : e
    dragInfo.current.startX = point.clientX
    dragInfo.current.startY = point.clientY
    dragInfo.current.dragging = false
    dragInfo.current.longPressFired = false
    clearLongPress()
    dragInfo.current.longPressTimer = setTimeout(() => {
      dragInfo.current.longPressFired = true
      setDragX(0)
      onLongPress?.()
    }, 450)
  }

  const handlePointerMove = (e) => {
    if (!dragInfo.current.longPressTimer && !dragInfo.current.dragging) return
    const point = e.touches ? e.touches[0] : e
    const dx = point.clientX - dragInfo.current.startX
    const dy = point.clientY - dragInfo.current.startY

    if (!dragInfo.current.dragging) {
      // حركة عمودية أوضح من الأفقي = سكرول عادي، سيبها تمشي عادي وألغي أي حاجة تانية
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        clearLongPress()
        return
      }
      if (Math.abs(dx) > 8) {
        dragInfo.current.dragging = true
        clearLongPress()
      }
    }

    if (dragInfo.current.dragging && canReply) {
      setDragX(Math.max(0, Math.min(dx, SWIPE_REPLY_THRESHOLD + 20)))
    }
  }

  const handlePointerUp = () => {
    clearLongPress()
    if (dragInfo.current.dragging && canReply && dragX >= SWIPE_REPLY_THRESHOLD) {
      onSwipeReply?.()
    }
    dragInfo.current.dragging = false
    setDragX(0)
  }

  // ملاحظة داخلية — بتتحط جوه المحادثة زي أي رسالة بالترتيب الزمني بالظبط، بس بشكل مميز
  // (لون مختلف، من غير محاذاة يمين/شمال) عشان الموظفين يفرقوها فورًا من رسالة حقيقية للعميل
  if (msg.content_type === 'note') {
    const authorName = agentsMap?.[msg.sent_by_agent_id] || 'موظف'
    return (
      <div className="flex justify-center mb-2 px-2">
        <div className="max-w-[90%] w-full bg-follow/15 border border-follow/30 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-follow mb-1">
            <StickyNote size={11} /> {authorName} · ملاحظة داخلية
            <span className="text-fg-subtle font-normal mr-auto">{formatTime(msg.created_at)}</span>
          </div>
          <p className="text-sm text-fg whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
      </div>
    )
  }

  const isOut = msg.direction === 'outbound'
  const isTemp = msg._temp
  const showTime = !prev ||
    Math.abs(new Date(msg.created_at) - new Date(prev.created_at)) > 300000

  // اسم الموظف اللي بعت الرسالة دي — بيظهر لما يتغيّر عن اللي قبله عشان نتراك لو المحادثة اتنقلت بين موظفين
  const senderName = isOut ? agentsMap?.[msg.sent_by_agent_id] : null
  const showSender = senderName && (!prev || prev.sent_by_agent_id !== msg.sent_by_agent_id)

  return (
    <div className={`flex flex-col mb-1 ${isOut ? 'items-end' : 'items-start'}`}>
      {showTime && !isTemp && (
        <span className="text-xs text-fg-subtle mb-1 px-1">{formatTime(msg.created_at)}</span>
      )}
      {showSender && !isTemp && (
        <span className="flex items-center gap-1 text-[11px] text-brand-light mb-0.5 px-1">
          <User size={10} /> {senderName}
        </span>
      )}
      <div className="relative max-w-[78%]"
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, transition: dragX ? 'none' : 'transform 0.15s' }}
        onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
        onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
        onContextMenu={e => { e.preventDefault(); onLongPress?.() }}>
        {dragX > 0 && (
          <div className="absolute top-1/2 -translate-y-1/2 text-brand" style={{ right: '100%', marginRight: 6 }}>
            <Reply size={16} className={dragX >= SWIPE_REPLY_THRESHOLD ? 'opacity-100' : 'opacity-40'} />
          </div>
        )}
        <div className={`px-3.5 py-2.5 text-sm transition-opacity select-none
          ${isOut ? 'msg-out text-white' : 'msg-in text-fg'}
          ${isTemp ? 'opacity-50' : 'opacity-100 slide-in'}`}>
          {repliedMsg && (
            <div className={`mb-1.5 pr-2 border-r-2 rounded-sm ${isOut ? 'border-white/50' : 'border-brand'} bg-black/10`}>
              <p className={`text-xs font-medium ${isOut ? 'text-white/90' : 'text-brand-light'} truncate px-1.5 pt-1`}>
                {repliedMsg.direction === 'outbound' ? 'أنت' : 'العميل'}
              </p>
              <p className={`text-xs truncate px-1.5 pb-1 ${isOut ? 'text-white/70' : 'text-fg-muted'}`}>
                {repliedMsg.content_type === 'text' ? repliedMsg.content : `📎 ${repliedMsg.content || 'ملف'}`}
              </p>
            </div>
          )}
          {msg.content_type === 'image' && msg.media_url ? (
            <img src={msg.media_url} alt="" onClick={() => onMediaClick({ type: 'image', url: msg.media_url })}
              className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer" />
          ) : msg.content_type === 'sticker' && msg.media_url ? (
            <img src={msg.media_url} alt="" onClick={() => onMediaClick({ type: 'image', url: msg.media_url })}
              className="max-w-[100px] max-h-[100px] object-contain cursor-pointer" />
          ) : msg.content_type === 'video' && msg.media_url ? (
            <video src={msg.media_url} controls onClick={e => { e.preventDefault(); onMediaClick({ type: 'video', url: msg.media_url }) }}
              className="rounded-lg max-w-full max-h-48 cursor-pointer" />
          ) : msg.content_type === 'audio' && msg.media_url ? (
            <audio src={msg.media_url} controls className="max-w-full" style={{ height: 36 }} />
          ) : msg.content_type === 'file' && msg.media_url ? (
            <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-light underline">
              📎 {msg.content}
            </a>
          ) : (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          )}
        </div>
        {msg.reaction_emoji && (
          <span className={`absolute -bottom-2.5 bg-surface-2 border border-surface-3 rounded-full px-1 text-xs shadow ${isOut ? 'left-1' : 'right-1'}`}>
            {msg.reaction_emoji}
          </span>
        )}
      </div>
      {isOut && (
        <span className={`text-xs mt-0.5 px-1 ${msg.status === 'read' ? 'text-brand' : 'text-fg-subtle'}`}>
          {isTemp ? <span className="animate-pulse">...</span>
            : msg.status === 'delivered' || msg.status === 'read' ? <CheckCheck size={12} className="inline" />
            : <Check size={12} className="inline" />}
        </span>
      )}
    </div>
  )
}

function Lightbox({ item, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors">
        <X size={20} />
      </button>
      {item.type === 'image' ? (
        <img src={item.url} alt="" className="max-w-[95vw] max-h-[90vh] object-contain" onClick={e => e.stopPropagation()} />
      ) : (
        <video src={item.url} controls autoPlay className="max-w-[95vw] max-h-[90vh]" onClick={e => e.stopPropagation()} />
      )}
    </div>
  )
}
