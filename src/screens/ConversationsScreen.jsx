import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { Settings, Search, MessageSquare, Facebook, Instagram, Phone, LogOut, ChevronDown, ChevronsRight, ChevronsLeft, Users, User, Sun, Moon, CircleDot, Menu, X, Download, Share, BarChart3, CheckSquare, Square, Send, UserX, StickyNote, Bot } from 'lucide-react'
import NotificationBell from '../components/NotificationBell'
import PushNotificationToggle from '../components/PushNotificationToggle'

const STATUS_LABELS = { open: 'مفتوحة', follow_up: 'متابعة', closed: 'مغلقة' }

const AGENT_STATUS_OPTS = [
  { key: 'online', label: 'نشط', dot: 'bg-success' },
  { key: 'busy', label: 'مشغول', dot: 'bg-follow' },
  { key: 'offline', label: 'غير متصل', dot: 'bg-slate-500' },
]

const STATUS_TABS = [
  { key: 'all', label: 'الكل', active: 'text-brand border-b-2 border-brand', dot: 'bg-brand' },
  { key: 'open', label: 'مفتوحة', active: 'text-success border-b-2 border-success', dot: 'bg-success' },
  { key: 'follow_up', label: 'متابعة', active: 'text-follow border-b-2 border-follow', dot: 'bg-follow' },
  { key: 'closed', label: 'مغلقة', active: 'text-fg-muted border-b-2 border-fg-muted', dot: 'bg-slate-500' },
]

const CHANNELS = [
  { key: 'all', label: 'الكل' },
  { key: 'facebook', label: 'فيسبوك', icon: <Facebook size={12} className="text-blue-400" /> },
  { key: 'instagram', label: 'إنستجرام', icon: <Instagram size={12} className="text-pink-400" /> },
  { key: 'whatsapp', label: 'واتساب', icon: <Phone size={12} className="text-green-400" /> },
]

const PLATFORM_ICONS = {
  facebook: <Facebook size={12} className="text-blue-400" />,
  instagram: <Instagram size={12} className="text-pink-400" />,
  whatsapp: <Phone size={12} className="text-green-400" />,
}

// لو فيه أكتر من قناة لنفس المنصة (أرقام واتساب متعددة، أو أكتر من صفحة فيسبوك...) مفتاح الفلتر
// بيبقى "platform:<channel_id>" بدل اسم المنصة بس، عشان نقدر نفلتر بمحادثات قناة بعينها
function parseChannelFilter(channel) {
  if (channel === 'all') return null
  const sep = channel.indexOf(':')
  if (sep === -1) return { platform: channel, channelId: null }
  return { platform: channel.slice(0, sep), channelId: channel.slice(sep + 1) }
}

// الاسم اللي بيظهر للقناة في أي حتة في التطبيق: الاسم المختصر لو المستخدم حطه، وإلا لكل واتساب
// بنعرض اسم الـ WABA + آخر رقمين من الـ ID عشان نقدر نفرّق بين أرقام كتير بنفس الاسم، ولباقي
// المنصات بنرجع لاسم الحساب من ميتا نفسه
function getChannelLabel(ch) {
  if (!ch) return null
  if (ch.custom_name) return ch.custom_name
  if (ch.platform === 'whatsapp') {
    const last2 = String(ch.external_id || '').slice(-2)
    return `${ch.display_name || 'واتساب'} #${last2}`
  }
  return ch.display_name || null
}

const SEARCH_TYPES = [
  { key: 'contact', label: 'عميل', icon: <User size={11} /> },
  { key: 'message', label: 'رسالة', icon: <MessageSquare size={11} /> },
  { key: 'comment', label: 'تعليق', icon: <StickyNote size={11} /> },
]

function SearchTypeChips({ searchType, setSearchType }) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {SEARCH_TYPES.map(t => (
        <button key={t.key} onClick={() => setSearchType(t.key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${searchType === t.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  )
}

function AgentAvatar({ agent, size = 22 }) {
  const [broken, setBroken] = useState(false)
  const name = agent?.name || agent?.full_name || ''
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

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `${mins}د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}س`
  return `${Math.floor(hours / 24)}ي`
}

// اسم مؤقت مميّز لحد ما يتسجل اسم حقيقي (فيسبوك بيمنع جلب الاسم/الصورة لأغلب الحسابات)
function displayName(contact) {
  if (contact?.name) return contact.name
  if (contact?.platform_id) return `زائر ${contact.platform_id.slice(-4)}`
  return 'مجهول'
}

// كروم بيطلق حدث beforeinstallprompt مرة واحدة بس لكل تحميل صفحة، مش في كل مرة. المشكلة إن شاشة
// المحادثات دي بتتشال من الـ DOM وتتبني من الأول كل مرة نروح لشات ونرجع (React Router بيعمل unmount/mount)،
// فلو الحدث اتخزن جوه state الكومبوننت كان بيضيع أول ما نرجع للشاشة، وزرار التثبيت يختفي فجأة من غير رجعة.
// الحل: نخزّن الحدث في متغيّر برّه الكومبوننت (module scope) عشان يفضل موجود مهما الكومبوننت اتشال ورجع.
let capturedInstallPrompt = null
const installPromptListeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    capturedInstallPrompt = e
    installPromptListeners.forEach(fn => fn(e))
  })
  window.addEventListener('appinstalled', () => {
    capturedInstallPrompt = null
    installPromptListeners.forEach(fn => fn(null))
  })
}

// آيفون/سفاري مفيهوش الحدث ده أصلاً، فبنكتشف iOS ونوريله تعليمات "إضافة إلى الشاشة الرئيسية" يدوي.
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(capturedInstallPrompt)
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  )
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    const onChange = (e) => {
      setDeferredPrompt(e)
      if (!e) setInstalled(true)
    }
    installPromptListeners.add(onChange)
    return () => installPromptListeners.delete(onChange)
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    capturedInstallPrompt = null
    setDeferredPrompt(null)
  }

  return { canInstall: !installed && (!!deferredPrompt || isIOS), isIOS, promptInstall }
}

// شاشة المحادثات دي بتتشال من الـ DOM وتتبني من الأول كل مرة نروح لشات ونرجع (React Router بيعمل unmount/mount)،
// فبنحتفظ بآخر نتيجة في متغيّر برّه الكومبوننت (بيفضل عايش طول ما التطبيق مفتوح) عشان الرجوع للخلف يبقى فوري
// من غير سبينر أو إعادة تحميل كاملة — وبرضو بيحتفظ بالفلاتر اللي كانت مختارة قبل ما تدخل الشات.
const CONVERSATIONS_PAGE_SIZE = 50

