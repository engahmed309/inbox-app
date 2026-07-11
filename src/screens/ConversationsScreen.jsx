import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Settings, Search, MessageSquare, Facebook, Instagram, Phone, LogOut } from 'lucide-react'

const STATUS_TABS = [
  { key: 'open', label: 'مفتوحة', active: 'text-success border-b-2 border-success' },
  { key: 'follow_up', label: 'متابعة', active: 'text-follow border-b-2 border-follow' },
  { key: 'closed', label: 'مغلقة', active: 'text-slate-300 border-b-2 border-slate-300' },
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

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState([])
  const [agentsMap, setAgentsMap] = useState({})
  const [lastMessages, setLastMessages] = useState({}) // { conv_id: content }
  const [status, setStatus] = useState('open')
  const [channel, setChannel] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { agent, signOut } = useAuth()
  const navigate = useNavigate()
  const realtimeRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    // Agents map
    const { data: agentsList } = await supabase.from('agents').select('id, name')
    const aMap = {}
    agentsList?.forEach(a => { aMap[a.id] = a.name })
    setAgentsMap(aMap)

    // Conversations query
    let query = supabase
      .from('conversations')
      .select('*, contacts(id, name, profile_pic)')
      .eq('status', status)
      .order('last_message_at', { ascending: false })

    if (channel !== 'all') query = query.eq('platform', channel)
    if (agent?.role !== 'admin' && !agent?.can_see_all_conversations) {
      query = query.eq('assigned_agent_id', agent?.id)
    }

    const { data, error } = await query
    if (error) { console.error(error); setLoading(false); return }

    const convs = data || []
    setConversations(convs)
    setLoading(false)

    // جيب آخر رسالة لكل محادثة
    if (convs.length > 0) {
      const ids = convs.map(c => c.id)
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, content_type, direction, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })

      // خد آخر رسالة لكل محادثة
      const lastMap = {}
      msgs?.forEach(m => {
        if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m
      })
      setLastMessages(lastMap)
    }
  }, [status, channel, agent])

  useEffect(() => {
    if (!agent) return
    setLoading(true)
    fetchConversations()

    // Realtime على conversations
    if (realtimeRef.current) realtimeRef.current.unsubscribe()
    realtimeRef.current = supabase
      .channel(`convs-list-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConversations()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations() // تحديث آخر رسالة
      })
      .subscribe()

    return () => realtimeRef.current?.unsubscribe()
  }, [fetchConversations, agent])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const filtered = conversations.filter(c =>
    !search || c.contacts?.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <MessageSquare size={16} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">الرسائل</p>
            <p className="text-xs text-slate-500 leading-tight">{agent?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {agent?.role === 'admin' && (
            <button onClick={() => navigate('/settings')}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-surface-3 transition-colors">
              <Settings size={17} />
            </button>
          )}
          <button onClick={handleSignOut}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-danger rounded-xl hover:bg-surface-3 transition-colors">
            <LogOut size={17} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 bg-surface-2 border-b border-surface-3">
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم..."
            className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand" />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-2">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${status === t.key ? t.active : 'text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Channel Filter */}
      <div className="flex gap-2 px-4 py-2 bg-surface-2 border-b border-surface-3 overflow-x-auto scrollbar-hide">
        {CHANNELS.map(ch => (
          <button key={ch.key} onClick={() => setChannel(ch.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${channel === ch.key ? 'bg-brand text-white' : 'bg-surface-3 text-slate-400 hover:text-white'}`}>
            {ch.icon}
            {ch.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <MessageSquare size={32} className="mb-2 opacity-20" />
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConvCard
              key={conv.id}
              conv={conv}
              agentName={agentsMap[conv.assigned_agent_id]}
              lastMsg={lastMessages[conv.id]}
              onClick={() => navigate(`/chat/${conv.id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ConvCard({ conv, agentName, lastMsg, onClick }) {
  const contact = conv.contacts

  const lastMsgText = lastMsg
    ? lastMsg.content_type !== 'text'
      ? lastMsg.content_type === 'image' ? '📷 صورة'
        : lastMsg.content_type === 'video' ? '🎥 فيديو'
        : lastMsg.content_type === 'audio' ? '🎵 صوت'
        : '📎 ملف'
      : (lastMsg.direction === 'outbound' ? '↩ ' : '') + (lastMsg.content || '')
    : ''

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-surface-3 hover:bg-surface-2 active:bg-surface-3 transition-colors text-right">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {contact?.profile_pic ? (
          <img src={contact.profile_pic} alt=""
            className="w-12 h-12 rounded-full object-cover bg-surface-3"
            onError={e => { e.target.onerror = null; e.target.style.display = 'none' }} />
        ) : (
          <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-white font-semibold text-lg">
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
          <span className="font-semibold text-sm text-white truncate">{contact?.name || 'مجهول'}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-slate-400 truncate flex-1">
            {lastMsgText || (agentName ? `@${agentName}` : 'غير معين')}
          </span>
          {conv.unread_count > 0 && (
            <span className="bg-brand text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0 pulse-dot">
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
        {agentName && (
          <p className="text-xs text-slate-600 mt-0.5 truncate">@{agentName}</p>
        )}
      </div>
    </button>
  )
}
