import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../lib/locale'
import { Bell, Check, X, UserPlus, Tag, Clock } from 'lucide-react'

// جرس الإشعارات — ثابت فوق كل الشاشات بعد تسجيل الدخول. أول استخدام له طلبات نقل المحادثات
// بين الموظفين، وممكن نضيفله أنواع تانية بعدين بنفس الشكل
export default function NotificationBell() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState('all') // 'all' | 'unread' | 'read'
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const wrapRef = useRef(null)
  // الـrealtime callback بيتعمل مرة واحدة لكل موظف، فبيقرا الفلتر الحالي من ref مش من الـstate
  const filterRef = useRef(filter)
  filterRef.current = filter

  // الفلتر بيتطبّق في الكويري نفسه (مش على أول ٣٠ إشعار محمّلين بس) — وعداد غير المقروءة على
  // الجرس كويري منفصل، عشان يفضل صح حتى لو الفلتر المختار "المقروءة"
  const load = async () => {
    if (!agent?.id) return
    let q = supabase
      .from('notifications')
      .select('*, from_agent:from_agent_id(name), conversations(id, contacts(name))')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (filterRef.current === 'unread') q = q.eq('is_read', false)
    else if (filterRef.current === 'read') q = q.eq('is_read', true)
    const [{ data, error }, { count }] = await Promise.all([
      q,
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('agent_id', agent.id).eq('is_read', false)
    ])
    if (error) { console.error('فشل تحميل الإشعارات:', error.message); return }
    setItems(data || [])
    setUnreadCount(count || 0)
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

  const filterMountedRef = useRef(false)
  useEffect(() => {
    if (!filterMountedRef.current) { filterMountedRef.current = true; return } // أول تحميل بيعمله الـeffect اللي فوق
    load()
  }, [filter])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markRead = async (n) => {
    if (n.is_read) return
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    if (error) { console.error('فشل تعليم الإشعار كمقروء:', error.message); return }
    // بتفضل ظاهرة في مكانها حتى في فلتر "غير المقروءة" لحد ما القايمة تتحدّث، بدل ما تختفي من تحت إيد المستخدم
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    setUnreadCount(c => Math.max(0, c - 1))
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
      const res = await apiFetch(`${API_URL}/notifications/${n.id}/respond-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('notificationBell.respondFailed'))
      toast.success(accept ? t('notificationBell.transferAccepted') : t('notificationBell.requestRejected'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  const respondAdminRequest = async (n, accept) => {
    setBusyId(n.id)
    try {
      const res = await apiFetch(`${API_URL}/admin-requests/${n.request_id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, admin_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('notificationBell.respondFailed'))
      toast.success(accept ? t('notificationBell.addedSuccess') : t('notificationBell.requestRejected'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  if (!agent) return null

  return (
    <div ref={wrapRef} className="fixed z-[60] end-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <button onClick={() => setOpen(v => !v)} title={t('notificationBell.title')}
        className="relative w-10 h-10 flex items-center justify-center bg-surface-2 border border-surface-3 rounded-full shadow-lg text-fg-muted hover:text-fg transition-colors">
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -start-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-danger text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full end-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-surface-2 border border-surface-3 rounded-2xl shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-surface-3 font-semibold text-sm text-fg">{t('notificationBell.title')}</div>
          <div className="flex gap-1.5 px-3 py-2 border-b border-surface-3">
            {['all', 'unread', 'read'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
                {t(`notificationBell.filter${f[0].toUpperCase()}${f.slice(1)}`)}
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <p className="text-center text-fg-subtle text-sm py-8">{t('notificationBell.noNotifications')}</p>
          )}
          {items.map(n => (
            <div key={n.id} onClick={() => openNotification(n)}
              className={`px-4 py-3 border-b border-surface-3 last:border-0 cursor-pointer hover:bg-surface-3/40 transition-colors ${!n.is_read ? 'bg-brand/5' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n.type === 'admin_request' ? <Tag size={13} className="text-brand" />
                    : n.type === 'response_delay' ? <Clock size={13} className="text-danger" />
                    : <UserPlus size={13} className="text-brand" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-fg-muted mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-fg-subtle mt-1">{formatDateTime(n.created_at, { dateStyle: 'short', timeStyle: 'short' })}</p>

                  {n.type === 'transfer_request' && n.action_status === 'pending' && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => respondTransfer(n, true)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success text-white disabled:opacity-50">
                        <Check size={12} /> {t('notificationBell.approve')}
                      </button>
                      <button onClick={() => respondTransfer(n, false)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted disabled:opacity-50">
                        <X size={12} /> {t('notificationBell.reject')}
                      </button>
                    </div>
                  )}
                  {n.type === 'admin_request' && n.action_status === 'pending' && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => respondAdminRequest(n, true)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success text-white disabled:opacity-50">
                        <Check size={12} /> {t('notificationBell.approve')}
                      </button>
                      <button onClick={() => respondAdminRequest(n, false)} disabled={busyId === n.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-fg-muted disabled:opacity-50">
                        <X size={12} /> {t('notificationBell.reject')}
                      </button>
                    </div>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'accepted' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">{t('notificationBell.approvedStatus')}</span>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'approved' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">{t('notificationBell.approvedStatus')}</span>
                  )}
                  {['transfer_request', 'admin_request'].includes(n.type) && n.action_status === 'rejected' && (
                    <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger">{t('notificationBell.rejectedStatus')}</span>
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
