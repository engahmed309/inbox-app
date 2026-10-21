import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Facebook, Instagram, Youtube, ChevronRight, Search, CornerDownRight, ExternalLink } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime, formatTime as localeFormatTime } from '../lib/locale'
import LinkifiedText from './LinkifiedText'

const PAGE = 50
const REFRESH_MS = 10000
const PLATFORMS = [
  { key: 'facebook', Icon: Facebook, tone: 'text-blue-400' },
  { key: 'instagram', Icon: Instagram, tone: 'text-pink-400' },
  { key: 'youtube', Icon: Youtube, tone: 'text-red-500' },
]

const minutes = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000))
const spinner = <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

// تبويب اللايفات: كل لايف كارت لوحده، وجواه تعليقاته (الأحدث فوق) بفلتر المنصة وبحث. قراءة بس — تعليقات اللايف مابيتردّش عليها
export default function CommentsLives() {
  const { t } = useTranslation()
  const toast = useToast()
  const [lives, setLives] = useState(null)
  const [open, setOpen] = useState(null)   // الـlive المفتوح (start كمفتاح)

  const loadLives = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/lives`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setLives(d.lives || [])
    } catch (err) { setLives(prev => prev || []); toast.error(err.message) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLives() }, [loadLives])
  // لو فيه لايف شغال: الكروت بتتحدّث لوحدها
  const anyLive = !!lives?.some(l => l.is_live)
  useEffect(() => {
    if (!anyLive || open) return
    const id = setInterval(loadLives, REFRESH_MS)
    return () => clearInterval(id)
  }, [anyLive, open, loadLives])

  const current = open && lives?.find(l => l.start === open)
  if (open && current) return <LiveDetail t={t} toast={toast} live={current} onBack={() => setOpen(null)} onRefreshLives={loadLives} />

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-2 pb-24">
        <div className="px-1 pb-1">
          <p className="text-sm font-semibold text-fg">{t('comments.lives.title')}</p>
          <p className="text-[11px] text-fg-subtle mt-0.5">{t('comments.lives.hint')}</p>
        </div>
        {lives === null && spinner}
        {lives && !lives.length && <p className="py-10 text-center text-xs text-fg-subtle">{t('comments.lives.empty')}</p>}
        {lives?.map(l => (
          <button key={l.start} onClick={() => setOpen(l.start)}
            className="w-full text-start bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-2xl p-3.5 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-fg flex-1 min-w-0 truncate">{localeFormatDateTime(l.start)}</span>
              {l.is_live && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger/15 text-danger animate-pulse">🔴 {t('comments.lives.liveNow')}</span>}
              <ChevronRight size={16} className="text-fg-subtle flex-shrink-0 rtl:rotate-180" />
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-[12px] text-fg-muted">
              <span className="font-semibold text-fg">{t('comments.lives.comments', { n: l.total })}</span>
              <span>{t('comments.lives.duration', { n: minutes(l.start, l.end) })}</span>
              {PLATFORMS.map(({ key, Icon, tone }) => l[key] > 0 && (
                <span key={key} className="inline-flex items-center gap-1"><Icon size={12} className={tone} />{l[key]}</span>
              ))}
              {l.held > 0 && <span className="text-amber-500">{t('comments.lives.held', { n: l.held })}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function LiveDetail({ t, toast, live, onBack, onRefreshLives }) {
  const [platform, setPlatform] = useState('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const rowsLen = useRef(0)
  rowsLen.current = rows.length

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(async (offset = 0, silent = false) => {
    if (!silent) setLoading(true)
    try {
      // اللايف الشغال بيكبر: النهاية وقت الطلب نفسه (مش وقت ما الدالة اتعرّفت) عشان التحديث التلقائي يلقط الجديد
      const end = live.is_live ? new Date(Date.now() + 60000).toISOString() : live.end
      const res = await apiFetch(`${API_URL}/comments/lives/comments?start=${encodeURIComponent(live.start)}&end=${encodeURIComponent(end)}&platform=${platform}&q=${encodeURIComponent(debounced)}&limit=${PAGE}&offset=${offset}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setRows(prev => (offset ? [...prev, ...d.comments] : d.comments))
      setHasMore(!!d.hasMore)
    } catch (err) { if (!silent) toast.error(err.message) } finally { setLoading(false) }
  }, [live.start, live.is_live, platform, debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0) }, [load])
  // لايف شغال: أول صفحة بتتحدّث لوحدها (ومعاها الكروت) من غير ما نرجّع الموظف لفوق لو نزّل صفحات أكتر
  useEffect(() => {
    if (!live.is_live) return
    const id = setInterval(() => { onRefreshLives(); if (rowsLen.current <= PAGE) load(0, true) }, REFRESH_MS)
    return () => clearInterval(id)
  }, [live.is_live, load, onRefreshLives])

  const pill = (active) => `px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
          <ChevronRight size={14} className="rotate-180 rtl:rotate-0" />{t('comments.lives.back')}
        </button>
        <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg flex-1">{localeFormatDateTime(live.start)}</span>
            {live.is_live && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger/15 text-danger animate-pulse">🔴 {t('comments.lives.liveNow')}</span>}
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            {t('comments.lives.comments', { n: live.total })} · {t('comments.lives.duration', { n: minutes(live.start, live.end) })}
            {live.is_live && <> · <span className="text-success">{t('comments.lives.autoRefresh')}</span></>}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setPlatform('all')} className={pill(platform === 'all')}>{t('comments.lives.all')} <span className="tabular-nums opacity-80">{live.total}</span></button>
          {PLATFORMS.map(({ key, Icon, tone }) => live[key] > 0 && (
            <button key={key} onClick={() => setPlatform(key)} className={pill(platform === key)}>
              <Icon size={12} className={platform === key ? '' : tone} /><span className="tabular-nums">{live[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-fg-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('comments.lives.search')}
            className="w-full ps-9 pe-3 py-2 rounded-xl bg-surface-2 border border-surface-3 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none focus:border-brand" />
        </div>

        {loading && !rows.length && spinner}
        {!loading && !rows.length && <p className="py-8 text-center text-xs text-fg-subtle">{t('comments.lives.emptyLive')}</p>}

        <div className="space-y-1.5">
          {rows.map(c => {
            const P = PLATFORMS.find(p => p.key === c.platform)
            return (
              <div key={c.id} className="bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  {P && <P.Icon size={12} className={P.tone} />}
                  <span className="text-[13px] font-semibold text-fg truncate">{c.author_name || '—'}</span>
                  {c.parent_comment_id && <span className="inline-flex items-center gap-0.5"><CornerDownRight size={11} />{t('comments.lives.reply')}</span>}
                  <span className="flex-1" />
                  {c.mod_status === 'pending' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">⚠</span>}
                  <span className="tabular-nums">{localeFormatTime(c.posted_at || c.created_at)}</span>
                </div>
                <div className="mt-1 text-[13px] text-fg whitespace-pre-wrap break-words" dir="auto">
                  {c.content ? <LinkifiedText text={c.content} /> : <span className="text-fg-subtle">{c.media_type ? `[${c.media_type}]` : t('comments.lives.noText')}</span>}
                </div>
                {c.media_url && <a href={c.media_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline"><ExternalLink size={11} />{c.media_type || 'media'}</a>}
              </div>
            )
          })}
        </div>
        {hasMore && <button disabled={loading} onClick={() => load(rows.length)} className="w-full py-2 rounded-lg bg-surface-3 text-xs text-fg-muted hover:text-fg">{t('comments.lives.loadMore')}</button>}
      </div>
    </div>
  )
}
