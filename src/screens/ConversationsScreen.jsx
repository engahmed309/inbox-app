import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { Settings, Search, MessageSquare, Facebook, Instagram, Phone, LogOut, ChevronDown, ChevronsRight, ChevronsLeft, Users, User, Sun, Moon, CircleDot, Menu, X, Download, Share, BarChart3, CheckSquare, Square, Send, UserX, StickyNote, Bot, DollarSign, Filter, Tag as TagIcon, Megaphone, Calendar, Music2, UserPlus, QrCode } from 'lucide-react'
import NotificationBell from '../components/NotificationBell'
import PushNotificationToggle from '../components/PushNotificationToggle'
import i18n from '../i18n'

const AGENT_STATUS_OPTS = [
  { key: 'online', labelKey: 'conversations.agentStatus.online', dot: 'bg-success' },
  { key: 'busy', labelKey: 'conversations.agentStatus.busy', dot: 'bg-follow' },
  { key: 'offline', labelKey: 'conversations.agentStatus.offline', dot: 'bg-slate-500' },
]

const STATUS_TABS = [
  { key: 'all', labelKey: 'conversations.statusTabs.all', active: 'text-brand border-b-2 border-brand', dot: 'bg-brand' },
  { key: 'open', labelKey: 'chat.status.open', active: 'text-success border-b-2 border-success', dot: 'bg-success' },
  { key: 'follow_up', labelKey: 'chat.status.followUp', active: 'text-follow border-b-2 border-follow', dot: 'bg-follow' },
  { key: 'closed', labelKey: 'chat.status.closed', active: 'text-fg-muted border-b-2 border-fg-muted', dot: 'bg-slate-500' },
]

const CHANNELS = [
  { key: 'all', labelKey: 'conversations.channels.all' },
  { key: 'facebook', labelKey: 'settings.channels.platforms.facebook', icon: <Facebook size={12} className="text-blue-400" /> },
  { key: 'instagram', labelKey: 'settings.channels.platforms.instagram', icon: <Instagram size={12} className="text-pink-400" /> },
  { key: 'whatsapp', labelKey: 'settings.channels.platforms.whatsapp', icon: <Phone size={12} className="text-green-400" /> },
  { key: 'tiktok', labelKey: 'settings.channels.platforms.tiktok', icon: <Music2 size={12} className="text-fg" /> },
  { key: 'whatsapp_qr', labelKey: 'settings.channels.platforms.whatsapp_qr', icon: <QrCode size={12} className="text-emerald-400" /> },
]

const PLATFORM_ICONS = {
  facebook: <Facebook size={12} className="text-blue-400" />,
  instagram: <Instagram size={12} className="text-pink-400" />,
  whatsapp: <Phone size={12} className="text-green-400" />,
  tiktok: <Music2 size={12} className="text-fg" />,
  whatsapp_qr: <QrCode size={12} className="text-emerald-400" />,
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
    return `${ch.display_name || i18n.t('chat.channelLabel.whatsappFallback')} #${last2}`
  }
  return ch.display_name || null
}

const SEARCH_TYPES = [
  { key: 'contact', labelKey: 'conversations.search.types.contact', icon: <User size={11} /> },
  { key: 'message', labelKey: 'conversations.search.types.message', icon: <MessageSquare size={11} /> },
  { key: 'comment', labelKey: 'conversations.search.types.comment', icon: <StickyNote size={11} /> },
]

