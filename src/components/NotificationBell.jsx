import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../lib/locale'
import { Bell, Check, X, UserPlus, Tag, Clock, ShieldAlert, Bot, ArrowLeftRight, Server, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react'

const NOTIFICATIONS_PAGE_SIZE = 30

// الإشعارات متقسّمة لأقسام عشان ماتتلخبطش: التأخيرات (وفلتر بالموظف)، مشاكل الكومنتات (للأدمن)، وطلبات الموظفين
// (طلبات نقل المحادثات وطلبات إضافة تاج/رد سريع/باقة وردودها). كل قسم له عدّاد غير المقروء الخاص بيه
const TABS = [
  { key: 'delays', types: ['response_delay'], icon: Clock },
  { key: 'comments', types: ['comment_problem', 'system_alert', 'comment_insight'], icon: ShieldAlert, adminOnly: true },
  { key: 'requests', types: ['transfer_request', 'transfer_response', 'admin_request', 'request_response'], icon: UserPlus },
  // التقرير الأسبوعي وتنبيهات أداء الموظفين (للأدمن): الضغط عليها بيفتح التقرير المجمّع على الفترة المناسبة
  { key: 'reports', types: ['weekly_report', 'agent_alert'], icon: BarChart3, adminOnly: true },
]
const ACTIONABLE = ['transfer_request', 'admin_request']
// "_" و"%" معناها حاجة في ilike، فبنهرّبها عشان اسم موظف فيه واحد منهم مايبوّظش الفلتر
const escapeLike = (s) => s.replace(/[\\%_]/g, m => `\\${m}`)

// جرس الإشعارات — ثابت فوق كل الشاشات بعد تسجيل الدخول
export default function NotificationBell() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const isAdmin = agent?.role === 'admin'
  const tabs = TABS.filter(x => !x.adminOnly || isAdmin)

  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({ delays: 0, comments: 0, requests: 0, reports: 0 })   // غير المقروء لكل قسم
  const [tab, setTab] = useState('delays')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [employee, setEmployee] = useState('all')   // 'all' | 'none' | اسم الموظف — فلتر تبويب التأخيرات (للأدمن)
  const [employees, setEmployees] = useState([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const wrapRef = useRef(null)
  // الـrealtime callback بيتعمل مرة واحدة لكل موظف، فبيقرا الاختيارات الحالية من ref مش من الـstate
  const viewRef = useRef({ tab, unreadOnly, employee })
  viewRef.current = { tab, unreadOnly, employee }
  const loadedCountRef = useRef(0)

  const totalUnread = tabs.reduce((s, x) => s + (counts[x.key] || 0), 0)

  const buildQuery = (offset, limit) => {
    const { tab: tk, unreadOnly: uo, employee: emp } = viewRef.current
    const def = TABS.find(x => x.key === tk) || TABS[0]
    let q = supabase
      .from('notifications')
      .select('*, from_agent:from_agent_id(name), conversations(id, contacts(name))')
      .eq('agent_id', agent.id)
      .in('type', def.types)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (uo) q = q.eq('is_read', false)
    if (tk === 'delays' && emp !== 'all') {
      q = emp === 'none' ? q.ilike('title', '%بدون موظف%') : q.ilike('title', `%— ${escapeLike(emp)}`)
    }
    return q
  }

  const countUnread = (types) => supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id).eq('is_read', false).in('type', types)

  // دايمًا بيرجّع لأول صفحة من القسم الحالي (أول تحميل، تغيير القسم/الفلتر، أو أي حدث لحظي جديد)
  // القايمة نفسها (استعلام فيه joins) بتتجاب بس والجرس مفتوح؛ وهو مقفول بنحدّث الأرقام بس — كل إشعار جديد كان بيعمل
  // ٤ استعلامات على كل جهاز للأدمن حتى والجرس مقفول (جزء من حمل الداتابيز يوم ١٩ أكتوبر)
  const openRef = useRef(false)
  openRef.current = open
  const load = async () => {
    if (!agent?.id) return
    const withList = openRef.current
    const [listRes, ...unread] = await Promise.all([
      withList ? buildQuery(0, NOTIFICATIONS_PAGE_SIZE) : Promise.resolve(null),
      ...TABS.map(x => countUnread(x.types))
    ])
    setCounts(Object.fromEntries(TABS.map((x, i) => [x.key, unread[i]?.count || 0])))
    if (!withList) return
    const { data, error } = listRes
    if (error) { console.error('فشل تحميل الإشعارات:', error.message); return }
    setItems(data || [])
    loadedCountRef.current = (data || []).length
    setHasMore((data || []).length === NOTIFICATIONS_PAGE_SIZE)
  }
  // تجميع الأحداث اللحظية: ١٠ إشعارات ورا بعض = تحميل واحد بعد ثانيتين
  const loadTimerRef = useRef(null)
  const loadSoon = () => {
    clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(load, 2000)
  }

  const loadMore = async () => {
    if (!agent?.id || loadingMore) return
    setLoadingMore(true)
    const { data, error } = await buildQuery(loadedCountRef.current, NOTIFICATIONS_PAGE_SIZE)
    setLoadingMore(false)
    if (error) { console.error('فشل تحميل المزيد من الإشعارات:', error.message); return }
    setItems(prev => [...prev, ...(data || [])])
    loadedCountRef.current += (data || []).length
    setHasMore((data || []).length === NOTIFICATIONS_PAGE_SIZE)
  }

  useEffect(() => {
    if (!agent?.id) return
    load()
    const channel = supabase
      .channel(`notifications-${agent.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `agent_id=eq.${agent.id}` }, () => {
        loadSoon()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel); clearTimeout(loadTimerRef.current) }
  }, [agent?.id])

  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return } // أول تحميل بيعمله الـeffect اللي فوق
    load()
  }, [tab, unreadOnly, employee, open])

  // قايمة الموظفين لفلتر التأخيرات (الأدمن بس)
  useEffect(() => {
    if (!isAdmin || !open || employees.length) return
    supabase.from('agents').select('id, name').eq('role', 'agent').order('name')
      .then(({ data }) => { if (data?.length) setEmployees(data) })
  }, [isAdmin, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // أول ما الجرس يتفتح: لو القسم الحالي مفيهوش غير مقروء وفيه قسم تاني فيه، بنفتحه (الطلبات الأول لأنها محتاجة رد منك)
  useEffect(() => {
    if (!open) return
    if ((counts[tab] || 0) > 0) return
    const next = ['requests', 'reports', 'comments', 'delays'].find(k => tabs.some(x => x.key === k) && (counts[k] || 0) > 0)
    if (next && next !== tab) setTab(next)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // بتفضل ظاهرة في مكانها حتى مع "غير المقروءة فقط" لحد ما القايمة تتحدّث، بدل ما تختفي من تحت إيد المستخدم
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    const key = (TABS.find(x => x.types.includes(n.type)) || {}).key
    if (key) setCounts(c => ({ ...c, [key]: Math.max(0, (c[key] || 0) - 1) }))
  }

  // تحديد الكل كمقروء للقسم الحالي بس (مش كل الأقسام) — عشان ماتضيعش حاجة في قسم تاني
  const currentDef = TABS.find(x => x.key === tab) || TABS[0]
  const markAllRead = async () => {
    if (!agent?.id || !(counts[tab] > 0)) return
    const { error } = await supabase.from('notifications').update({ is_read: true })
      .eq('agent_id', agent.id).eq('is_read', false).in('type', currentDef.types)
    if (error) { console.error('فشل تحديد كل الإشعارات كمقروءة:', error.message); toast.error(t('notificationBell.markAllReadFailed')); return }
    setItems(prev => prev.map(x => ({ ...x, is_read: true })))
    setCounts(c => ({ ...c, [tab]: 0 }))
  }

  const openNotification = (n) => {
    markRead(n)
    if (n.type === 'comment_problem') { setOpen(false); navigate('/comments'); return }
    if (n.type === 'weekly_report' || n.type === 'agent_alert') {
      // الفترة اللي الإشعار عن (prev7 = آخر ٧ أيام كاملة) بيقراها التقرير المجمّع أول ما يفتح
      try { sessionStorage.setItem('consolidated.preset', n.type === 'weekly_report' ? 'prev7' : '7d') } catch { /* مش مهم */ }
      setOpen(false); navigate('/reports'); return
    }
    // منشور بينتشر: الرابط في آخر النص — بنفتح المنشور نفسه؛ الملخص اليومي بيفتح التعليقات
    if (n.type === 'comment_insight') {
      const link = (n.body || '').match(/https?:\/\/\S+/)?.[0]
      setOpen(false)
      if (link) window.open(link, '_blank', 'noopener'); else navigate('/comments')
      return
    }
    if (!ACTIONABLE.includes(n.type) && n.conversation_id) {
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

  const icon = (n) => {
    if (n.type === 'admin_request') return <Tag size={13} className="text-brand" />
    if (n.type === 'response_delay') return <Clock size={13} className="text-danger" />
    if (n.type === 'weekly_report') return <BarChart3 size={13} className="text-brand" />
    if (n.type === 'agent_alert') return <AlertTriangle size={13} className="text-amber-500" />
    if (n.type === 'comment_insight') return /🚀/.test(n.title || '') ? <TrendingUp size={13} className="text-success" /> : <BarChart3 size={13} className="text-brand" />
    if (n.type === 'system_alert') return <Server size={13} className={/✅/.test(n.title || '') ? 'text-success' : 'text-danger'} />
    if (n.type === 'comment_problem') return /الذكاء|لحد التكلفة/.test(n.title || '') ? <Bot size={13} className="text-amber-500" /> : <ShieldAlert size={13} className="text-danger" />
    if (n.type === 'transfer_response' || n.type === 'request_response') return <ArrowLeftRight size={13} className="text-fg-muted" />
    return <UserPlus size={13} className="text-brand" />
  }

  return (
    <div ref={wrapRef} className="fixed z-[60] end-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <button onClick={() => setOpen(v => !v)} title={t('notificationBell.title')}
        className="relative w-10 h-10 flex items-center justify-center bg-surface-2 border border-surface-3 rounded-full shadow-lg text-fg-muted hover:text-fg transition-colors">
        <Bell size={17} />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -start-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-danger text-white text-[10px] font-bold rounded-full">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full end-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[75vh] flex flex-col bg-surface-2 border border-surface-3 rounded-2xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3 flex-shrink-0">
            <span className="font-semibold text-sm text-fg">{t('notificationBell.title')}</span>
            {counts[tab] > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <Check size={12} /> {t('notificationBell.markAllRead')}
              </button>
            )}
          </div>

          {/* الأقسام */}
          <div className="flex gap-1 px-2 py-2 border-b border-surface-3 flex-shrink-0">
            {tabs.map(x => {
              const Icon = x.icon
              const active = tab === x.key
              return (
                <button key={x.key} onClick={() => setTab(x.key)}
                  className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
                  <span className="relative">
                    <Icon size={15} />
                    {counts[x.key] > 0 && (
                      <span className={`absolute -top-1.5 -end-2.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold ${active ? 'bg-white text-brand' : 'bg-danger text-white'}`}>
                        {counts[x.key] > 99 ? '99+' : counts[x.key]}
                      </span>
                    )}
                  </span>
                  <span className="truncate max-w-full">{t(`notificationBell.tab.${x.key}`)}</span>
                </button>
              )
            })}
          </div>

          {/* فلاتر القسم */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-3 flex-shrink-0">
            <button onClick={() => setUnreadOnly(v => !v)} aria-pressed={unreadOnly}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${unreadOnly ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
              {t('notificationBell.unreadOnly')}
            </button>
            {isAdmin && tab === 'delays' && (
              <select value={employee} onChange={e => setEmployee(e.target.value)}
                className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2 py-1 text-xs text-fg">
                <option value="all">{t('notificationBell.allEmployees')}</option>
                <option value="none">{t('notificationBell.noEmployee')}</option>
                {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-center text-fg-subtle text-sm py-8">{t(`notificationBell.empty.${tab}`)}</p>
            )}
            {items.map(n => (
              <div key={n.id} onClick={() => openNotification(n)}
                className={`px-4 py-3 border-b border-surface-3 last:border-0 cursor-pointer hover:bg-surface-3/40 transition-colors ${!n.is_read ? 'bg-brand/5' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 mt-0.5">{icon(n)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-fg-muted mt-0.5 whitespace-pre-line break-words">{n.type === 'comment_insight' ? n.body.replace(/\n?https?:\/\/\S+/, '') : n.body}</p>}
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
                    {ACTIONABLE.includes(n.type) && ['accepted', 'approved'].includes(n.action_status) && (
                      <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">{t('notificationBell.approvedStatus')}</span>
                    )}
                    {ACTIONABLE.includes(n.type) && n.action_status === 'rejected' && (
                      <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger">{t('notificationBell.rejectedStatus')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="px-4 py-3 text-center">
                <button onClick={loadMore} disabled={loadingMore}
                  className="text-xs font-medium text-brand hover:underline disabled:opacity-50">
                  {loadingMore ? t('notificationBell.loading') : t('notificationBell.loadMore')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