const screenCache = {
  status: 'open', channel: 'all', search: '', searchType: 'contact', viewMode: 'all', agentFilter: '',
  selectedLifecycle: null, unrepliedOnly: false, sidebarOpen: true,
  conversations: null, agentsMap: {}, lastMessages: {}, contactTagsMap: {},
  statusCounts: { all: 0, open: 0, openUnread: 0, follow_up: 0, closed: 0 },
  lifecycleCounts: {}, lifecycles: [], agentsList: [], visibleLimit: CONVERSATIONS_PAGE_SIZE,
  agentOpenCounts: {}, unassignedOpenCount: 0, allChannels: [],
  aiEnabled: false, aiOpenCount: 0,
}

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState(screenCache.conversations || [])
  const [agentsMap, setAgentsMap] = useState(screenCache.agentsMap)
  const [lastMessages, setLastMessages] = useState(screenCache.lastMessages) // { conv_id: content }
  const [status, setStatus] = useState(screenCache.status)
  const [channel, setChannel] = useState(screenCache.channel)
  const [search, setSearch] = useState(screenCache.search)
  const [searchType, setSearchType] = useState(screenCache.searchType || 'contact') // 'contact' | 'message' | 'comment'
  const [loading, setLoading] = useState(screenCache.conversations === null)
  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [viewMode, setViewMode] = useState(screenCache.viewMode) // 'all' | 'mine'
  const [agentsList, setAgentsList] = useState(screenCache.agentsList)
  const [agentFilter, setAgentFilter] = useState(screenCache.agentFilter) // '' = بدون فلتر بموظف معين
  const [showAgentFilter, setShowAgentFilter] = useState(false)
  const [statusCounts, setStatusCounts] = useState(screenCache.statusCounts)
  const [sidebarOpen, setSidebarOpen] = useState(screenCache.sidebarOpen)
  const [unrepliedOnly, setUnrepliedOnly] = useState(screenCache.unrepliedOnly)
  const [contactTagsMap, setContactTagsMap] = useState(screenCache.contactTagsMap) // { contact_id: [tag,...] }
  const [lifecycles, setLifecycles] = useState(screenCache.lifecycles)
  const [lifecycleCounts, setLifecycleCounts] = useState(screenCache.lifecycleCounts) // { stage_id: عدد المحادثات المفتوحة }
  const [agentOpenCounts, setAgentOpenCounts] = useState(screenCache.agentOpenCounts) // { agent_id: عدد المحادثات المفتوحة المعينة له }
  const [unassignedOpenCount, setUnassignedOpenCount] = useState(screenCache.unassignedOpenCount)
  const [aiEnabled, setAiEnabled] = useState(screenCache.aiEnabled || false)
  const [aiOpenCount, setAiOpenCount] = useState(screenCache.aiOpenCount || 0)
  const [allChannels, setAllChannels] = useState(screenCache.allChannels) // كل القنوات المتربطة، كل المنصات
  const [selectedLifecycle, setSelectedLifecycle] = useState(screenCache.selectedLifecycle)
  const [visibleLimit, setVisibleLimit] = useState(screenCache.visibleLimit)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBulkAssign, setShowBulkAssign] = useState(false)
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false)
  const [bulkMessageText, setBulkMessageText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const { agent, signOut, setStatus: setAgentStatus } = useAuth()
  const toast = useToast()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const realtimeRef = useRef(null)
  const { canInstall, isIOS, promptInstall } = useInstallPrompt()

  const canSeeAll = agent?.role === 'admin' || agent?.can_see_all_conversations

  // لو منصة معينة (فيسبوك/انستجرام/واتساب) ليها قناة واحدة بس متربطة (أو مفيش)، سيب التاب العادي
  // بتاعها زي ما هو. لو أكتر من قناة لنفس المنصة، بدّل التاب الواحد بتاب منفصل لكل قناة عشان
  // محادثات كل واحدة تفضل منفصلة عن التانية
  const channelTabs = useMemo(() => {
    const tabs = []
    for (const c of CHANNELS) {
      if (c.key === 'all') { tabs.push(c); continue }
      const chsForPlatform = allChannels.filter(ch => ch.platform === c.key)
      if (chsForPlatform.length > 1) {
        chsForPlatform.forEach(ch => tabs.push({
          key: `${c.key}:${ch.id}`, label: getChannelLabel(ch), icon: PLATFORM_ICONS[c.key]
        }))
      } else {
        tabs.push(c)
      }
    }
    return tabs
  }, [allChannels])

  // بيانات "بتتغير نادر" (الموظفين/التاجات/مراحل الـ lifecycle) — بنجيبها لوحدها وبمعدل أبطأ بكتير
  // من قائمة المحادثات، عشان منكررش نفس الاستعلامات دي كل ٥ ثواني من غير داعي
  const fetchStaticLists = useCallback(async () => {
    const { data: agentsData } = await supabase.from('agents').select('id, name, status, is_online, avatar_url').neq('role', 'ai').order('name')
    const aMap = {}
    agentsData?.forEach(a => { aMap[a.id] = { name: a.name, avatar_url: a.avatar_url } })
    setAgentsMap(aMap); screenCache.agentsMap = aMap
    setAgentsList(agentsData || []); screenCache.agentsList = agentsData || []

    const { data: lcStages } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    setLifecycles(lcStages || []); screenCache.lifecycles = lcStages || []

    const { data: aiSettings } = await supabase.from('ai_settings').select('enabled').limit(1).maybeSingle()
    setAiEnabled(!!aiSettings?.enabled); screenCache.aiEnabled = !!aiSettings?.enabled

    // كل القنوات المتربطة (ممكن يكون أكتر من واحدة لنفس المنصة) — عشان نعرض تاب منفصل لكل واحدة
    // بدل ما يترصوا فوق بعض، ونوري اسم القناة جوه كل كارت محادثة وجوه الشات نفسه
    try {
      const res = await fetch(`${API_URL}/channels`)
      const data = await res.json()
      const chs = (data.channels || []).filter(c => c.id && c.status === 'active')
      setAllChannels(chs); screenCache.allChannels = chs
    } catch { /* لو فشل، هتفضل التابات العادية شغالة زي ما هي */ }
  }, [])

  const fetchConversations = useCallback(async () => {
    // لو فيه فلتر مرحلة lifecycle، جيب الـ contacts اللي مطابقة
    let scopeContactIds = null
    if (selectedLifecycle) {
      const { data: lcRows } = await supabase.from('contacts').select('id').eq('lifecycle_stage_id', selectedLifecycle)
      scopeContactIds = new Set((lcRows || []).map(r => r.id))
    }

    // فلاتر القناة/الموظف بس (من غير تاج/lifecycle) — مستخدمة في عدادات الـ lifecycle نفسها
    const applyBaseScope = (q) => {
      const cf = parseChannelFilter(channel)
      if (cf) {
        q = q.eq('platform', cf.platform)
        if (cf.channelId) q = q.eq('channel_id', cf.channelId)
      }
      if (!canSeeAll) {
        q = q.eq('assigned_agent_id', agent?.id)
      } else if (agentFilter === 'unassigned') {
        q = q.is('assigned_agent_id', null)
      } else if (agentFilter === 'ai') {
        q = q.eq('ai_active', true)
      } else if (agentFilter) {
        q = q.eq('assigned_agent_id', agentFilter)
      } else if (viewMode === 'mine') {
        q = q.eq('assigned_agent_id', agent?.id)
      }
      return q
    }

    // فلاتر مشتركة (القناة/الموظف/اللايف سايكل) بنطبقها على أي كويري
    const applyScope = (q) => {
      q = applyBaseScope(q)
      if (scopeContactIds) q = q.in('contact_id', scopeContactIds.size ? [...scopeContactIds] : ['00000000-0000-0000-0000-000000000000'])
      return q
    }

    // عدد المحادثات المفتوحة لكل مرحلة lifecycle (بنفس نطاق القناة/الموظف بس، من غير فلتر التاج/المرحلة نفسها)
    const { data: lcCountData } = await applyBaseScope(
      supabase.from('conversations').select('id, contact_id, contacts(lifecycle_stage_id)').eq('status', 'open')
    )
    const lcCounts = {}
    lcCountData?.forEach(c => {
      const sid = c.contacts?.lifecycle_stage_id
      if (!sid) return
      lcCounts[sid] = (lcCounts[sid] || 0) + 1
    })
    setLifecycleCounts(lcCounts); screenCache.lifecycleCounts = lcCounts

    // كام محادثة مفتوحة معينة لكل موظف (وكام لسه من غير تعيين) — بنفس نطاق القناة بس، من غير فلتر الموظف
    // نفسه، عشان نقدر نقارن كل الموظفين مع بعض في قائمة الفلتر
    if (canSeeAll) {
      let agentCountQuery = supabase.from('conversations').select('assigned_agent_id, ai_active').eq('status', 'open')
      const cf = parseChannelFilter(channel)
      if (cf) {
        agentCountQuery = agentCountQuery.eq('platform', cf.platform)
        if (cf.channelId) agentCountQuery = agentCountQuery.eq('channel_id', cf.channelId)
      }
      const { data: agentCountData } = await agentCountQuery
      const aCounts = {}
      let unassigned = 0
      let aiCount = 0
      agentCountData?.forEach(c => {
        if (c.ai_active) aiCount++
        if (c.assigned_agent_id) aCounts[c.assigned_agent_id] = (aCounts[c.assigned_agent_id] || 0) + 1
        else unassigned++
      })
      setAgentOpenCounts(aCounts); screenCache.agentOpenCounts = aCounts
      setUnassignedOpenCount(unassigned); screenCache.unassignedOpenCount = unassigned
      setAiOpenCount(aiCount); screenCache.aiOpenCount = aiCount
    }

    // عدادات التابات (مفتوحة/متابعة/مغلقة) بنفس نطاق الفلترة الحالي
    const countsQuery = applyScope(supabase.from('conversations').select('id, status, unread_count, last_inbound_at'))
    const { data: countsData } = await countsQuery

    // قراءة كل موظف الشخصية لكل محادثة (عشان نحدد المقروء/غير المقروء على مستوى اليوزر)
    let readsMap = {}
    if (agent?.id && countsData?.length) {
      const allIds = countsData.map(c => c.id)
      const BATCH_SIZE = 200
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE)
        const { data: readsData } = await supabase
          .from('conversation_reads')
          .select('conversation_id, read_at')
          .eq('agent_id', agent.id)
          .in('conversation_id', batch)
        readsData?.forEach(r => { readsMap[r.conversation_id] = r.read_at })
      }
    }
    const isUnreadForMe = (c) => {
      if (!c.unread_count || c.unread_count <= 0) return false
      const myReadAt = readsMap[c.id]
      if (!myReadAt) return true
      if (!c.last_inbound_at) return false
      return new Date(myReadAt) < new Date(c.last_inbound_at)
    }

    const counts = { all: 0, open: 0, openUnread: 0, follow_up: 0, closed: 0 }
    countsData?.forEach(c => {
      counts.all++
      if (c.status === 'open') { counts.open++; if (isUnreadForMe(c)) counts.openUnread++ }
      else if (c.status === 'follow_up') counts.follow_up++
      else if (c.status === 'closed') counts.closed++
    })
    setStatusCounts(counts); screenCache.statusCounts = counts

    // Conversations query — بنجيب أول visibleLimit بس مش كل المحادثات دفعة واحدة (يزيد بـ"تحميل المزيد")
    let query = applyScope(supabase
      .from('conversations')
      .select('*, contacts(id, name, profile_pic, platform_id, lifecycle_stage_id, lifecycle_stages(id, name, color, icon))')
      .order('last_message_at', { ascending: false })
      .range(0, visibleLimit - 1))
    if (status !== 'all') query = query.eq('status', status)
    if (unrepliedOnly) query = query.gt('unread_count', 0)

    const { data, error } = await query
    if (error) { console.error(error); toast.error('فشل تحميل المحادثات، حاول تاني'); setLoading(false); return }

    const convs = (data || []).map(c => ({ ...c, myUnread: isUnreadForMe(c) }))
    setConversations(convs); screenCache.conversations = convs
    setLoading(false)

    // جيب آخر رسالة لكل محادثة + التاجات
    if (convs.length > 0) {
      const ids = convs.map(c => c.id)
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, content_type, direction, created_at')
        .in('conversation_id', ids)
        .neq('content_type', 'note') // الملاحظات الداخلية متتحسبش كـ"آخر رسالة" في معاينة القائمة
        .order('created_at', { ascending: false })

      // خد آخر رسالة لكل محادثة
      const lastMap = {}
      msgs?.forEach(m => {
        if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m
      })
      setLastMessages(lastMap); screenCache.lastMessages = lastMap

      const contactIds = convs.map(c => c.contact_id).filter(Boolean)
      if (contactIds.length) {
        const { data: ctRows } = await supabase
          .from('contact_tags').select('contact_id, tags(id, name, color)').in('contact_id', contactIds)
        const ctMap = {}
        ctRows?.forEach(r => {
          if (!ctMap[r.contact_id]) ctMap[r.contact_id] = []
          if (r.tags) ctMap[r.contact_id].push(r.tags)
        })
        setContactTagsMap(ctMap); screenCache.contactTagsMap = ctMap
      }
    }
  }, [status, channel, agent, viewMode, agentFilter, canSeeAll, unrepliedOnly, selectedLifecycle, visibleLimit])

  // البحث بيدور في قاعدة البيانات كلها مباشرة (مش بس المحادثات المحمّلة/الظاهرة حاليًا)، وبيحترم نفس
  // فلاتر القناة/الموظف/الحالة الحالية. searchType بيحدد نبحث فين: اسم العميل، محتوى رسالة حقيقية،
  // أو محتوى ملاحظة داخلية — كل نوع منفصل عن التاني عشان النتايج تبقى واضحة ومحددة
  const searchConversations = useCallback(async () => {
    const q = search.trim()
    if (!q) return
    setLoading(true)
    try {
      let query;
      if (searchType === 'contact') {
        // بندور على اسم العميل أو رقم هاتفه (للواتساب) في جدول contacts نفسه، بعدين نجيب
        // المحادثات بتاعت العملاء دول — بنفس الأسلوب المستخدم في بحث الرسايل/التعليقات تحت
        const { data: contactRows } = await supabase
          .from('contacts')
          .select('id')
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(300)
        const contactIds = [...new Set((contactRows || []).map(c => c.id))]
        query = supabase.from('conversations')
          .select('*, contacts(id, name, profile_pic, platform_id, lifecycle_stage_id, lifecycle_stages(id, name, color, icon))')
          .in('contact_id', contactIds.length ? contactIds : ['00000000-0000-0000-0000-000000000000'])
      } else {
        let msgQuery = supabase.from('messages').select('conversation_id').ilike('content', `%${q}%`).limit(300)
        msgQuery = searchType === 'comment' ? msgQuery.eq('content_type', 'note') : msgQuery.neq('content_type', 'note')
        const { data: msgs } = await msgQuery
        const convIds = [...new Set((msgs || []).map(m => m.conversation_id))]
        query = supabase.from('conversations')
          .select('*, contacts(id, name, profile_pic, platform_id, lifecycle_stage_id, lifecycle_stages(id, name, color, icon))')
          .in('id', convIds.length ? convIds : ['00000000-0000-0000-0000-000000000000'])
      }

      query = query.order('last_message_at', { ascending: false }).limit(200)
      if (status !== 'all') query = query.eq('status', status)
      const cf = parseChannelFilter(channel)
      if (cf) {
        query = query.eq('platform', cf.platform)
        if (cf.channelId) query = query.eq('channel_id', cf.channelId)
      }
      // البحث مش زي القائمة العادية — بيدور في كل المحادثات حتى المتعينة لموظفين تانيين، عشان لو
      // موظف دوّر على شات مع زميله يلاقيه في النتايج (بس معلّم باسم الموظف صاحبه)، ويقدر يطلب نقله له
      if (agentFilter === 'unassigned') query = query.is('assigned_agent_id', null)
      else if (agentFilter === 'ai') query = query.eq('ai_active', true)
      else if (agentFilter) query = query.eq('assigned_agent_id', agentFilter)
      else if (viewMode === 'mine') query = query.eq('assigned_agent_id', agent?.id)

      const { data, error } = await query
      if (error) { console.error(error); toast.error('فشل البحث، حاول تاني'); setLoading(false); return }

      const convs = (data || []).map(c => ({ ...c, myUnread: false }))
      setConversations(convs); screenCache.conversations = convs
      setLoading(false)

      if (convs.length > 0) {
        const ids = convs.map(c => c.id)
        const { data: msgs } = await supabase
          .from('messages')
          .select('conversation_id, content, content_type, direction, created_at')
          .in('conversation_id', ids)
          .neq('content_type', 'note')
          .order('created_at', { ascending: false })
        const lastMap = {}
        msgs?.forEach(m => { if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m })
        setLastMessages(lastMap); screenCache.lastMessages = lastMap

        const contactIds = convs.map(c => c.contact_id).filter(Boolean)
        if (contactIds.length) {
          const { data: ctRows } = await supabase
            .from('contact_tags').select('contact_id, tags(id, name, color)').in('contact_id', contactIds)
          const ctMap = {}
          ctRows?.forEach(r => {
            if (!ctMap[r.contact_id]) ctMap[r.contact_id] = []
            if (r.tags) ctMap[r.contact_id].push(r.tags)
          })
          setContactTagsMap(ctMap); screenCache.contactTagsMap = ctMap
        }
      } else {
        setLastMessages({}); setContactTagsMap({})
      }
    } catch (err) {
      console.error(err)
      toast.error('فشل البحث، حاول تاني')
      setLoading(false)
    }
  }, [search, searchType, status, channel, agent, viewMode, agentFilter, canSeeAll])

  // لو موظف لقى في نتايج البحث محادثة متعينة لزميله، بدل ما يفتحها على طول بيبعت طلب نقل —
  // بيوصل إشعار لصاحب المحادثة وهو يقبل أو يرفض
  const requestTransfer = async (conv) => {
    try {
      const res = await fetch(`${API_URL}/notifications/transfer-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conv.id, from_agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إرسال الطلب')
      toast.success('اتبعت طلب النقل، مستنيين رد الموظف')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    }
  }

  // بحث بتأخير بسيط (debounce) عشان منضربش الداتابيز بكويري مع كل حرف بيتكتب — ولو البحث اتمسح
  // نرجع للقائمة العادية (المفلترة/المقسمة صفحات) تاني
  const searchMountedRef = useRef(false)
  useEffect(() => {
    if (!agent) return
    if (!search.trim()) {
      if (searchMountedRef.current) fetchConversations()
      searchMountedRef.current = true
      return
    }
    searchMountedRef.current = true
    const t = setTimeout(() => searchConversations(), 350)
    return () => clearTimeout(t)
  }, [search, searchType])

  // لما الفلاتر تتغيّر (مش أول تحميل للشاشة) نرجّع حد الصفحة لأصله، عشان مانجيبش عدد كبير غير لازم في فلتر تاني
  const filtersMountedRef = useRef(false)
  useEffect(() => {
    if (!filtersMountedRef.current) { filtersMountedRef.current = true; return }
    setVisibleLimit(CONVERSATIONS_PAGE_SIZE)
  }, [status, channel, viewMode, agentFilter, selectedLifecycle, unrepliedOnly])

  // بنسجّل الفلاتر الحالية في الكاش بردة، عشان لو رجعت للشاشة دي تاني تلاقيها زي ما سيبتها بالظبط
  useEffect(() => {
    screenCache.status = status
    screenCache.channel = channel
    screenCache.search = search
    screenCache.searchType = searchType
    screenCache.viewMode = viewMode
    screenCache.agentFilter = agentFilter
    screenCache.selectedLifecycle = selectedLifecycle
    screenCache.unrepliedOnly = unrepliedOnly
    screenCache.sidebarOpen = sidebarOpen
    screenCache.visibleLimit = visibleLimit
  }, [status, channel, search, viewMode, agentFilter, selectedLifecycle, unrepliedOnly, sidebarOpen, visibleLimit])

  // بيانات الموظفين/التاجات/الـ lifecycle نادراً ما بتتغير، فبنجيبها مرة لما الشاشة تفتح وبعدين كل دقيقتين بس
  useEffect(() => {
    if (!agent) return
    fetchStaticLists()
    const staticInterval = setInterval(fetchStaticLists, 120000)
    return () => clearInterval(staticInterval)
  }, [fetchStaticLists, agent])

  // بنستخدم ref (مش state) عشان نعرف لحظيًا لو فيه بحث شغال دلوقتي، من غير ما نضطر نضيف search
  // كـ dependency هنا ونسبّب إعادة اشتراك الـ realtime وقايمة الـ intervals مع كل حرف بيتكتب
  const searchActiveRef = useRef(false)
  useEffect(() => { searchActiveRef.current = Boolean(search.trim()) }, [search])

  useEffect(() => {
    if (!agent) return
    // لو عندنا كاش من قبل (يعني ده مش أول فتح للشاشة)، منعملش سبينر ولا نمسح القائمة —
    // بنوريها زي ما هي فوراً وبنعمل تحديث هادئ في الخلفية بس
    if (screenCache.conversations === null) setLoading(true)
    if (!searchActiveRef.current) fetchConversations()

    // Realtime على conversations — لو فيه بحث شغال دلوقتي منعملش تحديث تلقائي، عشان منقاطعش
    // نتايج البحث الحالية؛ البحث نفسه هيتحدّث لوحده لما نص البحث يتغيّر
    if (realtimeRef.current) realtimeRef.current.unsubscribe()
    realtimeRef.current = supabase
      .channel(`convs-list-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        if (!searchActiveRef.current) fetchConversations()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        if (!searchActiveRef.current) fetchConversations() // تحديث آخر رسالة
      })
      .subscribe()

    // Realtime هو المصدر الأساسي دلوقتي — الـ polling ده بقى بس شبكة أمان بطيئة (كل ٧٥ ثانية)
    // لو حصل انقطاع في الـ Realtime لأي سبب، بدل ما كان بيجري كل ٥ ثواني ويستهلك بيانات زيادة عن اللزوم
    const handleVisibility = () => { if (!searchActiveRef.current) fetchConversations() }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    const pollInterval = setInterval(() => { if (!searchActiveRef.current) fetchConversations() }, 75000)

    return () => {
      realtimeRef.current?.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      clearInterval(pollInterval)
    }
  }, [fetchConversations, agent])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setShowBulkAssign(false)
    setBulkMessageOpen(false)
  }

  // تغيير جماعي لحالة المحادثات المحددة
  const bulkChangeStatus = async (newStatus) => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('conversations').update({ status: newStatus }).in('id', ids)
    if (error) { toast.error('فشل تغيير الحالة'); setBulkBusy(false); return }
    await supabase.from('conversation_activity_log').insert(
      ids.map(id => ({ conversation_id: id, agent_id: agent?.id, description: `غيّر حالة المحادثة إلى "${STATUS_LABELS[newStatus]}" (تعديل جماعي)` }))
    )
    setBulkBusy(false)
    toast.success(`اتغيرت حالة ${ids.length} محادثة إلى "${STATUS_LABELS[newStatus]}"`)
    exitSelectionMode()
    fetchConversations()
  }

  // تعيين جماعي لموظف
  const bulkAssign = async (agentId) => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('conversations').update({ assigned_agent_id: agentId }).in('id', ids)
    if (error) { toast.error('فشل التعيين'); setBulkBusy(false); return }
    await supabase.from('conversation_assignment_log').insert(
      ids.map(id => ({ conversation_id: id, assigned_to: agentId, assigned_by: agent?.id }))
    )
    setBulkBusy(false)
    toast.success(`اتعينت ${ids.length} محادثة لـ ${agentsMap[agentId]?.name || 'الموظف'}`)
    exitSelectionMode()
    fetchConversations()
  }

  // رسالة جماعية — بس للمحادثات المفتوحة/متابعة واللي لسه في نافذة الـ٢٤ ساعة، الباقي بيتجاهل ونقول للأدمن كام اتجاهل وليه
  const bulkSendMessage = async () => {
    const text = bulkMessageText.trim()
    if (!text) return
    setBulkBusy(true)

    const targets = conversations.filter(c => selectedIds.has(c.id))
    const now = Date.now()
    const eligible = targets.filter(c => {
      if (c.status === 'closed') return false
      if (!c.last_inbound_at) return false
      return (now - new Date(c.last_inbound_at).getTime()) / 3600000 <= 24
    })
    const skipped = targets.length - eligible.length

    let successCount = 0
    await Promise.all(eligible.map(async c => {
      try {
        const res = await fetch(`${API_URL}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: c.id, content: text, content_type: 'text', agent_id: agent?.id })
        })
        if (res.ok) successCount++
      } catch { /* هنحسبها ضمن اللي فشلت تحت */ }
    }))

    setBulkBusy(false)
    setBulkMessageOpen(false)
    setBulkMessageText('')
    const failedCount = eligible.length - successCount
    const parts = [`اتبعتت لـ ${successCount} محادثة`]
    if (skipped > 0) parts.push(`اتجاهلت ${skipped} (مقفولة أو عدّت الـ٢٤ ساعة)`)
    if (failedCount > 0) parts.push(`فشلت ${failedCount}`)
    toast[successCount > 0 ? 'success' : 'error'](parts.join(' — '))
    exitSelectionMode()
    fetchConversations()
  }

  // البحث بقى بيتم من الداتا بيز مباشرة (searchConversations)، فـ conversations بالفعل النتيجة النهائية
  const filtered = conversations

  const agentStatusBtn = agent?.status || 'online'
  // على الديسكتوب بيتحكم فيها زر الطي (sidebarOpen)، وعلى الموبايل القائمة دايماً موسّعة لما تتفتح
  const expanded = sidebarOpen || mobileMenuOpen
  const AgentFilterList = ({ vertical }) => (
    <div className={vertical ? 'absolute left-4 right-4 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto' : 'absolute right-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden max-h-72 overflow-y-auto'}>
      <button onClick={() => { setAgentFilter(''); setShowAgentFilter(false) }}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right ${!agentFilter ? 'bg-surface-3' : ''}`}>
        <Users size={14} className="text-fg-muted flex-shrink-0" />
        <span className="flex-1">كل الموظفين</span>
      </button>
      <button onClick={() => { setAgentFilter('ai'); setShowAgentFilter(false) }}
        title={aiEnabled ? 'الـ AI Agent مفعّل' : 'الـ AI Agent متوقف'}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right border-t border-surface-3 ${agentFilter === 'ai' ? 'bg-surface-3' : ''}`}>
        <span className="relative flex-shrink-0">
          <span className="w-[22px] h-[22px] rounded-full bg-brand/15 flex items-center justify-center text-brand"><Bot size={13} /></span>
          <span className={`absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full border border-surface-2 ${aiEnabled ? 'bg-success' : 'bg-slate-500'}`} />
        </span>
        <span className="flex-1 truncate">AI Agent</span>
        <span className="text-[11px] text-fg-subtle flex-shrink-0" title="محادثات مفتوحة بيرد عليها الـ AI">{aiOpenCount}</span>
      </button>
      {agentsList.map(a => {
        const st = AGENT_STATUS_OPTS.find(s => s.key === (a.status || 'offline')) || AGENT_STATUS_OPTS[2]
        return (
          <button key={a.id} onClick={() => { setAgentFilter(a.id); setShowAgentFilter(false) }}
            className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right border-t border-surface-3 ${agentFilter === a.id ? 'bg-surface-3' : ''}`}>
            <span className="relative flex-shrink-0">
              <AgentAvatar agent={a} size={22} />
              <span className={`absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full border border-surface-2 ${st.dot}`} />
            </span>
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-[11px] text-fg-subtle flex-shrink-0" title="محادثات مفتوحة معينة له">{agentOpenCounts[a.id] || 0}</span>
          </button>
        )
      })}
      <button onClick={() => { setAgentFilter('unassigned'); setShowAgentFilter(false) }}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right border-t border-surface-3 ${agentFilter === 'unassigned' ? 'bg-surface-3' : ''}`}>
        <span className="w-[22px] h-[22px] rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 text-fg-subtle">
          <UserX size={12} />
        </span>
        <span className="flex-1 truncate text-fg-muted">غير معينة</span>
        <span className="text-[11px] text-fg-subtle flex-shrink-0">{unassignedOpenCount}</span>
      </button>
    </div>
  )

  return (
    <div className="h-full flex bg-surface">
      <NotificationBell />
      {/* خلفية معتمة تقفل قائمة الموبايل لو ضُغط عليها */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ─── القائمة الجانبية — سايدبار ثابت على الديسكتوب، ودرج منزلق على الموبايل ─── */}
      <div className={`${mobileMenuOpen ? 'flex' : 'hidden'} lg:flex fixed lg:static inset-y-0 right-0 z-40 lg:z-auto w-72 ${sidebarOpen ? 'lg:w-72' : 'lg:w-16'} flex-col bg-surface-2 border-l border-surface-3 transition-all duration-200 flex-shrink-0`}>
        {/* Logo + إغلاق (موبايل) / طي (ديسكتوب) */}
        <div className={`flex items-center gap-2 px-3 pt-4 pb-3 border-b border-surface-3 ${expanded ? 'justify-between' : 'flex-col-reverse gap-2'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/icons/icon-192.png" alt="Bridge" className="w-full h-full object-cover" />
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="font-bold text-fg text-sm leading-tight truncate">Bridge - صحة وعافية</p>
                <p className="text-xs text-fg-subtle leading-tight truncate">{agent?.name}</p>
              </div>
            )}
          </div>
          <button onClick={() => setMobileMenuOpen(false)} title="اقفل"
            className="lg:hidden w-7 h-7 flex-shrink-0 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            <X size={16} />
          </button>
          <button onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? 'اقفل القايمة' : 'افتح القايمة'}
            className="hidden lg:flex w-7 h-7 flex-shrink-0 items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            {sidebarOpen ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          </button>
        </div>

        {/* حالة الموظف + الوضع + الإعدادات + خروج */}
        <div className={`flex border-b border-surface-3 py-2.5 ${expanded ? 'items-center justify-between px-3' : 'flex-col items-center gap-1.5'}`}>
          <div className="relative">
            <button onClick={() => setShowAgentStatus(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg ${expanded ? 'px-2.5 py-1.5' : 'w-8 h-8 justify-center'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${AGENT_STATUS_OPTS.find(s => s.key === agentStatusBtn)?.dot}`} />
              {expanded && <>{AGENT_STATUS_OPTS.find(s => s.key === agentStatusBtn)?.label}<ChevronDown size={11} /></>}
            </button>
            {showAgentStatus && (
              <div className="absolute right-0 top-full mt-1 bg-surface border border-surface-3 rounded-xl shadow-xl z-50 min-w-[130px] overflow-hidden">
                {AGENT_STATUS_OPTS.map(s => (
                  <button key={s.key}
                    onClick={() => { setAgentStatus(agent.id, s.key); setShowAgentStatus(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-1 ${expanded ? '' : 'flex-col'}`}>
            <button onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <PushNotificationToggle />
            {agent?.role === 'admin' && (
              <button onClick={() => navigate('/reports')} title="التقارير"
                className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
                <BarChart3 size={15} />
              </button>
            )}
            {agent?.role === 'admin' && (
              <button onClick={() => navigate('/settings')}
                className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
                <Settings size={15} />
              </button>
            )}
            <button onClick={handleSignOut}
              className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-danger rounded-lg hover:bg-surface-3 transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* تثبيت التطبيق — بيظهر بس لو المتصفح مسموحله يثبت أو على آيفون (تعليمات يدوية) */}
        {canInstall && (
          <div className={`border-b border-surface-3 ${expanded ? 'px-3 py-2.5' : 'py-2.5 flex justify-center'}`}>
            <button onClick={() => isIOS ? setShowIosHelp(true) : promptInstall()}
              className={`flex items-center gap-1.5 rounded-lg text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors ${expanded ? 'w-full justify-center px-2.5 py-2' : 'w-8 h-8 justify-center'}`}>
              <Download size={14} />
              {expanded && 'ثبّت التطبيق على الموبايل'}
            </button>
          </div>
        )}

        {/* بحث (ديسكتوب بس — على الموبايل البحث ظاهر فوق قائمة المحادثات مباشرة) + الكل/بتاعتي */}
        {expanded ? (
          <div className="px-3 py-2.5 border-b border-surface-3">
            <div className="hidden lg:block">
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={searchType === 'contact' ? 'بحث بالاسم أو رقم الهاتف...' : searchType === 'comment' ? 'بحث في التعليقات...' : 'بحث في الرسايل...'}
                  className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <SearchTypeChips searchType={searchType} setSearchType={setSearchType} />
            </div>
            {canSeeAll && (
              <div className="flex bg-surface-3 rounded-xl p-0.5 lg:mt-2">
                <button onClick={() => { setViewMode('all'); setAgentFilter('') }}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'all' && !agentFilter ? 'bg-brand text-white' : 'text-fg-muted'}`}>
                  <Users size={12} /> الكل
                </button>
                <button onClick={() => { setViewMode('mine'); setAgentFilter('') }}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'mine' && !agentFilter ? 'bg-brand text-white' : 'text-fg-muted'}`}>
                  <User size={12} /> بتاعتي
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border-b border-surface-3 py-2.5 flex justify-center">
            <button onClick={() => setSidebarOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
              <Search size={15} />
            </button>
          </div>
        )}

        {/* فلتر بموظف معين (أدمن بس) */}
        {agent?.role === 'admin' && expanded && (
          <div className="px-3 py-2 border-b border-surface-3 relative">
            <button onClick={() => setShowAgentFilter(v => !v)}
              className="w-full flex items-center gap-2 bg-surface-3 rounded-lg px-3 py-2 text-xs text-fg hover:bg-surface-3/80 transition-colors">
              {agentFilter === 'unassigned' ? (
                <>
                  <UserX size={14} className="text-fg-muted flex-shrink-0" />
                  <span className="flex-1 text-right truncate">غير معينة</span>
                </>
              ) : agentFilter === 'ai' ? (
                <>
                  <Bot size={14} className="text-brand flex-shrink-0" />
                  <span className="flex-1 text-right truncate">AI Agent</span>
                </>
              ) : agentFilter ? (
                <>
                  <AgentAvatar agent={agentsList.find(a => a.id === agentFilter)} size={16} />
                  <span className="flex-1 text-right truncate">{agentsList.find(a => a.id === agentFilter)?.name}</span>
                </>
              ) : (
                <span className="flex-1 text-right text-fg-muted">كل الموظفين</span>
              )}
              <ChevronDown size={13} className="text-fg-subtle flex-shrink-0" />
            </button>
            {showAgentFilter && <AgentFilterList vertical />}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Status Tabs — عمودي */}
          <div className={expanded ? 'py-2' : 'py-2'}>
            {STATUS_TABS.map(t => {
              const count = t.key === 'open' ? statusCounts.openUnread : statusCounts[t.key]
              return (
                <button key={t.key} onClick={() => { setStatus(t.key); setMobileMenuOpen(false) }} title={t.label}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors rounded-lg mx-auto ${expanded ? 'max-w-[calc(100%-1rem)]' : 'justify-center w-10'} ${status === t.key ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.dot}`} />
                  {expanded && <span className="flex-1 text-right">{t.label}</span>}
                  {expanded && count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.key === 'open' ? 'bg-danger text-white' : 'bg-surface-2 text-fg-muted'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Lifecycle — عدد المحادثات المفتوحة في كل مرحلة، والضغط عليها بيفلتر القائمة (بالحالة المختارة حالياً) */}
          {expanded && lifecycles.length > 0 && (
            <div className="border-t border-surface-3 py-2">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold text-fg-subtle">اللايف سايكل</p>
              <button onClick={() => { setSelectedLifecycle(null); setMobileMenuOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg mx-auto max-w-[calc(100%-1rem)] ${!selectedLifecycle ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                <span className="flex-1 text-right">كل المراحل</span>
              </button>
              {lifecycles.map(l => (
                <button key={l.id} onClick={() => { setSelectedLifecycle(prev => prev === l.id ? null : l.id); setMobileMenuOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg mx-auto max-w-[calc(100%-1rem)] ${selectedLifecycle === l.id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                  <span className="flex-1 text-right truncate">{l.icon && `${l.icon} `}{l.name}</span>
                  {lifecycleCounts[l.id] > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-muted">
                      {lifecycleCounts[l.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── العمود الرئيسي ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* شريط علوي مبسّط للموبايل بس — كل الفلاتر واللوايف سايكل والبحث اتنقلوا للقائمة الجانبية */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-surface-3 flex-shrink-0">
          <button onClick={() => setMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center text-fg-muted hover:text-fg rounded-xl hover:bg-surface-3 transition-colors">
            <Menu size={19} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_TABS.find(t => t.key === status)?.dot}`} />
            <p className="font-semibold text-sm text-fg">{STATUS_TABS.find(t => t.key === status)?.label}</p>
          </div>
          <div className="w-9 h-9" />
        </div>

        {/* البحث — موبايل بس، ظاهر فوق قائمة المحادثات مباشرة (الديسكتوب عنده البحث جوا السايدبار) */}
        <div className="lg:hidden px-4 py-2.5 bg-surface-2 border-b border-surface-3">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={searchType === 'contact' ? 'بحث بالاسم أو رقم الهاتف...' : searchType === 'comment' ? 'بحث في التعليقات...' : 'بحث في الرسايل...'}
              className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <SearchTypeChips searchType={searchType} setSearchType={setSearchType} />
        </div>

        {/* Channel Filter — ظاهر فوق القائمة على الموبايل والديسكتوب مع بعض */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-surface-3 overflow-x-auto scrollbar-hide">
          {channelTabs.map(ch => (
            <button key={ch.key} onClick={() => setChannel(ch.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${channel === ch.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
              {ch.icon}
              {ch.label}
            </button>
          ))}
          <span className="w-px h-4 bg-surface-3 flex-shrink-0" />
          <button onClick={() => setUnrepliedOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${unrepliedOnly ? 'bg-danger text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <CircleDot size={11} />
            بدون رد
          </button>
          <span className="w-px h-4 bg-surface-3 flex-shrink-0" />
          <button onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${selectionMode ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <CheckSquare size={11} />
            {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-fg-subtle">
              <MessageSquare size={32} className="mb-2 opacity-20" />
              <p className="text-sm">لا توجد محادثات</p>
            </div>
          ) : (
            <>
              {filtered.map(conv => (
                <ConvCard
                  key={conv.id}
                  conv={conv}
                  assignedAgent={agentsMap[conv.assigned_agent_id]}
                  lastMsg={lastMessages[conv.id]}
                  tags={contactTagsMap[conv.contact_id]}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(conv.id)}
                  onToggleSelect={() => toggleSelect(conv.id)}
                  onClick={() => selectionMode ? toggleSelect(conv.id) : navigate(`/chat/${conv.id}`)}
                  isForeign={!canSeeAll && conv.assigned_agent_id && conv.assigned_agent_id !== agent?.id}
                  onRequestTransfer={() => requestTransfer(conv)}
                />
              ))}
              {conversations.length >= visibleLimit && (
                <div className="flex justify-center py-4">
                  <button onClick={() => setVisibleLimit(v => v + CONVERSATIONS_PAGE_SIZE)}
                    className="text-xs text-brand font-medium px-4 py-2 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors">
                    تحميل المزيد
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* شريط العمليات الجماعية */}
        {selectionMode && selectedIds.size > 0 && (
          <div className="flex-shrink-0 bg-surface-2 border-t border-surface-3 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-fg">تم تحديد {selectedIds.size}</span>
              <button onClick={exitSelectionMode} className="text-xs text-fg-muted hover:text-fg">إلغاء</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_TABS.filter(t => t.key !== 'all').map(t => (
                <button key={t.key} onClick={() => bulkChangeStatus(t.key)} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                  <span className={`w-2 h-2 rounded-full ${t.dot}`} /> نقل لـ{t.label}
                </button>
              ))}
              <div className="relative">
                <button onClick={() => setShowBulkAssign(v => !v)} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                  <Users size={12} /> تعيين لموظف <ChevronDown size={11} />
                </button>
                {showBulkAssign && (
                  <div className="absolute bottom-full right-0 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden max-h-56 overflow-y-auto">
                    {agentsList.map(a => (
                      <button key={a.id} onClick={() => { bulkAssign(a.id); setShowBulkAssign(false) }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right whitespace-nowrap">
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setBulkMessageOpen(true)} disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50">
                <Send size={12} /> رسالة جماعية
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal الرسالة الجماعية */}
      {bulkMessageOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !bulkBusy && setBulkMessageOpen(false)}>
          <div className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-96 p-5" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-fg mb-1">رسالة جماعية لـ {selectedIds.size} محادثة</p>
            <p className="text-xs text-fg-subtle mb-3">هتتبعت بس للمحادثات المفتوحة/في المتابعة واللي لسه في نافذة الـ٢٤ ساعة — الباقي هيتجاهل تلقائي.</p>
            <textarea value={bulkMessageText} onChange={e => setBulkMessageText(e.target.value)}
              placeholder="اكتب الرسالة..." rows={4}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setBulkMessageOpen(false)} disabled={bulkBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={bulkSendMessage} disabled={bulkBusy || !bulkMessageText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {bulkBusy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'إرسال'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تعليمات تثبيت آيفون (مفيش API تلقائي في سفاري) */}
      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => setShowIosHelp(false)}>
          <div className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-96 p-5" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-fg mb-3">تثبيت التطبيق على آيفون</p>
            <ol className="space-y-2 text-sm text-fg-muted list-decimal pr-4">
              <li className="flex items-center gap-1.5">اضغط زر المشاركة <Share size={14} className="inline text-brand" /> في متصفح سفاري</li>
              <li>مرّر لتحت واختار "إضافة إلى الشاشة الرئيسية"</li>
              <li>اضغط "إضافة" في أعلى الشاشة</li>
            </ol>
            <button onClick={() => setShowIosHelp(false)}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white">
              تمام
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ConvCard({ conv, assignedAgent, lastMsg, tags, selectionMode, selected, onToggleSelect, onClick, isForeign, onRequestTransfer }) {
  const contact = conv.contacts

  const lastMsgText = lastMsg
    ? lastMsg.content_type !== 'text'
      ? lastMsg.content_type === 'image' ? '📷 صورة'
        : lastMsg.content_type === 'sticker' ? '👍 ملصق'
        : lastMsg.content_type === 'video' ? '🎥 فيديو'
        : lastMsg.content_type === 'audio' ? '🎵 صوت'
        : '📎 ملف'
      : (lastMsg.direction === 'outbound' ? '↩ ' : '') + (lastMsg.content || '')
    : ''

  // المحادثة دي مش بتاعة الموظف الحالي — ظهرت في نتايج البحث بس، مش هيقدر يفتحها، بس يقدر يطلب نقلها له
  if (isForeign) {
    return (
      <div className="w-full flex items-center gap-3 px-4 py-3 border-b border-surface-3">
        <div className="relative flex-shrink-0 opacity-60">
          {contact?.profile_pic ? (
            <img src={contact.profile_pic} alt="" className="w-12 h-12 rounded-full object-cover bg-surface-3" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-fg font-semibold text-lg">
              {contact?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-fg truncate">{displayName(contact)}</p>
          <p className="text-xs text-fg-subtle truncate">مع: {assignedAgent?.name || 'موظف تاني'}</p>
        </div>
        <button onClick={onRequestTransfer}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
          اطلب النقل
        </button>
      </div>
    )
  }

  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-3 hover:bg-surface-2 active:bg-surface-3 transition-colors text-right ${selected ? 'bg-brand/10' : ''}`}>
      {selectionMode && (
        <span onClick={e => { e.stopPropagation(); onToggleSelect?.() }} className="flex-shrink-0 text-brand">
          {selected ? <CheckSquare size={20} /> : <Square size={20} className="text-fg-subtle" />}
        </span>
      )}
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {contact?.profile_pic ? (
          <img src={contact.profile_pic} alt=""
            className="w-12 h-12 rounded-full object-cover bg-surface-3"
            onError={e => { e.target.onerror = null; e.target.style.display = 'none' }} />
        ) : (
          <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-fg font-semibold text-lg">
            {contact?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute -bottom-0.5 -left-0.5 bg-surface p-0.5 rounded-full">
          {PLATFORM_ICONS[conv.platform]}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm text-fg truncate">{displayName(contact)}</span>
            {contact?.lifecycle_stages && (
              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                style={{ background: contact.lifecycle_stages.color }}>
                {contact.lifecycle_stages.icon && `${contact.lifecycle_stages.icon} `}{contact.lifecycle_stages.name}
              </span>
            )}
          </span>
          <span className="text-xs text-fg-subtle flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-fg-muted truncate flex-1">
            {lastMsgText || (assignedAgent?.name ? `@${assignedAgent.name}` : 'غير معين')}
          </span>
          {conv.myUnread && (
            <span className="bg-brand text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0 pulse-dot">
              {conv.unread_count}
            </span>
          )}
        </div>
        {assignedAgent?.name && (
          <div className="flex items-center gap-1 mt-1">
            <AgentAvatar agent={assignedAgent} size={14} />
            <p className="text-xs text-fg-subtle truncate">{assignedAgent.name}</p>
          </div>
        )}
        {tags?.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.map(t => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: t.color }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