function SearchTypeChips({ searchType, setSearchType }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {SEARCH_TYPES.map(opt => (
        <button key={opt.key} onClick={() => setSearchType(opt.key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${searchType === opt.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
          {opt.icon} {t(opt.labelKey)}
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

// مكوّن مستقل خارج ConversationsScreen عشان مايتعادش تعريفه في كل render — لو فضل جوّه، أي polling
// بيغيّر الـ state بيخلي React يقفل الـ DOM القديم ويعمل واحد جديد كل شوية، فالسكرول جوه القايمة
// بيرجع لفوق لوحده لو الموظف بيحاول يسكرول أثناء ده
function AgentFilterList({ vertical, agentFilter, setAgentFilter, setShowAgentFilter, aiEnabled, aiOpenCount, agentsList, agentOpenCounts, unassignedOpenCount }) {
  const { t } = useTranslation()
  return (
    <div className={vertical ? 'absolute inset-x-4 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto' : 'absolute start-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden max-h-72 overflow-y-auto'}>
      <button onClick={() => { setAgentFilter(''); setShowAgentFilter(false) }}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start ${!agentFilter ? 'bg-surface-3' : ''}`}>
        <Users size={14} className="text-fg-muted flex-shrink-0" />
        <span className="flex-1">{t('conversations.agentFilter.allAgents')}</span>
      </button>
      <button onClick={() => { setAgentFilter('ai'); setShowAgentFilter(false) }}
        title={aiEnabled ? t('conversations.agentFilter.aiEnabledTitle') : t('conversations.agentFilter.aiDisabledTitle')}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start border-t border-surface-3 ${agentFilter === 'ai' ? 'bg-surface-3' : ''}`}>
        <span className="relative flex-shrink-0">
          <span className="w-[22px] h-[22px] rounded-full bg-brand/15 flex items-center justify-center text-brand"><Bot size={13} /></span>
          <span className={`absolute -bottom-0.5 -end-0.5 w-2 h-2 rounded-full border border-surface-2 ${aiEnabled ? 'bg-success' : 'bg-slate-500'}`} />
        </span>
        <span className="flex-1 truncate">{t('conversations.agentFilter.aiAgentLabel')}</span>
        <span className="text-[11px] text-fg-subtle flex-shrink-0" title={t('conversations.agentFilter.aiOpenCountTitle')}>{aiOpenCount}</span>
      </button>
      {agentsList.map(a => {
        const st = AGENT_STATUS_OPTS.find(s => s.key === (a.status || 'offline')) || AGENT_STATUS_OPTS[2]
        return (
          <button key={a.id} onClick={() => { setAgentFilter(a.id); setShowAgentFilter(false) }}
            className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start border-t border-surface-3 ${agentFilter === a.id ? 'bg-surface-3' : ''}`}>
            <span className="relative flex-shrink-0">
              <AgentAvatar agent={a} size={22} />
              <span className={`absolute -bottom-0.5 -end-0.5 w-2 h-2 rounded-full border border-surface-2 ${st.dot}`} />
            </span>
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-[11px] text-fg-subtle flex-shrink-0" title={t('conversations.agentFilter.agentOpenCountTitle')}>{agentOpenCounts[a.id] || 0}</span>
          </button>
        )
      })}
      <button onClick={() => { setAgentFilter('unassigned'); setShowAgentFilter(false) }}
        className={`flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start border-t border-surface-3 ${agentFilter === 'unassigned' ? 'bg-surface-3' : ''}`}>
        <span className="w-[22px] h-[22px] rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 text-fg-subtle">
          <UserX size={12} />
        </span>
        <span className="flex-1 truncate text-fg-muted">{t('chat.common.unassigned')}</span>
        <span className="text-[11px] text-fg-subtle flex-shrink-0">{unassignedOpenCount}</span>
      </button>
    </div>
  )
}

// فلتر متقدّم للمحادثات — تاجات وإعلانات/حملات (اختيار متعدد، أي واحد فيهم يطابق = OR جوّه نفس النوع)
// وفلتر تاريخ (يوم واحد أو مدى)، وكل الأنواع دي بتتجمع مع بعض بـ AND (لازم يطابق كل نوع مفعّل)
function AdvancedFilterPanel({
  tagsList, campaigns, selectedTagIds, toggleTagId, selectedAdIds, toggleAdId, toggleCampaign,
  dateFrom, setDateFrom, dateTo, setDateTo, onClose, onClear, activeCount
}) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-x-4 lg:start-auto lg:end-4 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 w-auto lg:w-80 max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-3 sticky top-0 bg-surface-2">
        <span className="text-sm font-semibold text-fg">{t('conversations.filters.title')}</span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && <button onClick={onClear} className="text-xs text-danger hover:underline">{t('conversations.filters.clearAll')}</button>}
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={15} /></button>
        </div>
      </div>

      <div className="p-3 border-b border-surface-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle mb-2">
          <Calendar size={12} /> {t('conversations.filters.date.label')}
        </p>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          <span className="text-fg-subtle text-xs flex-shrink-0">{t('conversations.filters.date.to')}</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
        </div>
        <p className="text-[10px] text-fg-subtle mt-1">{t('conversations.filters.date.singleDayHint')}</p>
      </div>

      <div className="p-3 border-b border-surface-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle mb-2">
          <TagIcon size={12} /> {t('conversations.filters.tags.label')} {selectedTagIds.length > 0 && <span className="text-brand">({selectedTagIds.length})</span>}
        </p>
        {tagsList.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t('conversations.filters.tags.empty')}</p>
        ) : (
          <div className="space-y-1">
            {tagsList.map(tg => (
              <label key={tg.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-3 cursor-pointer text-sm">
                <input type="checkbox" checked={selectedTagIds.includes(tg.id)} onChange={() => toggleTagId(tg.id)}
                  className="accent-brand w-3.5 h-3.5" />
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tg.color }} />
                <span className="text-fg truncate">{tg.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle mb-2">
          <Megaphone size={12} /> {t('conversations.filters.campaigns.label')} {selectedAdIds.length > 0 && <span className="text-brand">({selectedAdIds.length})</span>}
        </p>
        {campaigns.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t('conversations.filters.campaigns.empty')}</p>
        ) : (
          <div className="space-y-2.5">
            {campaigns.map(c => {
              const allSelected = c.ads.length > 0 && c.ads.every(a => selectedAdIds.includes(a.id))
              return (
                <div key={c.id}>
                  <label className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-3 cursor-pointer text-xs font-semibold">
                    <input type="checkbox" checked={allSelected} onChange={() => toggleCampaign(c)} className="accent-brand w-3.5 h-3.5" />
                    <span className="text-fg truncate">{c.name}</span>
                  </label>
                  <div className="ps-5 space-y-1">
                    {c.ads.map(a => (
                      <label key={a.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-3 cursor-pointer text-xs">
                        <input type="checkbox" checked={selectedAdIds.includes(a.id)} onChange={() => toggleAdId(a.id)}
                          className="accent-brand w-3.5 h-3.5" />
                        <span className="text-fg-muted truncate">{a.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return i18n.t('conversations.time.now')
  if (mins < 60) return i18n.t('conversations.time.minutesShort', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return i18n.t('conversations.time.hoursShort', { count: hours })
  return i18n.t('conversations.time.daysShort', { count: Math.floor(hours / 24) })
}

// اسم مؤقت مميّز لحد ما يتسجل اسم حقيقي (فيسبوك بيمنع جلب الاسم/الصورة لأغلب الحسابات)
function displayName(contact) {
  if (contact?.name) return contact.name
  if (contact?.platform_id) return i18n.t('chat.displayName.visitor', { id: contact.platform_id.slice(-4) })
  return i18n.t('chat.displayName.unknown')
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
  selectedTagIds: [], selectedAdIds: [], dateFrom: '', dateTo: '', tagsList: [], campaigns: [],
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
  const [tagsList, setTagsList] = useState(screenCache.tagsList)
  const [campaigns, setCampaigns] = useState(screenCache.campaigns)
  const [selectedTagIds, setSelectedTagIds] = useState(screenCache.selectedTagIds)
  const [selectedAdIds, setSelectedAdIds] = useState(screenCache.selectedAdIds)
  const [dateFrom, setDateFrom] = useState(screenCache.dateFrom)
  const [dateTo, setDateTo] = useState(screenCache.dateTo)
  const [showAdvFilter, setShowAdvFilter] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [showNewConv, setShowNewConv] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBulkAssign, setShowBulkAssign] = useState(false)
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false)
  const [bulkMessageText, setBulkMessageText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const { agent, signOut, setStatus: setAgentStatus } = useAuth()
  const toast = useToast()
  const { theme, toggleTheme } = useTheme()
  const { language, toggleLanguage } = useLanguage()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const realtimeRef = useRef(null)
  const { canInstall, isIOS, promptInstall } = useInstallPrompt()

  const canSeeAll = agent?.role === 'admin' || agent?.can_see_all_conversations

  // لو منصة معينة (فيسبوك/انستجرام/واتساب) ليها قناة واحدة بس متربطة (أو مفيش)، سيب التاب العادي
  // بتاعها زي ما هو. لو أكتر من قناة لنفس المنصة، بدّل التاب الواحد بتاب منفصل لكل قناة عشان
  // محادثات كل واحدة تفضل منفصلة عن التانية
  const channelTabs = useMemo(() => {
    const tabs = []
    for (const c of CHANNELS) {
      if (c.key === 'all') { tabs.push({ ...c, label: t(c.labelKey) }); continue }
      const chsForPlatform = allChannels.filter(ch => ch.platform === c.key)
      if (chsForPlatform.length > 1) {
        chsForPlatform.forEach(ch => tabs.push({
          key: `${c.key}:${ch.id}`, label: getChannelLabel(ch), icon: PLATFORM_ICONS[c.key]
        }))
      } else {
        tabs.push({ ...c, label: t(c.labelKey) })
      }
    }
    return tabs
  }, [allChannels, t])

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

    const { data: tagRows } = await supabase.from('tags').select('id, name, color').order('name')
    setTagsList(tagRows || []); screenCache.tagsList = tagRows || []

    try {
      const res = await fetch(`${API_URL}/ads/campaigns`)
      const data = await res.json()
      setCampaigns(data.campaigns || []); screenCache.campaigns = data.campaigns || []
    } catch { /* لو فشل، فلتر الحملات هيفضل فاضي بس باقي الفلاتر تفضل شغالة */ }
  }, [])

  const fetchConversations = useCallback(async () => {
    // فلتر المرحلة بيتطبّق بـ join على contacts (مش بجلب كل معرّفات العملاء وبعتها في .in())، عشان
    // مراحل زي "تم ارسال الباقات" فيها أكتر من ١١ ألف عميل — .in() بقايمة بالحجم ده كان بيعدّي حد
    // طول الرابط المسموح به ويرجّع 400 من غير أي سبب واضح في الواجهة. فلتر التاج لسه بنفس الطريقة
    // القديمة (idSets) لحد ما يظهر نفس المشكلة، أعداده أصغر بكتير حاليًا
    const idSets = []
    if (selectedTagIds.length > 0) {
      const { data: tagRows } = await supabase.from('contact_tags').select('contact_id').in('tag_id', selectedTagIds)
      idSets.push(new Set((tagRows || []).map(r => r.contact_id)))
    }
    const scopeContactIds = idSets.length ? idSets.reduce((a, b) => new Set([...a].filter(x => b.has(x)))) : null

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
      if (selectedAdIds.length > 0) q = q.in('ad_referral->>ad_id', selectedAdIds)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`)
      return q
    }

    // فلاتر مشتركة (القناة/الموظف/التاج/الحملة/التاريخ) — فلتر المرحلة بيتطبّق لوحده بـ join في
    // كل مكان محتاجه (شوف تعليق فوق)، مش هنا
    const applyScope = (q) => {
      q = applyBaseScope(q)
      if (scopeContactIds) q = q.in('contact_id', scopeContactIds.size ? [...scopeContactIds] : ['00000000-0000-0000-0000-000000000000'])
      return q
    }

    // بيجيب كل صفوف كويري معينة بصفحات من ١٠٠٠ (سوبابيز بيوقف عند الحد ده افتراضيًا)، بس بالتوازي
    // مش بالتتابع — أول صفحة بتحدد لو فيه صفحات تانية، والباقي بيتجابوا مع بعض دفعة واحدة، عشان
    // منعملش عشرات الـ round trips المتتالية على قاعدة بيانات فيها آلاف الصفوف
    const fetchAllPaged = async (buildQuery) => {
      const PAGE = 1000
      const { data: first, count } = await buildQuery().range(0, PAGE - 1)
      let all = first || []
      const total = count ?? all.length
      if (total > PAGE) {
        const pageIdxs = []
        for (let offset = PAGE; offset < total; offset += PAGE) pageIdxs.push(offset)
        const rest = await Promise.all(pageIdxs.map(offset => buildQuery().range(offset, offset + PAGE - 1).then(r => r.data || [])))
        rest.forEach(page => { all = all.concat(page) })
      }
      return all
    }

    // الكويريز التلاتة دي مستقلة عن بعض تمامًا — بنجيبهم بالتوازي بدل ما نستنى واحد يخلص قبل ما نبدأ التاني
    const [lcCountData, agentCountData, countsData] = await Promise.all([
      // عدد المحادثات المفتوحة لكل مرحلة lifecycle (بنفس نطاق القناة/الموظف، من غير فلتر التاج/المرحلة نفسها)
      fetchAllPaged(() => applyBaseScope(
        supabase.from('conversations').select('id, contact_id, contacts(lifecycle_stage_id)', { count: 'exact' }).eq('status', 'open')
      )),
      // كام محادثة مفتوحة معينة لكل موظف (وكام لسه من غير تعيين) — بنفس نطاق القناة بس
      canSeeAll ? fetchAllPaged(() => {
        let q = supabase.from('conversations').select('assigned_agent_id, ai_active', { count: 'exact' }).eq('status', 'open')
        const cf = parseChannelFilter(channel)
        if (cf) {
          q = q.eq('platform', cf.platform)
          if (cf.channelId) q = q.eq('channel_id', cf.channelId)
        }
        return q
      }) : Promise.resolve([]),
      // عدادات التابات (مفتوحة/متابعة/مغلقة) بنفس نطاق الفلترة الحالي — !inner لما فيه فلتر مرحلة
      // عشان نستبعد المحادثات اللي عميلها مش في المرحلة دي فعليًا، مش بس نستبعد بيانات الـ join
      fetchAllPaged(() => {
        let q = supabase.from('conversations')
          .select(selectedLifecycle ? 'id, status, unread_count, last_inbound_at, contacts!inner(id)' : 'id, status, unread_count, last_inbound_at', { count: 'exact' })
        q = applyScope(q)
        if (selectedLifecycle) q = q.eq('contacts.lifecycle_stage_id', selectedLifecycle)
        return q
      })
    ])

    const lcCounts = {}
    lcCountData?.forEach(c => {
      const sid = c.contacts?.lifecycle_stage_id
      if (!sid) return
      lcCounts[sid] = (lcCounts[sid] || 0) + 1
    })
    setLifecycleCounts(lcCounts); screenCache.lifecycleCounts = lcCounts

    if (canSeeAll) {
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

    // قراءة كل موظف الشخصية — لازمة بس للمحادثات المفتوحة (هي الوحيدة اللي بتتفحص مقروءة/لأ تحت)،
    // فبنجيبها للمفتوحة بس مش كل الحالات، وبالتوازي مش بالتتابع
    let readsMap = {}
    const openIds = (countsData || []).filter(c => c.status === 'open').map(c => c.id)
    if (agent?.id && openIds.length) {
      const BATCH_SIZE = 200
      const batches = []
      for (let i = 0; i < openIds.length; i += BATCH_SIZE) batches.push(openIds.slice(i, i + BATCH_SIZE))
      const results = await Promise.all(batches.map(batch => supabase
        .from('conversation_reads')
        .select('conversation_id, read_at')
        .eq('agent_id', agent.id)
        .in('conversation_id', batch)
      ))
      results.forEach(({ data: readsData }) => readsData?.forEach(r => { readsMap[r.conversation_id] = r.read_at }))
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
    const contactsEmbed = selectedLifecycle
      ? 'contacts!inner(id, name, profile_pic, platform_id, lifecycle_stage_id, lifecycle_stages(id, name, color, icon))'
      : 'contacts(id, name, profile_pic, platform_id, lifecycle_stage_id, lifecycle_stages(id, name, color, icon))'
    let query = applyScope(supabase
      .from('conversations')
      .select(`*, ${contactsEmbed}`)
      .order('last_message_at', { ascending: false })
      .range(0, visibleLimit - 1))
    if (selectedLifecycle) query = query.eq('contacts.lifecycle_stage_id', selectedLifecycle)
    if (status !== 'all') query = query.eq('status', status)
    if (unrepliedOnly) query = query.gt('unread_count', 0)

    const { data, error } = await query
    if (error) { console.error(error); toast.error(t('conversations.list.loadError')); setLoading(false); return }

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
  }, [status, channel, agent, viewMode, agentFilter, canSeeAll, unrepliedOnly, selectedLifecycle, visibleLimit, selectedTagIds, selectedAdIds, dateFrom, dateTo])

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
        // بندور على اسم العميل أو رقم هاتفه (للواتساب) أو الـ platform_id في جدول contacts نفسه،
        // بعدين نجيب المحادثات بتاعت العملاء دول. لو العميل مالوش اسم محفوظ، الواجهة بتعرضه باسم
        // مؤقت "زائر ####" (آخر ٤ أرقام من platform_id) — الاسم ده مش محفوظ في القاعدة، فلو حد
        // نسخ ولصق "زائر ####" كامل من الشاشة، بنشيل كلمة "زائر" ونبحث بالأرقام بس عشان تلاقيه
        const cleaned = q.replace(/^زائر\s*/, '').trim() || q
        const { data: contactRows } = await supabase
          .from('contacts')
          .select('id')
          .or(`name.ilike.%${cleaned}%,phone.ilike.%${cleaned}%,platform_id.ilike.%${cleaned}%`)
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
      if (error) { console.error(error); toast.error(t('conversations.search.error')); setLoading(false); return }

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
      toast.error(t('conversations.search.error'))
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
      if (!res.ok) throw new Error(data.error || t('conversations.transfer.requestError'))
      toast.success(t('conversations.transfer.requestSent'))
    } catch (err) {
      toast.error(t('chat.toast.genericErrorPrefix', { message: err.message }))
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
  }, [status, channel, viewMode, agentFilter, selectedLifecycle, unrepliedOnly, selectedTagIds, selectedAdIds, dateFrom, dateTo])

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
    screenCache.selectedTagIds = selectedTagIds
    screenCache.selectedAdIds = selectedAdIds
    screenCache.dateFrom = dateFrom
    screenCache.dateTo = dateTo
  }, [status, channel, search, viewMode, agentFilter, selectedLifecycle, unrepliedOnly, sidebarOpen, visibleLimit, selectedTagIds, selectedAdIds, dateFrom, dateTo])

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

  const toggleTagId = (id) => setSelectedTagIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAdId = (id) => setSelectedAdIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleCampaign = (campaign) => {
    const adIds = campaign.ads.map(a => a.id)
    const allSelected = adIds.length > 0 && adIds.every(id => selectedAdIds.includes(id))
    setSelectedAdIds(prev => allSelected ? prev.filter(id => !adIds.includes(id)) : [...new Set([...prev, ...adIds])])
  }
  const clearAdvFilters = () => { setSelectedTagIds([]); setSelectedAdIds([]); setDateFrom(''); setDateTo('') }
  const advFilterActiveCount = selectedTagIds.length + selectedAdIds.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

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
    const statusLabel = t(STATUS_TABS.find(s => s.key === newStatus)?.labelKey)
    const { error } = await supabase.from('conversations').update({ status: newStatus }).in('id', ids)
    if (error) { toast.error(t('conversations.bulkActions.statusChangeError')); setBulkBusy(false); return }
    await supabase.from('conversation_activity_log').insert(
      ids.map(id => ({ conversation_id: id, agent_id: agent?.id, description: t('conversations.bulkActions.statusChangeLogDescription', { status: statusLabel }) }))
    )
    setBulkBusy(false)
    toast.success(t('conversations.bulkActions.statusChangeSuccess', { count: ids.length, status: statusLabel }))
    exitSelectionMode()
    fetchConversations()
  }

  // تعيين جماعي لموظف
  const bulkAssign = async (agentId) => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('conversations').update({ assigned_agent_id: agentId }).in('id', ids)
    if (error) { toast.error(t('conversations.bulkActions.assignError')); setBulkBusy(false); return }
    await supabase.from('conversation_assignment_log').insert(
      ids.map(id => ({ conversation_id: id, assigned_to: agentId, assigned_by: agent?.id }))
    )
    setBulkBusy(false)
    toast.success(t('conversations.bulkActions.assignSuccess', { count: ids.length, agent: agentsMap[agentId]?.name || t('chat.common.agentFallback') }))
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
    const parts = [t('conversations.bulkActions.sentCount', { count: successCount })]
    if (skipped > 0) parts.push(t('conversations.bulkActions.skippedCount', { count: skipped }))
    if (failedCount > 0) parts.push(t('conversations.bulkActions.failedCount', { count: failedCount }))
    toast[successCount > 0 ? 'success' : 'error'](parts.join(' — '))
    exitSelectionMode()
    fetchConversations()
  }

  // البحث بقى بيتم من الداتا بيز مباشرة (searchConversations)، فـ conversations بالفعل النتيجة النهائية
  const filtered = conversations

  const agentStatusBtn = agent?.status || 'online'
  // على الديسكتوب بيتحكم فيها زر الطي (sidebarOpen)، وعلى الموبايل القائمة دايماً موسّعة لما تتفتح
  const expanded = sidebarOpen || mobileMenuOpen

  return (
    <div className="h-full flex bg-surface">
      <NotificationBell />
      {/* خلفية معتمة تقفل قائمة الموبايل لو ضُغط عليها */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ─── القائمة الجانبية — سايدبار ثابت على الديسكتوب، ودرج منزلق على الموبايل ─── */}
      <div className={`${mobileMenuOpen ? 'flex' : 'hidden'} lg:flex fixed lg:static inset-y-0 start-0 z-40 lg:z-auto w-72 ${sidebarOpen ? 'lg:w-72' : 'lg:w-16'} flex-col bg-surface-2 border-e border-surface-3 transition-all duration-200 flex-shrink-0`}>
        {/* Logo + إغلاق (موبايل) / طي (ديسكتوب) */}
        <div className={`flex items-center gap-2 px-3 pt-4 pb-3 border-b border-surface-3 ${expanded ? 'justify-between' : 'flex-col-reverse gap-2'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/icons/icon-192.png" alt="Bridge" className="w-full h-full object-cover" />
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="font-bold text-fg text-sm leading-tight truncate">{t('conversations.sidebar.brandName')}</p>
                <p className="text-xs text-fg-subtle leading-tight truncate">{agent?.name}</p>
              </div>
            )}
          </div>
          <button onClick={() => setMobileMenuOpen(false)} title={t('conversations.sidebar.closeTitle')}
            className="lg:hidden w-7 h-7 flex-shrink-0 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            <X size={16} />
          </button>
          <button onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? t('conversations.sidebar.collapseTitle') : t('conversations.sidebar.expandTitle')}
            className="hidden lg:flex w-7 h-7 flex-shrink-0 items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            {sidebarOpen
              ? (language === 'en' ? <ChevronsLeft size={15} /> : <ChevronsRight size={15} />)
              : (language === 'en' ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />)}
          </button>
        </div>

        {/* حالة الموظف (صف لوحده) + الوضع/الإعدادات/خروج (صف تاني) */}
        <div className={`flex flex-col gap-2 border-b border-surface-3 py-2.5 ${expanded ? 'px-3' : 'items-center'}`}>
          <div className="relative">
            <button onClick={() => setShowAgentStatus(v => !v)}
              className={`flex items-center gap-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg ${expanded ? 'px-2.5 py-1.5' : 'w-8 h-8 justify-center'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${AGENT_STATUS_OPTS.find(s => s.key === agentStatusBtn)?.dot}`} />
              {expanded && <>{t(AGENT_STATUS_OPTS.find(s => s.key === agentStatusBtn)?.labelKey)}<ChevronDown size={11} /></>}
            </button>
            {showAgentStatus && (
              <div className="absolute start-0 top-full mt-1 bg-surface border border-surface-3 rounded-xl shadow-xl z-50 min-w-[130px] overflow-hidden">
                {AGENT_STATUS_OPTS.map(s => (
                  <button key={s.key}
                    onClick={() => { setAgentStatus(agent.id, s.key); setShowAgentStatus(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    {t(s.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-1 ${expanded ? 'flex-wrap' : 'flex-col'}`}>
            <button onClick={() => setShowNewConv(true)} title={t('conversations.newConversation.title')}
              className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
              <UserPlus size={15} />
            </button>
            <button onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button onClick={toggleLanguage} title={t('conversations.sidebar.languageTitle')}
              className="w-8 h-8 flex items-center justify-center text-[11px] font-bold text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
              {language === 'ar' ? 'EN' : 'ع'}
            </button>
            <PushNotificationToggle />
            {agent?.role === 'admin' && (
              <button onClick={() => navigate('/reports')} title={t('conversations.sidebar.reportsTitle')}
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
              {expanded && t('conversations.sidebar.installButton')}
            </button>
          </div>
        )}

        {/* بحث (ديسكتوب بس — على الموبايل البحث ظاهر فوق قائمة المحادثات مباشرة) + الكل/بتاعتي */}
        {expanded ? (
          <div className="px-3 py-2.5 border-b border-surface-3">
            <div className="hidden lg:block">
              <div className="relative">
                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={searchType === 'contact' ? t('conversations.search.placeholderContact') : searchType === 'comment' ? t('conversations.search.placeholderComment') : t('conversations.search.placeholderMessage')}
                  className="w-full bg-surface-3 rounded-xl py-2 px-4 ps-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <SearchTypeChips searchType={searchType} setSearchType={setSearchType} />
            </div>
            {canSeeAll && (
              <div className="flex bg-surface-3 rounded-xl p-0.5 lg:mt-2">
                <button onClick={() => { setViewMode('all'); setAgentFilter('') }}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'all' && !agentFilter ? 'bg-brand text-white' : 'text-fg-muted'}`}>
                  <Users size={12} /> {t('conversations.viewMode.all')}
                </button>
                <button onClick={() => { setViewMode('mine'); setAgentFilter('') }}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'mine' && !agentFilter ? 'bg-brand text-white' : 'text-fg-muted'}`}>
                  <User size={12} /> {t('conversations.viewMode.mine')}
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
                  <span className="flex-1 text-start truncate">{t('chat.common.unassigned')}</span>
                </>
              ) : agentFilter === 'ai' ? (
                <>
                  <Bot size={14} className="text-brand flex-shrink-0" />
                  <span className="flex-1 text-start truncate">{t('conversations.agentFilter.aiAgentLabel')}</span>
                </>
              ) : agentFilter ? (
                <>
                  <AgentAvatar agent={agentsList.find(a => a.id === agentFilter)} size={16} />
                  <span className="flex-1 text-start truncate">{agentsList.find(a => a.id === agentFilter)?.name}</span>
                </>
              ) : (
                <span className="flex-1 text-start text-fg-muted">{t('conversations.agentFilter.allAgents')}</span>
              )}
              <ChevronDown size={13} className="text-fg-subtle flex-shrink-0" />
            </button>
            {showAgentFilter && (
              <AgentFilterList vertical
                agentFilter={agentFilter} setAgentFilter={setAgentFilter} setShowAgentFilter={setShowAgentFilter}
                aiEnabled={aiEnabled} aiOpenCount={aiOpenCount} agentsList={agentsList}
                agentOpenCounts={agentOpenCounts} unassignedOpenCount={unassignedOpenCount} />
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Status Tabs — عمودي */}
          <div className={expanded ? 'py-2' : 'py-2'}>
            {STATUS_TABS.map(tab => {
              const count = tab.key === 'open' ? statusCounts.openUnread : statusCounts[tab.key]
              const tabLabel = t(tab.labelKey)
              return (
                <button key={tab.key} onClick={() => { setStatus(tab.key); setMobileMenuOpen(false) }} title={tabLabel}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors rounded-lg mx-auto ${expanded ? 'max-w-[calc(100%-1rem)]' : 'justify-center w-10'} ${status === tab.key ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tab.dot}`} />
                  {expanded && <span className="flex-1 text-start">{tabLabel}</span>}
                  {expanded && count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab.key === 'open' ? 'bg-danger text-white' : 'bg-surface-2 text-fg-muted'}`}>
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
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold text-fg-subtle">{t('conversations.lifecycle.heading')}</p>
              <button onClick={() => { setSelectedLifecycle(null); setMobileMenuOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg mx-auto max-w-[calc(100%-1rem)] ${!selectedLifecycle ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                <span className="flex-1 text-start">{t('conversations.lifecycle.allStages')}</span>
              </button>
              {lifecycles.map(l => (
                <button key={l.id} onClick={() => { setSelectedLifecycle(prev => prev === l.id ? null : l.id); setMobileMenuOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg mx-auto max-w-[calc(100%-1rem)] ${selectedLifecycle === l.id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                  <span className="flex-1 text-start truncate">{l.icon && `${l.icon} `}{l.name}</span>
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
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_TABS.find(s => s.key === status)?.dot}`} />
            <p className="font-semibold text-sm text-fg">{t(STATUS_TABS.find(s => s.key === status)?.labelKey)}</p>
          </div>
          <div className="w-9 h-9" />
        </div>

        {/* البحث — موبايل بس، ظاهر فوق قائمة المحادثات مباشرة (الديسكتوب عنده البحث جوا السايدبار) */}
        <div className="lg:hidden px-4 py-2.5 bg-surface-2 border-b border-surface-3">
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={searchType === 'contact' ? t('conversations.search.placeholderContact') : searchType === 'comment' ? t('conversations.search.placeholderComment') : t('conversations.search.placeholderMessage')}
              className="w-full bg-surface-3 rounded-xl py-2 px-4 ps-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <SearchTypeChips searchType={searchType} setSearchType={setSearchType} />
        </div>

        {/* Channel Filter — ظاهر فوق القائمة على الموبايل والديسكتوب مع بعض. الـ overflow-x-auto جوه
            الصف بيخلي أي عنصر overflow-y محسوب auto تلقائي حسب مواصفة CSS، فبيقص أي حاجة absolute
            زي بانل الفلتر لو اتحطت جواه — عشان كده حاططين البانل برّه في wrapper منفصل مش بيعمل scroll */}
        <div className="relative">
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
            {t('conversations.filters.unrepliedOnly')}
          </button>
          <span className="w-px h-4 bg-surface-3 flex-shrink-0" />
          <button onClick={() => setShowAdvFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${advFilterActiveCount > 0 ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <Filter size={11} />
            {t('conversations.filters.advancedButton')}
            {advFilterActiveCount > 0 && <span className="text-[10px] font-bold bg-white/25 rounded-full px-1.5">{advFilterActiveCount}</span>}
          </button>
          <span className="w-px h-4 bg-surface-3 flex-shrink-0" />
          <button onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${selectionMode ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            <CheckSquare size={11} />
            {selectionMode ? t('conversations.selection.disable') : t('conversations.selection.enable')}
          </button>
        </div>
        {showAdvFilter && (
          <AdvancedFilterPanel
            tagsList={tagsList} campaigns={campaigns}
            selectedTagIds={selectedTagIds} toggleTagId={toggleTagId}
            selectedAdIds={selectedAdIds} toggleAdId={toggleAdId} toggleCampaign={toggleCampaign}
            dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo}
            onClose={() => setShowAdvFilter(false)} onClear={clearAdvFilters} activeCount={advFilterActiveCount}
          />
        )}
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
              <p className="text-sm">{t('conversations.list.empty')}</p>
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
                    {t('conversations.list.loadMore')}
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
              <span className="text-sm font-medium text-fg">{t('conversations.selection.selectedLabel', { count: selectedIds.size })}</span>
              <button onClick={exitSelectionMode} className="text-xs text-fg-muted hover:text-fg">{t('chat.common.cancel')}</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_TABS.filter(tab => tab.key !== 'all').map(tab => (
                <button key={tab.key} onClick={() => bulkChangeStatus(tab.key)} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                  <span className={`w-2 h-2 rounded-full ${tab.dot}`} /> {t('conversations.bulkActions.moveToStatus', { status: t(tab.labelKey) })}
                </button>
              ))}
              <div className="relative">
                <button onClick={() => setShowBulkAssign(v => !v)} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                  <Users size={12} /> {t('conversations.bulkActions.assignToAgent')} <ChevronDown size={11} />
                </button>
                {showBulkAssign && (
                  <div className="absolute bottom-full start-0 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden max-h-56 overflow-y-auto">
                    {agentsList.map(a => (
                      <button key={a.id} onClick={() => { bulkAssign(a.id); setShowBulkAssign(false) }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-start whitespace-nowrap">
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setBulkMessageOpen(true)} disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50">
                <Send size={12} /> {t('conversations.bulkActions.bulkMessage')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal الرسالة الجماعية */}
      {bulkMessageOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !bulkBusy && setBulkMessageOpen(false)}>
          <div className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-96 p-5" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-fg mb-1">{t('conversations.bulkActions.bulkMessageTitle', { count: selectedIds.size })}</p>
            <p className="text-xs text-fg-subtle mb-3">{t('conversations.bulkActions.messageHint')}</p>
            <textarea value={bulkMessageText} onChange={e => setBulkMessageText(e.target.value)}
              placeholder={t('conversations.bulkActions.messagePlaceholder')} rows={4}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setBulkMessageOpen(false)} disabled={bulkBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                {t('chat.common.cancel')}
              </button>
              <button onClick={bulkSendMessage} disabled={bulkBusy || !bulkMessageText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {bulkBusy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('conversations.common.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بدء محادثة يدوي مع جهة اتصال جديدة */}
      {showNewConv && (
        <NewConversationModal
          agentId={agent?.id}
          channels={allChannels.filter(c => c.platform === 'whatsapp' || c.platform === 'whatsapp_qr')}
          onClose={() => setShowNewConv(false)}
          onStarted={(conversationId) => { setShowNewConv(false); navigate(`/chat/${conversationId}`) }}
        />
      )}

      {/* تعليمات تثبيت آيفون (مفيش API تلقائي في سفاري) */}
      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => setShowIosHelp(false)}>
          <div className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-96 p-5" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-fg mb-3">{t('conversations.install.iosTitle')}</p>
            <ol className="space-y-2 text-sm text-fg-muted list-decimal ps-4">
              <li className="flex items-center gap-1.5">{t('conversations.install.iosStep1Before')} <Share size={14} className="inline text-brand" /> {t('conversations.install.iosStep1After')}</li>
              <li>{t('conversations.install.iosStep2')}</li>
              <li>{t('conversations.install.iosStep3')}</li>
            </ol>
            <button onClick={() => setShowIosHelp(false)}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white">
              {t('conversations.install.okButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ConvCard({ conv, assignedAgent, lastMsg, tags, selectionMode, selected, onToggleSelect, onClick, isForeign, onRequestTransfer }) {
  const { t } = useTranslation()
  const contact = conv.contacts

  const lastMsgText = lastMsg
    ? lastMsg.content_type !== 'text'
      ? lastMsg.content_type === 'image' ? t('conversations.contentTypes.image')
        : lastMsg.content_type === 'sticker' ? t('conversations.contentTypes.sticker')
        : lastMsg.content_type === 'video' ? t('conversations.contentTypes.video')
        : lastMsg.content_type === 'audio' ? t('conversations.contentTypes.audio')
        : t('conversations.contentTypes.file')
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
          <p className="text-xs text-fg-subtle truncate">{t('conversations.card.withAgent', { agent: assignedAgent?.name || t('conversations.card.otherAgent') })}</p>
        </div>
        <button onClick={onRequestTransfer}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
          {t('conversations.card.requestTransferButton')}
        </button>
      </div>
    )
  }

  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-3 hover:bg-surface-2 active:bg-surface-3 transition-colors text-start ${selected ? 'bg-brand/10' : ''}`}>
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
        <div className="absolute -bottom-0.5 -end-0.5 bg-surface p-0.5 rounded-full">
          {PLATFORM_ICONS[conv.platform]}
        </div>
        {conv.ai_active && (
          <div className="absolute -top-0.5 -end-0.5 bg-brand text-white p-0.5 rounded-full" title={t('conversations.card.aiActiveTitle')}>
            <Bot size={11} />
          </div>
        )}
        {conv.ad_referral && (
          <div className="absolute -top-0.5 -start-0.5 bg-amber-500 text-white p-0.5 rounded-full" title={t('conversations.card.adReferralTitle')}>
            <DollarSign size={11} />
          </div>
        )}
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
            {lastMsgText || (assignedAgent?.name ? `@${assignedAgent.name}` : t('chat.common.unassigned'))}
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
            {tags.map(tg => (
              <span key={tg.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: tg.color }}>
                {tg.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── بدء محادثة يدوي مع اسم + رقم تليفون لسه ما كلّمناش خالص ─────────────
// بيعمل جهة اتصال + محادثة فاضية بس (POST /conversations/start)، وبعدين بينتقل لشاشة الشات
// العادية — من هناك الإرسال بيمشي بنفس المسارات الموجودة أصلاً حسب المنصة (واتساب QR: صندوق
// كتابة عادي على طول، واتساب الرسمي: بيتجبر على "ابعت قالب معتمد" لأول رسالة لعميل جديد)
function NewConversationModal({ agentId, channels, onClose, onStarted }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [channelId, setChannelId] = useState(channels[0]?.id || '')
  const [sending, setSending] = useState(false)

  const start = async () => {
    if (!name.trim() || !phone.trim() || !channelId) {
      toast.error(t('conversations.newConversation.missingFieldsError'))
      return
    }
    setSending(true)
    try {
      const res = await fetch(`${API_URL}/conversations/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), channel_id: channelId, agent_id: agentId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('conversations.newConversation.startError'))
      onStarted(data.conversation_id)
    } catch (err) {
      toast.error(t('chat.toast.genericErrorPrefix', { message: err.message }))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !sending && onClose()}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[400px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-2">
          <p className="text-sm font-semibold text-fg">{t('conversations.newConversation.title')}</p>
          <button onClick={onClose} disabled={sending}
            className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('conversations.newConversation.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('conversations.newConversation.namePlaceholder')}
              className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('conversations.newConversation.phoneLabel')}</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('conversations.newConversation.phonePlaceholder')} dir="ltr"
              className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle text-left focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('conversations.newConversation.sendFromLabel')}</label>
            {channels.length === 0 ? (
              <p className="text-xs text-danger">{t('conversations.newConversation.noActiveChannel')}</p>
            ) : (
              <select value={channelId} onChange={e => setChannelId(e.target.value)}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none">
                {channels.map(c => (
                  <option key={c.id} value={c.id}>
                    {getChannelLabel(c) || c.display_name} {c.platform === 'whatsapp_qr' ? t('conversations.newConversation.quickLinkTag') : ''}
                  </option>
                ))}
              </select>
            )}
            {/* واتساب الرسمي هيتجبر على قالب معتمد لأول رسالة — دي قاعدة ميتا نفسها مش اختيار عندنا */}
            <p className="text-[11px] text-fg-subtle mt-1.5">{t('conversations.newConversation.officialTemplateHint')}</p>
          </div>
          <button onClick={start} disabled={sending || channels.length === 0}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('conversations.newConversation.submitButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
