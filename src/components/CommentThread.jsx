import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, CornerDownRight, Facebook, Instagram, Youtube, MessageCircle, Send } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'
import LinkifiedText from './LinkifiedText'

const PLATFORM_ICONS = {
  facebook: <Facebook size={13} className="text-blue-400" />,
  instagram: <Instagram size={13} className="text-pink-400" />,
  youtube: <Youtube size={13} className="text-red-500" />,
}

// محادثة تعليق: التعليق الأساسي ومعاه كل الردود الفرعية تحته (وردود الصفحة). التعليق اللي فتحت منه متعلّم،
// وأي تعليق (الأساسي أو فرعي) تقدر ترد عليه علنًا من هنا
export default function CommentThread({ comment, onClose, onReplied }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [replyId, setReplyId] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_URL}/comments/${comment.id}/thread`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (err) { setError(err.message) }
  }, [comment.id])

  useEffect(() => { load() }, [load])

  const send = async () => {
    if (!text.trim() || !replyId) return
    setSending(true)
    try {
      const r = await apiFetch(`${API_URL}/comments/${comment.id}/thread-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: replyId, message: text.trim() })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(t('comments.publicReplyDone'))
      setReplyId(null); setText('')
      onReplied?.()
      load()
    } catch (err) { toast.error(err.message) } finally { setSending(false) }
  }

  const renderItem = (it, root) => {
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
        {!it.is_page && replyId !== it.id && (
          <button type="button" onClick={() => { setReplyId(it.id); setText('') }}
            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-brand/10 text-brand hover:bg-brand/20">
            <MessageCircle size={12} /> {t('comments.thread.reply')}
          </button>
        )}
        {replyId === it.id && (
          <div className="mt-2 space-y-1.5">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus maxLength={1500} dir="auto"
              placeholder={t('comments.thread.replyPlaceholder', { name: it.author_name || '' })}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={send} disabled={sending || !text.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand text-white disabled:opacity-40">
                <Send size={12} /> {t('comments.thread.send')}
              </button>
              <button type="button" onClick={() => { setReplyId(null); setText('') }} disabled={sending}
                className="px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg-muted hover:text-fg">{t('comments.thread.cancel')}</button>
              <span className="ms-auto text-[10px] text-fg-subtle">{t('comments.thread.publicHint')}</span>
            </div>
          </div>
        )}
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
          {error && !data && <p className="text-xs text-danger text-center py-6">{error}</p>}
          {data && (<>
            {data.root
              ? renderItem(data.root, true)
              : <p className="text-[12px] text-fg-subtle bg-surface rounded-xl p-3">{t('comments.thread.missingRoot')}</p>}
            {data.replies.length === 0 && <p className="text-[12px] text-fg-subtle text-center py-3">{t('comments.thread.noReplies')}</p>}
            {data.replies.map(it => (
              <div key={it.id} className="flex items-start gap-1.5 ps-4">
                <CornerDownRight size={13} className="mt-3 flex-shrink-0 text-fg-subtle rtl:-scale-x-100" />
                <div className="flex-1 min-w-0">{renderItem(it, false)}</div>
              </div>
            ))}
            {data.source === 'db' && <p className="text-[10px] text-fg-subtle text-center pt-1">{t('comments.thread.fromDb')}</p>}
          </>)}
        </div>
      </div>
    </div>
  )
}
