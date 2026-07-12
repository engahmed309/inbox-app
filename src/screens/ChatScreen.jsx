import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ContactSidebar from '../components/ContactSidebar'
import {
  ArrowRight, Send, Paperclip, ChevronDown,
  User, CheckCheck, Facebook, Instagram, Phone, Mic, Trash2
} from 'lucide-react'

const STATUS_OPTS = [
  { key: 'open', label: 'مفتوحة', color: 'bg-success' },
  { key: 'follow_up', label: 'متابعة', color: 'bg-follow' },
  { key: 'closed', label: 'مغلقة', color: 'bg-slate-500' },
]

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
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const messagesEndRef = useRef(null)
  const realtimeRef = useRef(null)
  const fileInputRef = useRef(null)
  const tempIdRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordTimerRef = useRef(null)

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }, 30)
  }, [])

  // ─── جيب الرسائل من الـ DB ────────────────────────────
  const fetchMessages = useCallback(async (scroll = true) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    if (scroll) scrollToBottom()
  }, [id, scrollToBottom])

  useEffect(() => {
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
          .from('agents').select('name').eq('id', convData.assigned_agent_id).single()
        if (ag) setConv(prev => ({ ...prev, agentName: ag.name }))
      }

      // Messages
      await fetchMessages(false)
      scrollToBottom(false)

      // Mark as read
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)

      // Agents list (لأي agent يقدر يعيّن/يستلم محادثات)
      const { data: ags } = await supabase.from('agents').select('id, name, is_online, status').order('name')
      setAgents(ags || [])
    }

    loadData()

    // ─── Realtime ─────────────────────────────────────────
    if (realtimeRef.current) realtimeRef.current.unsubscribe()
    realtimeRef.current = supabase
      .channel(`messages-${id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`
      }, (payload) => {
        const newMsg = payload.new
        setMessages(prev => {
          // شيل أي temp messages وضيف الحقيقي
          const withoutTemps = prev.filter(m => !m._temp)
          if (withoutTemps.find(m => m.id === newMsg.id)) return withoutTemps
          return [...withoutTemps, newMsg]
        })
        scrollToBottom()
        // Mark as read
        supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
      })
      .subscribe()

    return () => realtimeRef.current?.unsubscribe()
  }, [id])

  // ─── Send Message ─────────────────────────────────────
  const sendMessage = async () => {
    if (!text.trim() || sending) return
    const msgText = text.trim()
    setText('')
    setSending(true)

    // Optimistic — ضيف فوراً
    const tempId = `temp-${Date.now()}`
    tempIdRef.current = tempId
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: id,
      direction: 'outbound',
      content: msgText,
      content_type: 'text',
      created_at: new Date().toISOString(),
      _temp: true,
    }])
    scrollToBottom()

    try {
      const res = await fetch(`${API_URL}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, content: msgText, agent_id: agent?.id })
      })
      if (!res.ok) throw new Error()
      // جيب الرسائل الحقيقية من الـ DB وشيل الـ temp
      await fetchMessages()
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(msgText)
      alert('فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  const changeStatus = async (s) => {
    await supabase.from('conversations').update({ status: s }).eq('id', id)
    setConv(prev => ({ ...prev, status: s }))
    setShowStatus(false)
  }

  const assignAgent = async (agentId) => {
    await supabase.from('conversations').update({ assigned_agent_id: agentId }).eq('id', id)
    const ag = agents.find(a => a.id === agentId)
    setConv(prev => ({ ...prev, agentName: ag?.name }))
    setShowAssign(false)
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const path = `media/${id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('inbox-media').upload(path, file)
    if (error) { alert('فشل رفع الملف'); return }
    const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
    const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'file'
    await fetch(`${API_URL}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: id, content: file.name, content_type: type, media_url: urlData.publicUrl, agent_id: agent?.id })
    })
    await fetchMessages()
  }

  // ─── تسجيل الرسائل الصوتية ─────────────────────────────
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
      alert('لازم تسمح بالوصول للميكروفون')
    }
  }

  const stopRecording = (send) => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    clearInterval(recordTimerRef.current)
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
      if (!send) return
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const path = `media/${id}/${Date.now()}_voice.webm`
      const { error } = await supabase.storage.from('inbox-media').upload(path, blob, { contentType: 'audio/webm' })
      if (error) { alert('فشل رفع الرسالة الصوتية'); return }
      const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
      await fetch(`${API_URL}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, content: 'رسالة صوتية', content_type: 'audio', media_url: urlData.publicUrl, agent_id: agent?.id })
      })
      await fetchMessages()
    }
    recorder.stop()
  }

  const currentStatus = STATUS_OPTS.find(s => s.key === conv?.status) || STATUS_OPTS[0]
  const PlatformIcon = conv?.platform === 'instagram' ? Instagram : conv?.platform === 'whatsapp' ? Phone : Facebook

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white flex-shrink-0">
          <ArrowRight size={20} />
        </button>

        <button onClick={() => setShowSidebar(true)} className="flex items-center gap-2 flex-1 min-w-0 text-right">
          {contact?.profile_pic ? (
            <img src={contact.profile_pic} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt=""
              onError={e => e.target.style.display = 'none'} />
          ) : (
            <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-slate-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{contact?.name || 'مجهول'}</p>
            <div className="flex items-center gap-1">
              <PlatformIcon size={11} className="text-slate-400" />
              <span className="text-xs text-slate-400 truncate">{conv?.agentName || 'غير معين'}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="relative">
            <button onClick={() => { setShowAssign(!showAssign); setShowStatus(false) }}
              className="px-2.5 py-1.5 text-xs bg-surface-3 rounded-lg text-slate-300 hover:text-white">
              تعيين
            </button>
            {showAssign && (
              <div className="absolute left-0 top-full mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
                {agents.map(ag => (
                  <button key={ag.id} onClick={() => assignAgent(ag.id)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3 text-sm text-right">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ag.status === 'busy' ? 'bg-follow' : ag.is_online ? 'bg-success' : 'bg-slate-500'}`} />
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3"
        onClick={() => { setShowStatus(false); setShowAssign(false) }}>
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-surface-3" />
              <span className="text-xs text-slate-500 px-2">{date}</span>
              <div className="flex-1 h-px bg-surface-3" />
            </div>
            <div className="space-y-1">
              {msgs.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} prev={msgs[i - 1]} />
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input */}
      <div className="px-3 py-3 bg-surface-2 border-t border-surface-3">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <button onClick={() => stopRecording(false)}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-danger hover:bg-surface-3 rounded-xl transition-colors">
              <Trash2 size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-white">
              <span className="w-2 h-2 rounded-full bg-danger pulse-dot" />
              جاري التسجيل... {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
            </div>
            <button onClick={() => stopRecording(true)}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors">
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx" />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-surface-3 transition-colors">
              <Paperclip size={18} />
            </button>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="اكتب رسالة..."
              rows={1}
              className="flex-1 bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand resize-none min-h-[42px] max-h-[120px]"
            />
            {text.trim() ? (
              <button onClick={sendMessage} disabled={sending}
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors disabled:opacity-40">
                {sending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send size={16} />
                }
              </button>
            ) : (
              <button onClick={startRecording}
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-surface-3 transition-colors">
                <Mic size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      {showSidebar && (
        <ContactSidebar contact={contact} conv={conv}
          onClose={() => setShowSidebar(false)} onUpdate={setContact} />
      )}
    </div>
  )
}

function MessageBubble({ msg, prev }) {
  const isOut = msg.direction === 'outbound'
  const isTemp = msg._temp
  const showTime = !prev ||
    Math.abs(new Date(msg.created_at) - new Date(prev.created_at)) > 300000

  return (
    <div className={`flex flex-col mb-1 ${isOut ? 'items-end' : 'items-start'}`}>
      {showTime && !isTemp && (
        <span className="text-xs text-slate-600 mb-1 px-1">{formatTime(msg.created_at)}</span>
      )}
      <div className={`max-w-[78%] px-3.5 py-2.5 text-sm text-white transition-opacity
        ${isOut ? 'msg-out' : 'msg-in'}
        ${isTemp ? 'opacity-50' : 'opacity-100 slide-in'}`}>
        {msg.content_type === 'image' && msg.media_url ? (
          <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-48 object-cover" />
        ) : msg.content_type === 'video' && msg.media_url ? (
          <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-48" />
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
        <span className="text-xs text-slate-600 mt-0.5 px-1">
          {isTemp ? <span className="animate-pulse">...</span> : <CheckCheck size={12} className="inline" />}
        </span>
      )}
    </div>
  )
}
