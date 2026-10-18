import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, CornerDownRight, Facebook, Instagram, Youtube } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'
import LinkifiedText from './LinkifiedText'

const PLATFORM_ICONS = {
  facebook: <Facebook size={13} className="text-blue-400" />,
  instagram: <Instagram size={13} className="text-pink-400" />,
  youtube: <Youtube size={13} className="text-red-500" />,
}

// محادثة تعليق: التعليق الأساسي ومعاه كل الردود الفرعية تحته (وردود الصفحة). التعليق اللي فتحت منه متعلّم
export default function CommentThread({ comment, onClose }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    apiFetch(`${API_URL}/comments/${comment.id}/thread`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setData(d) })
      .catch(err => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [comment.id])

  const Item = ({ it, root }) => {
    const current = data && it.id === data.current_id
    return (
      <div className={`rounded-xl border p-3 ${it.is_page ? 'bg-brand/10 border-brand/30' : 'bg-surface border-surface-3'} ${current ? 'ring-2 ring-brand' : ''}`}>
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-fg-subtle">
          {root && PLATFORM_ICONS[data.platform]}
          <span className="text-fg font-semibold text-[13px]">{it.is_page ? t('comments.thread.page') : (it.author_name || t('comments.unknownAuthor'))}</span>
          {current && <span className="px-1.5 py-0.5 rounded-full bg-brand/15 text-brand text-[10px]">{t('comments.thread.current')}</span>}
          {it.posted_at && <span className="ms-auto">{localeFormatDateTime(it.posted_at)}</span>}
        </div>
        <LinkifiedText text={it.content || ''} className="block text-sm text-fg whitespace-pre-wrap break-words mt-1" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-surface-2 rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-3">
          <span className="flex-1 font-semibold text-fg text-sm">{t('comments.thread.title')}</span>
          <button onClick={onClose} aria-label={t('comments.thread.close')} className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!data && !error && <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>}
          {error && <p className="text-xs text-danger text-center py-6">{error}</p>}
          {data && (<>
            {data.root
              ? <Item it={data.root} root />
              : <p className="text-[12px] text-fg-subtle bg-surface rounded-xl p-3">{t('comments.thread.missingRoot')}</p>}
            {data.replies.length === 0 && <p className="text-[12px] text-fg-subtle text-center py-3">{t('comments.thread.noReplies')}</p>}
            {data.replies.map(it => (
              <div key={it.id} className="flex items-start gap-1.5 ps-4">
                <CornerDownRight size={13} className="mt-3 flex-shrink-0 text-fg-subtle rtl:-scale-x-100" />
                <div className="flex-1 min-w-0"><Item it={it} /></div>
              </div>
            ))}
            {data.source === 'db' && <p className="text-[10px] text-fg-subtle text-center pt-1">{t('comments.thread.fromDb')}</p>}
          </>)}
        </div>
      </div>
    </div>
  )
}
