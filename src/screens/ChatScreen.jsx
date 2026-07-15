import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import ContactSidebar from '../components/ContactSidebar'
import { logActivity } from '../lib/activityLog'
import {
  ArrowRight, Send, Paperclip, ChevronDown, Search, X,
  User, CheckCheck, Facebook, Instagram, Phone, Mic, Trash2, UserCog, Clock, Ban
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
  const [messages, setMessages] = useState([])
  const [assignLogs, setAssignLogs] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [agents, setAgents] = useState([])
  const [showAssign, setShowAssign] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [pendingFile, setPendingFile] = useState(null) // { file, url, previewUrl, type, name }
  const [lightbox, setLightbox] = useState(null) // { type: 'image'|'video', url }

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
        supabase.from('conversation_reads')
          .upsert({ conversation_id: id, agent_id: agent.id, read_at: new Date().toISOString() })
      }

      // Agents list (لأي agent يقدر يعيّن/يستلم محادثات)
      const { data: ags } = await supabase.from('agents').select('id, name, is_online, status, avatar_url').order('name')
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
        const ch = data.channels?.find(c => c.platform === conv.platform)
        setChannelActive(ch?.status === 'active')
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
    const path = `media/${id}/${Date.now()}_${pf.file.name}`
    const { error } = await supabase.storage.from('inbox-media').upload(path, pf.file)
    if (error) throw error
    const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
    return urlData.publicUrl
  }

  const sendOne = async (content, content_type, media_url) => {
    const res = await fetch(`${API_URL}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: id, content, content_type, media_url, agent_id: agent?.id })
    })
    if (!res.ok) throw new Error()
  }

  const sendMessage = async () => {
    const msgText = text.trim()
    const pf = pendingFile
    if (!msgText && !pf) return
    if (sending) return
    setSending(true)
    setText('')
    setPendingFile(null)

    const tempId = `temp-${Date.now()}`
    tempIdRef.current = tempId
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: id,
      direction: 'outbound',
      content: msgText || pf?.name,
      content_type: pf ? pf.type : 'text',
      media_url: pf?.previewUrl,
      created_at: new Date().toISOString(),
      _temp: true,
    }])
    scrollToBottom()

    let textSent = false
    try {
      // النص والملف مع بعض بيتبعتوا كرسالتين متتاليتين (فيسبوك مايدعمش caption مع الملف)
      if (msgText) { await sendOne(msgText, 'text', null); textSent = true }
      if (pf) {
        const url = await uploadPendingFile(pf)
        await sendOne(pf.name || 'ملف', pf.type, url)
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

  const changeStatus = async (s) => {
    const oldLabel = currentStatus.label
    const oldStatus = conv?.status
    setConv(prev => ({ ...prev, status: s }))
    setShowStatus(false)
    const { error } = await supabase.from('conversations').update({ status: s }).eq('id', id)
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
      <div className="sticky top-0 z-20 flex-shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 bg-surface-2 border-b border-surface-3">
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
              <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowLifecycle(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: currentLifecycle?.color || '#64748B' }}>
                  {currentLifecycle?.name || 'بدون مرحلة'} <ChevronDown size={9} />
                </button>
                {showLifecycle && (
                  <div className="absolute right-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden max-h-64 overflow-y-auto">
                    <button onClick={() => changeLifecycle(null)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-500" />
                      بدون مرحلة
                    </button>
                    {lifecycles.map(l => (
                      <button key={l.id} onClick={() => changeLifecycle(l.id)}
                        className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <PlatformIcon size={11} className="text-fg-muted" />
              {conv?.agentName && (
                <AgentAvatar agent={{ name: conv.agentName, avatar_url: conv.agentAvatarUrl }} size={14} />
              )}
              <span className="text-xs text-fg-muted truncate">
                {conv?.agentName || 'غير معين'}
                {!contact?.name && ' · اضغط لإضافة الاسم'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => { setShowSearch(v => !v); setSearchQuery('') }}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showSearch ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <Search size={14} />
          </button>

          <div className="relative">
            <button onClick={() => { setShowAssign(!showAssign); setShowStatus(false) }}
              className="px-2.5 py-1.5 text-xs bg-surface-3 rounded-lg text-fg-muted hover:text-fg">
              تعيين
            </button>
            {showAssign && (
              <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
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

          <div className="relative">
            <button onClick={() => { setShowStatus(!showStatus); setShowAssign(false) }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white ${currentStatus.color}`}>
              {currentStatus.label} <ChevronDown size={11} />
            </button>
            {showStatus && (
              <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden">
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
                <MessageBubble key={item.id} msg={item} prev={items[i - 1]?._kind === 'message' ? items[i - 1] : null} onMediaClick={setLightbox} agentsMap={agentsMap} />
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
        {showQuickReplies && filteredQuickReplies.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
            {filteredQuickReplies.map(qr => (
              <button key={qr.id} onClick={() => pickQuickReply(qr)}
                className="flex flex-col items-start w-full px-3 py-2.5 hover:bg-surface-3 text-right border-b border-surface-3 last:border-0">
                <span className="text-sm text-fg font-medium">/{qr.name}</span>
                {qr.text && <span className="text-xs text-fg-muted truncate w-full">{qr.text}</span>}
              </button>
            ))}
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
        ) : isWindowExpired ? (
          <div className="flex items-center gap-2.5 bg-surface-3 rounded-xl px-4 py-3 text-sm text-fg-muted">
            <Clock size={18} className="flex-shrink-0 text-follow" />
            <span>{WINDOW_EXPIRED_TEXT[conv?.platform] || WINDOW_EXPIRED_TEXT.facebook}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
            <div className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx" />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-fg-muted hover:text-fg rounded-xl hover:bg-surface-3 transition-colors">
                <Paperclip size={18} />
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
        <ContactSidebar contact={contact} conv={conv}
          onClose={() => setShowSidebar(false)} onUpdate={setContact}
          onDeleted={() => navigate('/')} />
      )}

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
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

function MessageBubble({ msg, prev, onMediaClick, agentsMap }) {
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
      <div className={`max-w-[78%] px-3.5 py-2.5 text-sm transition-opacity
        ${isOut ? 'msg-out text-white' : 'msg-in text-fg'}
        ${isTemp ? 'opacity-50' : 'opacity-100 slide-in'}`}>
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
      {isOut && (
        <span className="text-xs text-fg-subtle mt-0.5 px-1">
          {isTemp ? <span className="animate-pulse">...</span> : <CheckCheck size={12} className="inline" />}
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
