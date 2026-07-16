import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Bell, Check, X, UserPlus, Tag } from 'lucide-react'

// جرس الإشعارات — ثابت فوق كل الشاشات بعد تسجيل الدخول. أول استخدام له طلبات نقل المحادثات
// بين الموظفين، وممكن نضيفله أنواع تانية بعدين بنفس الشكل
export default function NotificationBell() {
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const wrapRef = useRef(null)

  const unreadCount = items.filter(n => !n.is_read).length

  const load = async () => {
    if (!agent?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*, from_agent:from_agent_id(name), conversations(id, contacts(name))')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }

  useEffect(() => {
    if (!agent?.id) return
    load()
    const channel = supabase
      .channel(`notifications-${agent.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `agent_id=eq.${agent.id}` }, () => {
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agent?.id])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markRead = async (n) => {
    if (n.is_read) return
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
  }

  const openNotification = (n) => {
    markRead(n)
    if (!['transfer_request', 'admin_request'].includes(n.type) && n.conversation_id) {
      setOpen(false)
      navigate(`/chat/${n.conversation_id}`)
    }
  }

  const respondTransfer = async (n, accept) => {
    setBusyId(n.id)
    try {
      const res = await fetch(`${API_URL}/notifications/${n.id}/respond-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الرد على الطلب')
      toast.success(accept ? 'اتحولتلّه المحادثة' : 'اترفض الطلب')
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const respondAdminRequest = async (n, accept) => {
    setBusyId(n.id)
    try {
      const res = await fetch(`${API_URL}/admin-requests/${n.request_id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, admin_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الرد على الطلب')
      toast.success(accept ? 'اتضاف بنجاح' : 'اترفض الطلب')
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!agent) return null

  return (
    <div ref={wrapRef} className="relative">
      <button onClick={() => setOpen(v => !v)} title="الإشعارات"
        className="relative w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-danger text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-surface-2 border border-surface-3 rounded-2xl shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-surface-3 font-semibold text-sm text-fg">الإشعارات</div>
          {items.length === 0 && (
            <p className="text-center text-fg-subtle text-sm py-8">مفيش إشعارات</p>
          )}
          {items.map(n => (
            <div key={n.id} onClick={() => openNotification(n)}
              className={`px-4 py-3 border-b border-surface-3 last:border-0 cursor-pointer hover:bg-surface-3/40 transition-colors ${!n.is_read ? 'bg-brand/5' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n.type === 'admin_request' ? <Tag size={13} className="text-brand" /> : <UserPlus size={13} className="text-brand" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-fg-muted mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-fg-subtle mt-1">{new Date(n.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</p>

                  {n.type === 'transfer_request' && n.action_status === 'pending' && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => respondTransfer(n, true)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success text-white disabled:opacity-50">
                        <Check size={12} /> موافقة
                      </button>
                      <button onClick={() => respondTransfer(n, false)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted disabled:opacity-50">
                        <X size={12} /> رفض
                      </button>
                    </div>
                  )}
                  {n.type === 'admin_request' && n.action_status === 'pending' && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => respondAdminRequest(n, true)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success text-white disabled:opacity-50">
                        <Check size={12} /> موافقة
                      </button>
                      <button onClick={() => respondAdminRequest(n, false)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted disabled:opacity-50">
                        <X size={12} /> رفض
                      </button>
                    </div>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'accepted' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">تمت الموافقة</span>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'approved' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">تمت الموافقة</span>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'rejected' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger">اترفض</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
