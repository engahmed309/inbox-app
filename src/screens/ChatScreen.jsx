import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ContactSidebar from '../components/ContactSidebar'
import {
  ArrowRight, Send, Paperclip, Image, ChevronDown,
  User, CheckCheck, Clock, Facebook, Instagram, Phone
} from 'lucide-react'

const STATUS_OPTS = [
  { key: 'open', label: 'مفتوحة', color: 'bg-success' },
  { key: 'follow_up', label: 'متابعة', color: 'bg-follow' },
  { key: 'closed', label: 'مغلقة', color: 'bg-slate-500' },
]

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { agent } = useAuth()

  const [conv, setConv] = useState(null)
  const [contact, setContact] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [agents, setAgents] = useState([])
  const [showAssign, setShowAssign] = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)
  const fileInputRef = useRef(null)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  const loadData = async () => {
    // Load conversation + contact
    const { data: convData } = await supabase
      .from('conversations')
      .select('*, contacts(*), agents(name)')
      .eq('id', id)
      .single()
    if (convData) {
      setConv(convData)
      setContact(convData.contacts)
    }

    // Load messages
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])

    // Mark as read
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)

    // Load agents (admin only)
    if (agent?.role === 'admin') {
      const { data: ags } = await supabase.from('agents').select('id, name, is_online').order('name')
      setAgents(ags || [])
    }
  }

  useEffect(() => {
    loadData()

    // Realtime messages
    if (channelRef.current) channelRef.current.unsubscribe()
    channelRef.current = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${id}`
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
        scrollToBottom()
      })
      .subscribe()

    return () => channelRef.current?.unsubscribe()
  }, [id])

  useEffect(() => { scrollToBottom() }, [messages])

  const sendMessage = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await fetch(`${API_URL}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, content: text.trim(), agent_id: agent?.id })
      })
      setText('')
    } catch (err) {
      alert('فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  const changeStatus = async (newStatus) => {
    await supabase.from('conversations').update({ status: newStatus }).eq('id', id)
    setConv(prev => ({ ...prev, status: newStatus }))
    setShowStatus(false)
  }

  const assignAgent = async (agentId) => {
    await supabase.from('conversations').update({ assigned_agent_id: agentId }).eq('id', id)
    const ag = agents.find(a => a.id === agentId)
    setConv(prev => ({ ...prev, assigned_agent_id: agentId, agents: ag }))
    setShowAssign(false)
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    // Upload to Supabase storage then send
    const path = `media/${id}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('inbox-media').upload(path, file)
    if (error) { alert('فشل رفع الملف'); return }
    const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
    const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file'
    await fetch(`${API_URL}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: id, content: file.name, content_type: type, media_url: urlData.publicUrl })
    })
  }

  const currentStatus = STATUS_OPTS.find(s => s.key === conv?.status) || STATUS_OPTS[0]

  const PlatformIcon = conv?.platform === 'instagram' ? Instagram : conv?.platform === 'whatsapp' ? Phone : Facebook

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-3 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowRight size={20} />
        </button>

        <button onClick={() => setShowSidebar(true)} className="flex items-center gap-2 flex-1 min-w-0">
          {contact?.profile_pic ? (
            <img src={contact.profile_pic} className="w-9 h-9 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center">
              <User size={16} className="text-slate-400" />
            </div>
          )}
          <div className="min-w-0 text-right">
            <p className="font-semibold text-sm text-white truncate">{contact?.name || 'مجهول'}</p>
            <div className="flex items-center gap-1">
              <PlatformIcon size={11} className="text-slate-400" />
              <span className="text-xs text-slate-400">{conv?.agents?.name || 'غير معين'}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {/* Assign (admin) */}
          {agent?.role === 'admin' && (
            <div className="relative">
              <button onClick={() => setShowAssign(!showAssign)}
                className="px-2.5 py-1.5 text-xs bg-surface-3 rounded-lg text-slate-300 hover:text-white transition-colors">
                تعيين
              </button>
              {showAssign && (
                <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[140px]">
                  {agents.map(ag => (
                    <button key={ag.id} onClick={() => assignAgent(ag.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface-3 text-sm text-right">
                      <span className={`w-2 h-2 rounded-full ${ag.is_online ? 'bg-success' : 'bg-slate-500'}`} />
                      {ag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="relative">
            <button onClick={() => setShowStatus(!showStatus)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white ${currentStatus.color} transition-colors`}>
              {currentStatus.label}
              <ChevronDown size={12} />
            </button>
            {showStatus && (
              <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 overflow-hidden">
                {STATUS_OPTS.map(s => (
                  <button key={s.key} onClick={() => changeStatus(s.key)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-surface-3 text-sm text-right">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" onClick={() => { setShowStatus(false); setShowAssign(false) }}>
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg} prev={messages[i - 1]} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 bg-surface-2 border-t border-surface-3">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFile}
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx"
          />
          <button onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-surface-3 transition-colors">
            <Paperclip size={18} />
          </button>
          <button onClick={() => { fileInputRef.current.accept = 'image/*'; fileInputRef.current?.click() }}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-surface-3 transition-colors">
            <Image size={18} />
          </button>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="اكتب رسالة..."
            rows={1}
            className="flex-1 bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand resize-none min-h-[40px] max-h-[120px]"
            style={{ height: 'auto' }}
          />

          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors disabled:opacity-50">
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Contact Sidebar */}
      {showSidebar && (
        <ContactSidebar
          contact={contact}
          conv={conv}
          onClose={() => setShowSidebar(false)}
          onUpdate={setContact}
        />
      )}
    </div>
  )
}

function MessageBubble({ msg, prev }) {
  const isOut = msg.direction === 'outbound'
  const showTime = !prev || Math.abs(new Date(msg.created_at) - new Date(prev.created_at)) > 300000

  return (
    <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
      {showTime && (
        <span className="text-xs text-slate-500 mb-1 px-2">{formatTime(msg.created_at)}</span>
      )}
      <div className={`max-w-[75%] px-3.5 py-2.5 text-sm text-white slide-in ${isOut ? 'msg-out' : 'msg-in'}`}>
        {msg.content_type === 'image' && msg.media_url ? (
          <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-48 object-cover" />
        ) : msg.content_type === 'video' && msg.media_url ? (
          <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-48" />
        ) : msg.content_type === 'file' && msg.media_url ? (
          <a href={msg.media_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-brand-light underline">
            📎 {msg.content}
          </a>
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
      </div>
      {isOut && (
        <span className="text-xs text-slate-600 mt-0.5 px-1">
          <CheckCheck size={12} className="inline" />
        </span>
      )}
    </div>
  )
}
