import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Plus, Megaphone, AlertTriangle, Send, X } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import TemplatePreview from '../components/TemplatePreview'
import { formatDateTime as localeFormatDateTime } from '../lib/locale'

const BROADCAST_STATUS_KEYS = { draft: 'draft', previewed: 'previewed', sending: 'sending', completed: 'completed' }
const RECIPIENT_STATUS_KEYS = ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped_blocked', 'skipped_no_template']

// في وضع "آخر رقم كلّم بيه العميل" ممكن يبقى فيه أكتر من قالب مختلف (واحد لكل رقم) — لو كده مفيش
// اسم واحد نعرضه في القايمة
function templateDisplayName(b, t) {
  if (b.multi_template && !b.template_name) return t('broadcast.list.multipleTemplates')
  return b.template_name
}

// شكل ميتا الخام للقالب (components: [{type, format, text, buttons}]) مش نفس شكل TemplatePreview
// ({header, body, footer, buttons}) — مابر بسيط لتحويل واحد للتاني، مع تمرير النص بعد استبدال
// المتغيرات الحقيقية بدل {{n}} الخام
function templateToPreviewProps(tpl, resolvedBody, mediaUrl) {
  const comps = tpl?.components || []
  const headerComp = comps.find(c => c.type === 'HEADER')
  const footerComp = comps.find(c => c.type === 'FOOTER')
  const buttonsComp = comps.find(c => c.type === 'BUTTONS')
  return {
    header: headerComp ? { enabled: true, format: headerComp.format, text: headerComp.text, mediaUrl: mediaUrl || null } : null,
    body: resolvedBody,
    footer: footerComp?.text || '',
    buttons: buttonsComp?.buttons || []
  }
}

// الصورة/الفيديو اللي اترفعوا وقت إنشاء القالب كانوا عيّنة لمراجعة ميتا بس — ميتا بتطلب الملف
// الفعلي مع كل رسالة بتتبعت. فأي قالب هيدره من الأنواع دي لازم نرفعله ملف هنا قبل الإرسال
const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT']
const headerFormatOf = (tpl) => tpl?.components?.find(c => c.type === 'HEADER')?.format || null
const needsHeaderMedia = (tpl) => MEDIA_HEADER_FORMATS.includes(headerFormatOf(tpl))
const ACCEPT_BY_FORMAT = { IMAGE: 'image/*', VIDEO: 'video/*', DOCUMENT: '.pdf,.doc,.docx' }

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
          <p className="text-xs text-fg-muted mt-1">{t('broadcast.list.templateAndCount', { template: templateDisplayName(b, t), count: b.total_recipients })}</p>
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

  const { broadcast, statusCounts, repliedCount, recipients } = data
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-surface-2 rounded-xl p-4 border border-surface-3">
        <p className="font-semibold text-fg">{broadcast.segment_name_snapshot}</p>
        <p className="text-xs text-fg-muted mt-1">{t('broadcast.list.templateAndCount', { template: templateDisplayName(broadcast, t), count: broadcast.total_recipients })}</p>
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
        <div className="bg-surface-2 rounded-xl p-3 border border-surface-3 text-center">
          <p className="text-lg font-bold text-fg">{repliedCount || 0}</p>
          <p className="text-[11px] text-fg-muted">{t('broadcast.detail.replied')}</p>
        </div>
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
              <span className="truncate text-fg flex items-center gap-1.5">
                {r.contacts?.name || r.contacts?.platform_id || '—'}
                {r.replied_at && <span className="text-success text-[11px] flex-shrink-0" title={t('broadcast.detail.replied')}>✓ {t('broadcast.detail.replied')}</span>}
              </span>
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

function channelLabel(channels, id) {
  const c = channels.find(ch => ch.id === id)
  return c ? (c.custom_name || c.display_name || c.external_id) : id
}

