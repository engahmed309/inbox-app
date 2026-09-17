import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { PhoneIncoming, PhoneMissed, Phone, MessageSquare, Clock } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const TABS = ['all', 'answered', 'missed']
const PAGE_SIZE = 30

// الحالات اللي معناها "محدش اتكلم مع العميل" بتتعرض كلها كمكالمة فايتة، بس بسبب مختلف
const MISSED = ['missed', 'rejected', 'failed']

export default function CallsScreen() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [calls, setCalls] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef(null)

  const canSee = agent?.role === 'admin' ||
    (['messages', 'both'].includes(agent?.access_scope) && agent?.can_view_calls !== false)

  const load = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        apiFetch(`${API_URL}/calls?status=${tab}&limit=${PAGE_SIZE}`),
        apiFetch(`${API_URL}/calls/counts`)
      ])
      const listData = await listRes.json()
      if (listRes.ok) { setCalls(listData.calls || []); setHasMore(!!listData.hasMore) }
      const countData = await countRes.json()
      if (countRes.ok) setCounts(countData.counts || {})
    } catch { /* بنسيب المعروض زي ما هو */ } finally { setLoading(false) }
  }, [tab])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await apiFetch(`${API_URL}/calls?status=${tab}&limit=${PAGE_SIZE}&offset=${calls.length}`)
      const data = await res.json()
      if (res.ok) {
        setCalls(prev => {
          const seen = new Set(prev.map(c => c.id))
          return [...prev, ...(data.calls || []).filter(c => !seen.has(c.id))]
        })
        setHasMore(!!data.hasMore)
      }
    } catch { /* بنسيب اللي اتحمّل */ } finally { setLoadingMore(false) }
  }, [tab, calls.length, hasMore, loadingMore])

  useEffect(() => {
    if (!canSee) return
    setLoading(true); setCalls([]); load()
  }, [load, canSee])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore])

  if (!canSee) return (
    <div className="h-full flex items-center justify-center text-fg-muted p-6 text-center">
      <p>{t('callsLog.noAccess')}</p>
    </div>
  )

  const fmtDuration = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate('/')} className="text-fg-muted hover:text-fg"><BackArrow /></button>
        <span className="font-bold text-fg flex-1">{t('callsLog.title')}</span>
      </div>

      <div className="flex gap-1.5 px-4 py-2 bg-surface-2 border-b border-surface-3 overflow-x-auto">
        {TABS.map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${tab === s ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
            {t(`callsLog.tabs.${s}`)}{counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-fg-subtle gap-2">
            <Phone size={32} className="opacity-20" />
            <p className="text-sm">{t('callsLog.empty')}</p>
          </div>
        ) : calls.map(c => {
          const missed = MISSED.includes(c.status)
          const dur = fmtDuration(c.duration_seconds)
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-surface-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${missed ? 'bg-danger/10' : 'bg-success/10'}`}>
                {missed ? <PhoneMissed size={15} className="text-danger" /> : <PhoneIncoming size={15} className="text-success" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg truncate">
                  {c.contacts?.name || c.from_number}
                </p>
                <p className="text-[11px] text-fg-subtle truncate">
                  {missed
                    ? t(`callsLog.status.${c.status}`)
                    : t('callsLog.answeredBy', { name: c.agents?.name || '—' })}
                  {dur && <span className="ms-1.5"><Clock size={9} className="inline align-[-1px]" /> {dur}</span>}
                  {c.channels && <span className="ms-1.5">· {c.channels.custom_name || c.channels.display_name}</span>}
                </p>
                {/* "فاتت" لوحدها مش كفاية — مين كان فاتح البرنامج وقتها وسابها ترن؟ */}
                {missed && c.notified_agents?.length > 0 && (
                  <p className="text-[10px] text-warning truncate mt-0.5">
                    {t('callsLog.shownTo', { names: c.notified_agents.join('، ') })}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-fg-subtle">{localeFormatDateTime(c.ringing_at)}</span>
                {c.conversation_id && (
                  <button onClick={() => navigate(`/chat/${c.conversation_id}`)} title={t('callsLog.openChat')}
                    className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
                    <MessageSquare size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
