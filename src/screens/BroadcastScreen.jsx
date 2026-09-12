import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Plus, Megaphone, AlertTriangle, Send } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const BROADCAST_STATUS_KEYS = { draft: 'draft', previewed: 'previewed', sending: 'sending', completed: 'completed' }
const RECIPIENT_STATUS_KEYS = ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped_blocked']

export default function BroadcastScreen() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState('list') // 'list' | 'new' | 'detail'
  const [broadcasts, setBroadcasts] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  const fetchBroadcasts = useCallback(() => {
    apiFetch(`${API_URL}/broadcasts`).then(r => r.json()).then(d => setBroadcasts(d.broadcasts || [])).catch(() => {})
  }, [])
  useEffect(() => { if (agent?.role === 'admin') fetchBroadcasts() }, [agent, fetchBroadcasts])

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-fg-muted"><p>{t('reports.unauthorized')}</p></div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => view === 'list' ? navigate('/') : setView('list')} className="text-fg-muted hover:text-fg">
          <BackArrow />
        </button>
        <span className="font-bold text-fg flex-1">{t('broadcast.title')}</span>
        {view === 'list' && (
          <button onClick={() => setView('new')} className="flex items-center gap-1 text-sm text-brand font-medium">
            <Plus size={16} /> {t('broadcast.newButton')}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {view === 'list' && (
          <BroadcastListView broadcasts={broadcasts} onSelect={id => { setSelectedId(id); setView('detail') }} />
        )}
        {view === 'new' && (
          <BroadcastWizard onDone={id => { fetchBroadcasts(); setSelectedId(id); setView('detail') }} />
        )}
        {view === 'detail' && <BroadcastDetailView broadcastId={selectedId} />}
      </div>
    </div>
  )
}