// بيرفع ملف الهيدر على تخزيننا وبيرجّع رابط عام — ميتا بتحمّل الرابط ده وقت إرسال كل رسالة،
// فلازم يفضل متاح طول مدة البرودكاست (نفس البكت المستخدم في مرفقات الشات وعيّنات القوالب)
function HeaderMediaPicker({ format, value, fileName, onChange, disabled }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `broadcast-headers/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('inbox-media').upload(path, file)
      if (error) throw new Error(t('broadcast.wizard.headerUploadFailed'))
      const { data } = supabase.storage.from('inbox-media').getPublicUrl(path)
      onChange(data.publicUrl, file.name)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-surface-3 rounded-lg p-2.5 space-y-1.5">
      <p className="text-[11px] font-semibold text-fg">{t(`broadcast.wizard.headerMediaLabel.${format}`)}</p>
      <input type="file" ref={inputRef} onChange={pick} className="hidden" accept={ACCEPT_BY_FORMAT[format]} />
      {value ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-xs text-success">✓ {fileName || t('broadcast.wizard.headerMediaReady')}</span>
          <button onClick={() => onChange(null, null)} disabled={disabled}
            className="text-xs text-brand flex-shrink-0">{t('broadcast.wizard.headerMediaChange')}</button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading || disabled}
          className="w-full py-1.5 rounded-lg bg-surface-2 border border-dashed border-surface-3 text-xs text-fg-muted hover:border-brand/50 disabled:opacity-50">
          {uploading ? t('broadcast.wizard.headerMediaUploading') : t('broadcast.wizard.headerMediaUpload')}
        </button>
      )}
      <p className="text-[10px] text-fg-subtle">{t('broadcast.wizard.headerMediaHint')}</p>
    </div>
  )
}

const bodyOf = (tpl) => tpl?.components?.find(c => c.type === 'BODY')?.text || ''
const varCountOf = (tpl) => (bodyOf(tpl).match(/\{\{\d+\}\}/g) || []).length
const resolvedBodyOf = (tpl, prms) => bodyOf(tpl).replace(/\{\{(\d+)\}\}/g, (_, n) => prms?.[Number(n) - 1] || `{{${n}}}`)

function BroadcastWizard({ onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [segments, setSegments] = useState([])
  const [segmentId, setSegmentId] = useState('')
  const [channels, setChannels] = useState([])
  // fixed: رقم واحد ثابت لكل العملاء (قالب واحد). last_contacted: كل عميل من آخر رقم كلّمه بيه
  // فعلاً — بيزود عدد اللي شاتهم لسه مفتوح لأن نافذة الـ٢٤ ساعة مربوطة بالرقم نفسه عند ميتا، لكن
  // معناه كمان إن كل رقم ممكن يكون له قالب مختلف (القوالب معتمدة لكل رقم/WABA على حدة، مش مشتركة)
  const [channelMode, setChannelMode] = useState('fixed')

  // وضع "رقم محدد": قالب واحد بس
  const [channelId, setChannelId] = useState('')
  const [templates, setTemplates] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [params, setParams] = useState([])

  // وضع "آخر رقم كلّم بيه العميل": قالب مستقل لكل رقم ظهر في تكسير الشريحة
  const [channelTemplates, setChannelTemplates] = useState({}) // { [channel_id]: templates[] | 'loading' }
  const [channelSelections, setChannelSelections] = useState({}) // { [channel_id]: { template, params } }

  // ملف الهيدر واحد للحملة كلها — نفس الصورة بتتبعت من كل الأرقام، فمفيش داعي نرفعها لكل رقم
  const [headerMediaUrl, setHeaderMediaUrl] = useState(null)
  const [headerMediaName, setHeaderMediaName] = useState(null)

  // تاج بيتحط على كل عميل الرسالة توصله فعلاً — سجل دائم لـ"مين استلم الحملة دي" تقدر تفلتر
  // بيه في الشرائح بعدين. فاضي = مفيش تاج
  const [recipientTag, setRecipientTag] = useState('')
  const [tagTouched, setTagTouched] = useState(false)

  const [openMessage, setOpenMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)

  useEffect(() => {
    apiFetch(`${API_URL}/segments`).then(r => r.json()).then(d => setSegments(d.segments || [])).catch(() => {})
    apiFetch(`${API_URL}/channels`).then(r => r.json()).then(d => {
      setChannels((d.channels || []).filter(c => (c.platform === 'whatsapp' || c.platform === 'whatsapp_qr') && c.status === 'active'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (channelMode !== 'fixed') return
    setTemplates(null); setSelectedTemplate(null); setParams([]); setPreview(null)
    if (!channelId) return
    apiFetch(`${API_URL}/channels/${channelId}/templates`).then(r => r.json())
      .then(d => setTemplates((d.templates || []).filter(t => t.status === 'APPROVED')))
      .catch(() => setTemplates([]))
  }, [channelId, channelMode])

  const varCount = selectedTemplate ? varCountOf(selectedTemplate) : 0
  const resolvedPreview = selectedTemplate ? resolvedBodyOf(selectedTemplate, params) : ''

  const selectTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    setParams([])
    // بنبدأ برسالة العميل المفتوح بنفس نص القالب — الأدمن يقدر يعدّلها لو حب، مش إجباري يكتب من الصفر
    setOpenMessage(bodyOf(tpl))
    setPreview(null)
  }

  useEffect(() => {
    if (channelMode === 'fixed' && selectedTemplate) setOpenMessage(resolvedPreview)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (mode) => {
    setChannelMode(mode)
    setPreview(null)
    setSelectedTemplate(null); setTemplates(null); setChannelId('')
    setChannelTemplates({}); setChannelSelections({})
  }

  const loadChannelTemplates = (chId) => {
    apiFetch(`${API_URL}/channels/${chId}/templates`).then(r => r.json())
      .then(d => setChannelTemplates(prev => ({ ...prev, [chId]: (d.templates || []).filter(t => t.status === 'APPROVED') })))
      .catch(() => setChannelTemplates(prev => ({ ...prev, [chId]: [] })))
  }

  const runPreview = async () => {
    if (!segmentId) return
    if (channelMode === 'fixed' && !channelId) return
    setPreviewing(true)
    try {
      const res = await apiFetch(`${API_URL}/broadcasts/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_id: segmentId, mode: channelMode, channel_id: channelMode === 'fixed' ? channelId : undefined })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data)
      if (channelMode === 'last_contacted') {
        const nextTemplates = {}
        ;(data.byChannel || []).forEach(row => { nextTemplates[row.channel_id] = 'loading' })
        setChannelTemplates(nextTemplates)
        ;(data.byChannel || []).forEach(row => loadChannelTemplates(row.channel_id))
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  const selectChannelTemplate = (chId, tpl) => setChannelSelections(prev => ({ ...prev, [chId]: { template: tpl, params: [] } }))
  const updateChannelParam = (chId, i, value) => setChannelSelections(prev => {
    const cur = prev[chId] || { template: null, params: [] }
    const nextParams = [...cur.params]; nextParams[i] = value
    return { ...prev, [chId]: { ...cur, params: nextParams } }
  })

  const readyToSend = channelMode === 'fixed' ? !!selectedTemplate : !!preview?.byChannel?.length
  const allChannelsHaveTemplate = channelMode !== 'last_contacted' || (preview?.byChannel || []).every(row => channelSelections[row.channel_id]?.template)

  // القوالب المختارة اللي هيدرها ميديا — لو فيه واحد على الأقل، لازم نرفع الملف قبل الإرسال.
  // (لو الأرقام اختارت أنواع هيدر مختلفة بنمشي على أول نوع ونحذّر، وده نادر جدًا في حملة واحدة)
  const selectedTemplates = channelMode === 'fixed'
    ? (selectedTemplate ? [selectedTemplate] : [])
    : Object.values(channelSelections).map(s => s?.template).filter(Boolean)
  const mediaHeaderFormats = [...new Set(selectedTemplates.filter(needsHeaderMedia).map(headerFormatOf))]
  const headerMediaFormat = mediaHeaderFormats[0] || null
  const headerMediaMissing = !!headerMediaFormat && !headerMediaUrl

  // اسم القالب كاقتراح مبدئي للتاج — بنبطّل نغيّره أول ما الأدمن يكتب حاجة بنفسه
  const firstTemplateName = selectedTemplates[0]?.name || ''
  useEffect(() => {
    if (!tagTouched && firstTemplateName) setRecipientTag(firstTemplateName)
  }, [firstTemplateName, tagTouched])

  const send = async () => {
    if (channelMode === 'fixed') {
      if (varCount > 0 && params.filter(p => p?.trim()).length < varCount) {
        toast.error(t('broadcast.wizard.fillVariablesFirst')); return
      }
    } else {
      const missingValue = (preview?.byChannel || []).some(row => {
        const sel = channelSelections[row.channel_id]
        if (!sel?.template) return false // مسموح تسيبه من غير قالب — هيتستبعد من الإرسال بس مش بيوقف الباقي
        const vc = varCountOf(sel.template)
        return vc > 0 && (sel.params || []).filter(p => p?.trim()).length < vc
      })
      if (missingValue) { toast.error(t('broadcast.wizard.fillVariablesFirst')); return }
      if (!allChannelsHaveTemplate && !confirm(t('broadcast.wizard.someChannelsSkippedConfirm'))) return
    }
    if (!openMessage.trim()) { toast.error(t('broadcast.wizard.openMessageRequired')); return }
    if (headerMediaMissing) { toast.error(t('broadcast.wizard.headerMediaRequired')); return }
    setSending(true)
    try {
      const body = {
        segment_id: segmentId, mode: channelMode, open_window_message: openMessage.trim(),
        recipient_tag_name: recipientTag.trim() || null
      }
      if (channelMode === 'fixed') {
        body.channel_id = channelId
        body.template_name = selectedTemplate.name
        body.template_language = selectedTemplate.language
        body.template_params = params.slice(0, varCount)
        if (needsHeaderMedia(selectedTemplate)) body.header_media_url = headerMediaUrl
      } else {
        const templatesByChannel = {}
        Object.entries(channelSelections).forEach(([chId, sel]) => {
          if (!sel.template) return
          templatesByChannel[chId] = {
            template_name: sel.template.name, template_language: sel.template.language,
            template_params: (sel.params || []).slice(0, varCountOf(sel.template)),
            header_media_url: needsHeaderMedia(sel.template) ? headerMediaUrl : null
          }
        })
        body.templates_by_channel = templatesByChannel
      }
      const res = await apiFetch(`${API_URL}/broadcasts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
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
          <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.channelModeLabel')}</label>
          <div className="flex gap-2">
            <button onClick={() => switchMode('fixed')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium ${channelMode === 'fixed' ? 'bg-brand text-white' : 'bg-surface-2 border border-surface-3 text-fg-muted'}`}>
              {t('broadcast.wizard.channelModeFixed')}
            </button>
            <button onClick={() => switchMode('last_contacted')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium ${channelMode === 'last_contacted' ? 'bg-brand text-white' : 'bg-surface-2 border border-surface-3 text-fg-muted'}`}>
              {t('broadcast.wizard.channelModeLastContacted')}
            </button>
          </div>
          <p className="text-[11px] text-fg-subtle mt-1">
            {channelMode === 'fixed' ? t('broadcast.wizard.channelModeFixedHint') : t('broadcast.wizard.channelModeLastContactedHint')}
          </p>
        </div>
      )}

      {segmentId && channelMode === 'fixed' && (
        <div>
          <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.channelLabel')}</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)}
            className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg">
            <option value="">{t('broadcast.wizard.selectPlaceholder')}</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.custom_name || c.display_name || c.external_id}</option>)}
          </select>
        </div>
      )}

      {segmentId && channelMode === 'fixed' && channelId && templates && !selectedTemplate && (
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

      {channelMode === 'fixed' && selectedTemplate && (
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
          {needsHeaderMedia(selectedTemplate) && (
            <div className="mt-2">
              <HeaderMediaPicker format={headerFormatOf(selectedTemplate)} value={headerMediaUrl} fileName={headerMediaName}
                onChange={(url, name) => { setHeaderMediaUrl(url); setHeaderMediaName(name) }} disabled={sending} />
            </div>
          )}
          <div className="mt-3">
            <TemplatePreview {...templateToPreviewProps(selectedTemplate, resolvedPreview, headerMediaUrl)} />
          </div>
        </div>
      )}

      {segmentId && channelMode === 'last_contacted' && !preview && (
        <button onClick={runPreview} disabled={previewing}
          className="w-full py-2.5 rounded-xl bg-surface-3 text-fg text-sm font-medium disabled:opacity-50">
          {previewing ? t('broadcast.wizard.previewing') : t('broadcast.wizard.calculateBreakdownButton')}
        </button>
      )}

      {channelMode === 'last_contacted' && preview?.byChannel?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-subtle">{t('broadcast.wizard.pickTemplatePerChannel')}</p>
          {preview.byChannel.map(row => (
            <ChannelTemplateBlock key={row.channel_id} row={row} channels={channels}
              templates={channelTemplates[row.channel_id]}
              selection={channelSelections[row.channel_id]}
              headerMediaUrl={headerMediaUrl}
              onSelectTemplate={tpl => selectChannelTemplate(row.channel_id, tpl)}
              onParamChange={(i, v) => updateChannelParam(row.channel_id, i, v)} />
          ))}
          {/* ملف واحد للحملة كلها — نفس الصورة هتتبعت من كل رقم، فبنرفعها مرة واحدة برّه الكروت
              بدل ما الدكتور يرفع نفس الصورة ٦ مرات */}
          {headerMediaFormat && (
            <HeaderMediaPicker format={headerMediaFormat} value={headerMediaUrl} fileName={headerMediaName}
              onChange={(url, name) => { setHeaderMediaUrl(url); setHeaderMediaName(name) }} disabled={sending} />
          )}
          {mediaHeaderFormats.length > 1 && (
            <p className="text-[11px] text-warning">{t('broadcast.wizard.headerMediaMixedFormats')}</p>
          )}
        </div>
      )}

      {readyToSend && (
        <>
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.openMessageLabel')}</label>
            <textarea value={openMessage} onChange={e => setOpenMessage(e.target.value)} rows={3}
              className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
            <p className="text-[11px] text-fg-subtle mt-1">{t('broadcast.wizard.openMessageHint')}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.recipientTagLabel')}</label>
            <input value={recipientTag} onChange={e => { setTagTouched(true); setRecipientTag(e.target.value) }}
              placeholder={t('broadcast.wizard.recipientTagPlaceholder')}
              className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg" />
            <p className="text-[11px] text-fg-subtle mt-1">{t('broadcast.wizard.recipientTagHint')}</p>
          </div>

          <div className="flex gap-2">
            {channelMode === 'fixed' && (
              <button onClick={runPreview} disabled={previewing}
                className="flex-1 py-2.5 rounded-xl bg-surface-3 text-fg text-sm font-medium disabled:opacity-50">
                {previewing ? t('broadcast.wizard.previewing') : t('broadcast.wizard.previewButton')}
              </button>
            )}
            <button onClick={() => setShowTestModal(true)}
              className="px-4 py-2.5 rounded-xl bg-surface-2 border border-surface-3 text-fg text-sm font-medium">
              {t('broadcast.wizard.testBroadcastButton')}
            </button>
          </div>

          {channelMode === 'fixed' && preview && (
            <div className="bg-surface-2 rounded-xl p-4 border border-surface-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-fg-muted">{t('broadcast.wizard.previewOpen')}: <span className="text-fg font-semibold">{preview.open}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewClosed')}: <span className="text-fg font-semibold">{preview.closed}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewBlocked')}: <span className="text-fg font-semibold">{preview.blocked}</span></p>
                <p className="text-fg-muted">{t('broadcast.wizard.previewNoWhatsapp')}: <span className="text-fg font-semibold">{preview.noWhatsapp}</span></p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-fg-subtle mb-1.5">{t('broadcast.wizard.byChannelBreakdown')}</p>
                {(preview.byChannel || []).map(row => (
                  <div key={row.channel_id} className="bg-surface-3 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg">{channelLabel(channels, row.channel_id)}</span>
                      <span className="text-fg-muted">{t('broadcast.wizard.byChannelTotal', { count: row.total })}</span>
                    </div>
                    {row.exceedsDailyLimit && (
                      <div className="flex items-start gap-1.5 bg-warning/10 text-warning rounded-lg p-1.5">
                        <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{t('broadcast.wizard.exceedsDailyLimit', { days: row.estimatedDays, limit: row.dailyLimit })}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm font-semibold text-fg pt-1">{t('broadcast.wizard.willSendConfirm', { count: preview.willSend, templateCount: preview.closed })}</p>
            </div>
          )}

          {channelMode === 'last_contacted' && preview && (
            <p className="text-sm font-semibold text-fg">
              {t('broadcast.wizard.willSendConfirm', { count: preview.willSend, templateCount: preview.closed })}
            </p>
          )}

          <button onClick={send} disabled={sending || headerMediaMissing || (channelMode === 'fixed' ? !preview || preview.willSend === 0 : !preview?.byChannel?.some(r => channelSelections[r.channel_id]?.template))}
            className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            <Send size={15} /> {sending ? t('broadcast.wizard.sending') : t('broadcast.wizard.confirmSend')}
          </button>

          {showTestModal && (
            <TestBroadcastModal
              channels={channels} mode={channelMode}
              defaultChannelId={channelMode === 'fixed' ? channelId : preview?.byChannel?.[0]?.channel_id}
              templateName={selectedTemplate?.name} templateLanguage={selectedTemplate?.language}
              templateParams={params.slice(0, varCount)}
              headerMediaUrl={channelMode === 'fixed' && !needsHeaderMedia(selectedTemplate) ? null : headerMediaUrl}
              templatesByChannel={channelMode === 'last_contacted' ? Object.fromEntries(
                Object.entries(channelSelections).filter(([, sel]) => sel.template).map(([chId, sel]) => [chId, {
                  template_name: sel.template.name, template_language: sel.template.language,
                  template_params: (sel.params || []).slice(0, varCountOf(sel.template)),
                  header_media_url: needsHeaderMedia(sel.template) ? headerMediaUrl : null
                }])
              ) : null}
              onClose={() => setShowTestModal(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

// كارت رقم واحد في تكسير وضع "آخر رقم كلّم بيه العميل" — كل رقم له قوالبه المعتمدة الخاصة بيه
// (القوالب متسجلة لكل رقم/WABA على حدة عند ميتا، مش مشتركة بين كل الأرقام)، فلازم يتختار قالب
// مستقل لكل واحد منهم بدل ما نفرض نفس القالب على الكل ويفشل على الأرقام اللي مالهاش نفس القالب
function ChannelTemplateBlock({ row, channels, templates, selection, headerMediaUrl, onSelectTemplate, onParamChange }) {
  const { t } = useTranslation()
  const varCount = selection?.template ? varCountOf(selection.template) : 0
  const resolvedPreview = selection?.template ? resolvedBodyOf(selection.template, selection.params) : ''

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-fg">{channelLabel(channels, row.channel_id)}</span>
        <span className="text-fg-muted text-xs">{t('broadcast.wizard.byChannelTotal', { count: row.total })}</span>
      </div>
      <div className="flex items-center gap-3 text-fg-muted text-xs">
        <span>{t('broadcast.wizard.previewOpen')}: <span className="text-fg font-medium">{row.open}</span></span>
        <span>{t('broadcast.wizard.previewClosed')}: <span className="text-fg font-medium">{row.closed}</span></span>
      </div>
      {row.exceedsDailyLimit && (
        <div className="flex items-start gap-1.5 bg-warning/10 text-warning rounded-lg p-1.5 text-xs">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{t('broadcast.wizard.exceedsDailyLimit', { days: row.estimatedDays, limit: row.dailyLimit })}</span>
        </div>
      )}

      {templates === 'loading' || templates === undefined ? (
        <p className="text-xs text-fg-subtle">{t('broadcast.wizard.loadingTemplates')}</p>
      ) : templates.length === 0 ? (
        <p className="text-xs text-danger">{t('broadcast.wizard.noTemplatesForChannel')}</p>
      ) : !selection?.template ? (
        <select value="" onChange={e => onSelectTemplate(templates.find(tp => tp.name === e.target.value))}
          className="w-full bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg">
          <option value="">{t('broadcast.wizard.templateLabel')}</option>
          {templates.map(tpl => <option key={tpl.name} value={tpl.name}>{tpl.name}</option>)}
        </select>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg font-medium">{selection.template.name}</span>
            <button onClick={() => onSelectTemplate(null)} className="text-xs text-brand">{t('broadcast.wizard.changeTemplate')}</button>
          </div>
          {Array.from({ length: varCount }).map((_, i) => (
            <input key={i} value={selection.params?.[i] || ''} onChange={e => onParamChange(i, e.target.value)}
              placeholder={t('broadcast.wizard.variablePlaceholder', { n: i + 1 })}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg" />
          ))}
          <TemplatePreview {...templateToPreviewProps(selection.template, resolvedPreview, headerMediaUrl)} />
        </div>
      )}
    </div>
  )
}

// إرسال تجربة فورية لعدد من الأرقام (موجودين كعملاء أو لأ) قبل بدء التنفيذ الفعلي على الشريحة —
// نفس شكل حقول بدء محادثة جديدة (اسم + رقم) بالظبط، بس بيسمح بأكتر من صف
function TestBroadcastModal({ channels, defaultChannelId, mode, templateName, templateLanguage, templateParams, templatesByChannel, headerMediaUrl, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [channelId, setChannelId] = useState(defaultChannelId)
  const [targets, setTargets] = useState([{ name: '', phone: '' }])
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  const updateTarget = (i, patch) => setTargets(prev => prev.map((tg, idx) => idx === i ? { ...tg, ...patch } : tg))
  const addTarget = () => setTargets(prev => [...prev, { name: '', phone: '' }])
  const removeTarget = (i) => setTargets(prev => prev.filter((_, idx) => idx !== i))

  const sendTest = async () => {
    const validTargets = targets.filter(tg => tg.phone.trim())
    if (!validTargets.length || !channelId) { toast.error(t('broadcast.wizard.testModal.missingFields')); return }
    setSending(true)
    setResults(null)
    try {
      const body = mode === 'last_contacted'
        ? { mode, channel_id: channelId, templates_by_channel: templatesByChannel, targets: validTargets }
        : { mode, channel_id: channelId, template_name: templateName, template_language: templateLanguage, template_params: templateParams, header_media_url: headerMediaUrl || null, targets: validTargets }
      const res = await apiFetch(`${API_URL}/broadcasts/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.results)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => !sending && onClose()}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[420px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-2">
          <p className="text-sm font-semibold text-fg">{t('broadcast.wizard.testModal.title')}</p>
          <button onClick={onClose} disabled={sending} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('broadcast.wizard.testModal.channelLabel')}</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)}
              className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none">
              {channels.map(c => <option key={c.id} value={c.id}>{c.custom_name || c.display_name || c.external_id}</option>)}
            </select>
            {mode === 'last_contacted' && <p className="text-[11px] text-fg-subtle mt-1">{t('broadcast.wizard.testModal.fallbackHint')}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-fg">{t('broadcast.wizard.testModal.targetsLabel')}</label>
            {targets.map((tg, i) => (
              <div key={i} className="flex gap-1.5">
                <input value={tg.name} onChange={e => updateTarget(i, { name: e.target.value })}
                  placeholder={t('conversations.newConversation.namePlaceholder')}
                  className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg placeholder-fg-subtle" />
                <input value={tg.phone} onChange={e => updateTarget(i, { phone: e.target.value })} dir="ltr"
                  placeholder={t('conversations.newConversation.phonePlaceholder')}
                  className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg placeholder-fg-subtle text-left" />
                {targets.length > 1 && (
                  <button onClick={() => removeTarget(i)} className="text-fg-subtle hover:text-danger px-1"><X size={16} /></button>
                )}
              </div>
            ))}
            <button onClick={addTarget} className="text-xs text-brand hover:underline">{t('broadcast.wizard.testModal.addTarget')}</button>
          </div>

          {results && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-surface-3 rounded-lg px-3 py-2">
                  <span className="text-fg" dir="ltr">{r.phone}</span>
                  <span className={r.ok ? 'text-success' : 'text-danger'}>
                    {r.ok ? t('broadcast.wizard.testModal.sent') : (r.error || t('broadcast.wizard.testModal.failed'))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button onClick={sendTest} disabled={sending}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('broadcast.wizard.testModal.sendButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