function BroadcastListView({ broadcasts, onSelect }) {
  const { t } = useTranslation()
  if (!broadcasts.length) return (
    <div className="h-full flex flex-col items-center justify-center text-fg-subtle gap-2 p-6 text-center">
      <Megaphone size={32} />
      <p className="text-sm">{t('broadcast.list.empty')}</p>
    </div>
  )
  return (
    <div className="p-4 space-y-2 max-w-2xl mx-auto">
      {broadcasts.map(b => (
        <button key={b.id} onClick={() => onSelect(b.id)}
          className="w-full text-start bg-surface-2 rounded-xl p-4 border border-surface-3 hover:border-brand/50 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-fg text-sm truncate">{b.segment_name_snapshot}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
              b.status === 'completed' ? 'bg-brand/15 text-brand' : b.status === 'sending' ? 'bg-warning/15 text-warning' : 'bg-surface-3 text-fg-muted'}`}>
              {t(`broadcast.status.${BROADCAST_STATUS_KEYS[b.status] || b.status}`)}
            </span>
          </div>
          <p className="text-xs text-fg-muted mt-1">{t('broadcast.list.templateAndCount', { template: b.template_name, count: b.total_recipients })}</p>
          <p className="text-[11px] text-fg-subtle mt-1">{localeFormatDateTime(b.created_at)}</p>
        </button>
      ))}
    </div>
  )
}

function BroadcastDetailView({ broadcastId }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)

  const load = useCallback(() => {
    apiFetch(`${API_URL}/broadcasts/${broadcastId}`).then(r => r.json()).then(d => { if (!d.error) setData(d) }).catch(() => {})
  }, [broadcastId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000) // البرودكاست بيتبعت في الخلفية، فبنحدّث العرض كل ٥ ثواني لحد ما يخلص
    return () => clearInterval(interval)
  }, [load])

  if (!data) return <div className="p-6 text-center text-fg-subtle text-sm">{t('broadcast.detail.loading')}</div>

  const { broadcast, statusCounts, recipients } = data
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-surface-2 rounded-xl p-4 border border-surface-3">
        <p className="font-semibold text-fg">{broadcast.segment_name_snapshot}</p>
        <p className="text-xs text-fg-muted mt-1">{t('broadcast.list.templateAndCount', { template: broadcast.template_name, count: broadcast.total_recipients })}</p>
        <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          broadcast.status === 'completed' ? 'bg-brand/15 text-brand' : broadcast.status === 'sending' ? 'bg-warning/15 text-warning' : 'bg-surface-3 text-fg-muted'}`}>
          {t(`broadcast.status.${BROADCAST_STATUS_KEYS[broadcast.status] || broadcast.status}`)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {RECIPIENT_STATUS_KEYS.map(key => (
          <div key={key} className="bg-surface-2 rounded-xl p-3 border border-surface-3 text-center">
            <p className="text-lg font-bold text-fg">{statusCounts[key] || 0}</p>
            <p className="text-[11px] text-fg-muted">{t(`broadcast.recipientStatus.${key}`)}</p>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden flex">
          <div className="bg-brand h-full" style={{ width: `${((statusCounts.sent||0)+(statusCounts.delivered||0)+(statusCounts.read||0)) / total * 100}%` }} />
          <div className="bg-danger h-full" style={{ width: `${((statusCounts.failed||0)+(statusCounts.skipped_blocked||0)) / total * 100}%` }} />
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-fg-subtle mb-2">{t('broadcast.detail.recipientsHeading')}</p>
        <div className="space-y-1">
          {(recipients || []).map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm">
              <span className="truncate text-fg">{r.contacts?.name || r.contacts?.platform_id || '—'}</span>
              <span className="text-[11px] text-fg-muted flex-shrink-0">
                {t(`broadcast.recipientStatus.${r.status}`)}{r.status_reason ? ` — ${r.status_reason}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BroadcastWizard({ onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [segments, setSegments] = useState([])
  const [segmentId, setSegmentId] = useState('')
  const [channels, setChannels] = useState([])
  const [channelId, setChannelId] = useState('')
  const [templates, setTemplates] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [params, setParams] = useState([])
  const [openMessage, setOpenMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    apiFetch(`${API_URL}/segments`).then(r => r.json()).then(d => setSegments(d.segments || [])).catch(() => {})
    apiFetch(`${API_URL}/channels`).then(r => r.json()).then(d => {
      setChannels((d.channels || []).filter(c => (c.platform === 'whatsapp' || c.platform === 'whatsapp_qr') && c.status === 'active'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setTemplates(null); setSelectedTemplate(null); setParams([]); setPreview(null)
    if (!channelId) return
    apiFetch(`${API_URL}/channels/${channelId}/templates`).then(r => r.json())
      .then(d => setTemplates((d.templates || []).filter(t => t.status === 'APPROVED')))
      .catch(() => setTemplates([]))
  }, [channelId])

  const bodyOf = (tpl) => tpl?.components?.find(c => c.type === 'BODY')?.text || ''
  const varCount = selectedTemplate ? (bodyOf(selectedTemplate).match(/\{\{\d+\}\}/g) || []).length : 0
  const resolvedPreview = selectedTemplate ? bodyOf(selectedTemplate).replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : ''

  const selectTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    setParams([])
    // بنبدأ برسالة العميل المفتوح بنفس نص القالب — الأدمن يقدر يعدّلها لو حب، مش إجباري يكتب من الصفر
    setOpenMessage(bodyOf(tpl))
    setPreview(null)
  }

  useEffect(() => {
    if (selectedTemplate) setOpenMessage(resolvedPreview)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const runPreview = async () => {
    if (!segmentId || !channelId) return
    setPreviewing(true)
    try {
      const res = await apiFetch(`${API_URL}/broadcasts/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_id: segmentId, channel_id: channelId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  const send = async () => {
    if (varCount > 0 && params.filter(p => p?.trim()).length < varCount) {
      toast.error(t('broadcast.wizard.fillVariablesFirst'))
      return
    }
    if (!openMessage.trim()) { toast.error(t('broadcast.wizard.openMessageRequired')); return }
    setSending(true)
    try {
      const res = await apiFetch(`${API_URL}/broadcasts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment_id: segmentId, channel_id: channelId,
          template_name: selectedTemplate.name, template_language: selectedTemplate.language,
          template_params: params.slice(0, varCount), open_window_message: openMessage.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('broadcast.wizard.sent'))
      onDone(data.broadcast_id)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div>
        <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.segmentLabel')}</label>
        <select value={segmentId} onChange={e => { setSegmentId(e.target.value); setPreview(null) }}
          className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg">
          <option value="">{t('broadcast.wizard.selectPlaceholder')}</option>
          {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {segmentId && (
        <div>
          <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.channelLabel')}</label>
          <select value={channelId} onChange={e => { setChannelId(e.target.value); setPreview(null) }}
            className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg">
            <option value="">{t('broadcast.wizard.selectPlaceholder')}</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.custom_name || c.display_name || c.external_id}</option>)}
          </select>
        </div>
      )}

      {channelId && templates && !selectedTemplate && (
        <div>
          <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.templateLabel')}</label>
          {templates.length === 0 ? (
            <p className="text-xs text-fg-subtle">{t('broadcast.wizard.noTemplates')}</p>
          ) : (
            <div className="space-y-1.5">
              {templates.map(tpl => (
                <button key={`${tpl.name}-${tpl.language}`} onClick={() => selectTemplate(tpl)}
                  className="w-full text-start bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg hover:border-brand/50">
                  <p className="font-medium">{tpl.name}</p>
                  <p className="text-[11px] text-fg-subtle truncate">{bodyOf(tpl)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTemplate && (
        <>
          <div className="bg-surface-2 rounded-xl p-3 border border-surface-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-fg">{selectedTemplate.name}</p>
              <button onClick={() => setSelectedTemplate(null)} className="text-xs text-brand">{t('broadcast.wizard.changeTemplate')}</button>
            </div>
            {Array.from({ length: varCount }).map((_, i) => (
              <input key={i} value={params[i] || ''} onChange={e => setParams(p => { const n = [...p]; n[i] = e.target.value; return n })}
                placeholder={t('broadcast.wizard.variablePlaceholder', { n: i + 1 })}
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg mt-2" />
            ))}
            <p className="text-[11px] text-fg-subtle mt-2 whitespace-pre-wrap">{resolvedPreview}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.openMessageLabel')}</label>
            <textarea value={openMessage} onChange={e => setOpenMessage(e.target.value)} rows={3}
              className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
            <p className="text-[11px] text-fg-subtle mt-1">{t('broadcast.wizard.openMessageHint')}</p>
          </div>

          <button onClick={runPreview} disabled={previewing}
            className="w-full py-2.5 rounded-xl bg-surface-3 text-fg text-sm font-medium disabled:opacity-50">
            {previewing ? t('broadcast.wizard.previewing') : t('broadcast.wizard.previewButton')}
          </button>

          {preview && (
            <div className="bg-surface-2 rounded-xl p-4 border border-surface-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-fg-muted">{t('broadcast.wizard.previewOpen')}: <span className="text-fg font-semibold">{preview.open}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewClosed')}: <span className="text-fg font-semibold">{preview.closed}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewBlocked')}: <span className="text-fg font-semibold">{preview.blocked}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewNoWhatsapp')}: <span className="text-fg font-semibold">{preview.noWhatsapp}</span></p>
              </div>
              {preview.exceedsDailyLimit && (
                <div className="flex items-start gap-2 bg-warning/10 text-warning rounded-lg p-2 text-xs">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{t('broadcast.wizard.exceedsDailyLimit', { days: preview.estimatedDays, limit: preview.dailyLimit })}</span>
                </div>
              )}
              <p className="text-sm font-semibold text-fg pt-1">{t('broadcast.wizard.willSendConfirm', { count: preview.willSend, templateCount: preview.closed })}</p>
              <button onClick={send} disabled={sending || preview.willSend === 0}
                className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                <Send size={15} /> {sending ? t('broadcast.wizard.sending') : t('broadcast.wizard.confirmSend')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
