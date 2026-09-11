import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { formatDate as localeFormatDate, formatTime as localeFormatTime } from '../lib/locale'
import { BarChart3, Users2, Facebook, Instagram, Phone, Tag, ChevronDown, Send, X, Zap, Radio, Globe, Sparkles, Download, Music2 } from 'lucide-react'
import BackArrow from '../components/BackArrow'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts'

const SECTIONS = [
  { key: 'ai', labelKey: 'reports.sections.ai', icon: Sparkles },
  { key: 'overview', labelKey: 'reports.sections.overview', icon: BarChart3 },
  { key: 'customers', labelKey: 'reports.sections.customers', icon: Users2 },
  { key: 'countries', labelKey: 'reports.sections.countries', icon: Globe },
  { key: 'attendance', labelKey: 'reports.sections.attendance', icon: Users2 },
  { key: 'performance', labelKey: 'reports.sections.performance', icon: Zap },
  { key: 'volume', labelKey: 'reports.sections.volume', icon: Radio },
  { key: 'tags', labelKey: 'reports.sections.tags', icon: Tag },
  { key: 'export', labelKey: 'reports.sections.export', icon: Download },
]

// بتجيب كل صفوف كويري معينة من غير ما تقف عند حد الـ 1000 صف الافتراضي بتاع سوبابيز — بتلف
// بصفحات من 1000 لحد ما ترجع صفحة أصغر من كده (يعني خلصت). بناخد factory function بترجع كويري
// جديدة كل مرة (مش نفس الكائن) عشان .range() يتطبق نضيف من غير آثار جانبية بين الصفحات
async function fetchAllRows(buildQuery) {
  const PAGE = 1000
  let offset = 0
  let all = []
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export default function ReportsScreen() {
  const { t } = useTranslation()
  const [section, setSection] = useState('overview')
  const { agent } = useAuth()
  const navigate = useNavigate()

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-fg-muted">
      <p>{t('reports.unauthorized')}</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate('/')} className="text-fg-muted hover:text-fg">
          <BackArrow />
        </button>
        <span className="font-bold text-fg">{t('reports.title')}</span>
      </div>

      {/* Sections */}
      <div className="flex border-b border-surface-3 bg-surface-2 overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${section === s.key ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
            <s.icon size={14} />
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {section === 'ai' && <AiReportsTab />}
        {section === 'overview' && <OverviewTab />}
        {section === 'customers' && <CustomersTab />}
        {section === 'countries' && <CountriesTab />}
        {section === 'attendance' && <AttendanceTab />}
        {section === 'performance' && <PerformanceTab />}
        {section === 'volume' && <ChannelVolumeTab />}
        {section === 'tags' && <TagsReportTab />}
        {section === 'export' && <ExportTab />}
      </div>
    </div>
  )
}

// ─── تقارير بالذكاء الاصطناعي — سؤال بالعربي، رد نصي مباشر من الأدوات المضبوطة نفس التقارير ────
const SUGGESTED_QUESTIONS = [
  'reports.ai.suggestedQuestions.newCustomersThisWeek',
  'reports.ai.suggestedQuestions.topAgentThisMonth',
  'reports.ai.suggestedQuestions.openConversationsNow',
  'reports.ai.suggestedQuestions.inboundMessagesTodayByChannel',
]

function AiReportsTab() {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([]) // [{ question, answer, loading, error }]
  const [asking, setAsking] = useState(false)

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || asking) return
    setQuestion('')
    setAsking(true)
    const idx = history.length
    // بنبعت الأسئلة والردود اللي فاتت في نفس الشات عشان الـ AI يفهم السياق (زي رد على سؤال
    // توضيحي هو سألها) بدل ما يتعامل مع كل رسالة كأنها محادثة جديدة من الصفر
    const priorHistory = history.filter(h => h.answer && !h.error).map(h => ({ question: h.question, answer: h.answer }))
    setHistory(prev => [...prev, { question: text, answer: null, loading: true, error: null }])
    try {
      const res = await apiFetch(`${API_URL}/ai/reports-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history: priorHistory })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('reports.ai.answerFailed'))
      setHistory(prev => prev.map((h, i) => i === idx ? { ...h, answer: data.answer, loading: false } : h))
    } catch (err) {
      setHistory(prev => prev.map((h, i) => i === idx ? { ...h, error: err.message, loading: false } : h))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="p-4 space-y-4 flex flex-col h-full">
      <h2 className="font-semibold text-fg flex items-center gap-2"><Sparkles size={18} className="text-brand" /> {t('reports.ai.heading')}</h2>
      <p className="text-xs text-fg-subtle -mt-2">{t('reports.ai.subtitle')}</p>

      {history.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map(qKey => (
            <button key={qKey} onClick={() => ask(t(qKey))}
              className="px-3 py-1.5 bg-surface-3 hover:bg-surface-2 rounded-full text-xs text-fg-muted">
              {t(qKey)}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto">
        {history.map((h, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="bg-brand text-white rounded-2xl rounded-ee-sm px-4 py-2.5 text-sm max-w-[85%]">{h.question}</div>
            </div>
            <div className="flex justify-start">
              <div className="bg-surface-2 border border-surface-3 rounded-2xl rounded-es-sm px-4 py-2.5 text-sm text-fg max-w-[85%]">
                {h.loading ? (
                  <div className="flex items-center gap-2 text-fg-subtle">
                    <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" /> {t('reports.ai.thinking')}
                  </div>
                ) : h.error ? (
                  <span className="text-danger">{t('reports.common.errorPrefix', { error: h.error })}</span>
                ) : (
                  <span className="whitespace-pre-wrap">{h.answer}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <input value={question} onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
          placeholder={t('reports.ai.inputPlaceholder')}
          className="flex-1 bg-surface-2 border border-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
        <button onClick={() => ask()} disabled={asking || !question.trim()}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-brand hover:bg-brand-dark text-white rounded-xl transition-colors disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── نظرة عامة (عملاء جدد + lifecycle) ─────────────────────
// ألوان الأقنية موحّدة مع باقي الشاشات (نفس الألوان اللي بتتلون بيها الأيقونات في المحادثات).
// واتساب في الوضع الداكن بلون أغمق شوية عن الفاتح عشان يفضل واضح على خلفية غامقة (تباين كافي).
const PLATFORMS = [
  { key: 'facebook', labelKey: 'reports.platforms.facebook', icon: Facebook, color: { light: '#3B82F6', dark: '#3B82F6' } },
  { key: 'instagram', labelKey: 'reports.platforms.instagram', icon: Instagram, color: { light: '#EC4899', dark: '#EC4899' } },
  { key: 'whatsapp', labelKey: 'reports.platforms.whatsapp', icon: Phone, color: { light: '#22C55E', dark: '#16A34A' } },
  { key: 'tiktok', labelKey: 'reports.platforms.tiktok', icon: Music2, color: { light: '#0F172A', dark: '#E2E8F0' } },
]

const RANGE_OPTS = [
  { key: 'today', labelKey: 'reports.filters.range.today' },
  { key: 'week', labelKey: 'reports.filters.range.week' },
  { key: 'month', labelKey: 'reports.filters.range.month' },
  { key: 'all', labelKey: 'reports.filters.range.all' },
  { key: 'custom', labelKey: 'reports.filters.range.custom' },
]

// لوحة ألوان تصنيفية بنوزّعها على القنوات بالترتيب — لازمة عشان لو فيه أكتر من قناة لنفس المنصة
// (مثلاً رقمين واتساب) يبقى كل واحدة ليها لون مميز في الشارت بدل ما يترصّوا فوق بعض بلون واحد
const CHANNEL_COLOR_PALETTE = ['#3B82F6', '#22C55E', '#EC4899', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16']

// نفس منطق تسمية القنوات المستخدم في شاشة المحادثات والشات: الاسم المختصر لو محطوط، وإلا لواتساب
// اسم الـ WABA + آخر رقمين من الـ ID، ولباقي المنصات اسم الحساب من ميتا
function getChannelLabel(ch) {
  if (!ch) return null
  if (ch.custom_name) return ch.custom_name
  if (ch.platform === 'whatsapp') {
    const last2 = String(ch.external_id || '').slice(-2)
    return `${ch.display_name || i18n.t('reports.platforms.whatsapp')} #${last2}`
  }
  const platformDef = PLATFORMS.find(p => p.key === ch.platform)
  return ch.display_name || (platformDef ? i18n.t(platformDef.labelKey) : ch.platform)
}

function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function mondayOf(d) {
  const x = new Date(d)
  const day = x.getDay() // 0=أحد
  const diff = (day === 0 ? -6 : 1) - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function formatShort(dateObj) {
  return localeFormatDate(dateObj, { day: 'numeric', month: 'short' })
}

// حدود التاريخ (من/إلى بصيغة ISO) لأي فترة مختارة — نفس المنطق مستخدم في أكتر من تقرير
function computeDateBounds(range, customFrom, customTo) {
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to: null } }
  if (range === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); return { from: d.toISOString(), to: null } }
  if (range === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to: null } }
  if (range === 'custom') {
    if (!customFrom || !customTo) return { from: null, to: null }
    // لو المستخدم اختار "من" بعد "إلى" غلط، بنبدلهم بدل ما نرجع فترة معكوسة تجيب صفر نتايج دايمًا
    let fromStr = customFrom, toStr = customTo
    if (fromStr > toStr) { const tmp = fromStr; fromStr = toStr; toStr = tmp }
    const to = new Date(toStr); to.setHours(23, 59, 59, 999)
    return { from: new Date(fromStr).toISOString(), to: to.toISOString() }
  }
  return { from: null, to: null }
}

// شريط اختيار الفترة (اليوم/أسبوع/شهر/الكل/فترة مخصصة) — قابل لإعادة الاستخدام في أي تقرير
function DateRangeFilter({ range, setRange, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {RANGE_OPTS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${range === r.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-white'}`}>
            {t(r.labelKey)}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="flex items-center gap-2 bg-surface-2 rounded-xl p-3 border border-surface-3">
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">{t('reports.filters.from')}</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">{t('reports.filters.to')}</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>
      )}
    </>
  )
}

// ─── العملاء الجدد / العملاء اللي كلموا ────────────────────────
// تقريرين قريبين من بعض في تاب واحد بتبديلة: "عملاء جدد" = أول مرة يبقى ليهم contact في الداتابيز
// خالص (contacts.created_at)، و"كل العملاء اللي كلموا" = أي عميل بعت رسالة في اليوم ده حتى لو
// مش أول مرة (عدد مختلف كل يوم، من غير تكرار لو كلّم أكتر من مرة في نفس اليوم)
// الفلاتر (لايف سايكل/تاج/قناة/حملة) بتتبعت للسيرفر وتتطبّق كـ SQL مباشر (endpoint
// /reports/customers-timeseries) بدل ما نجيب كل الصفوف المطابقة هنا ونقاطعهم يدويًا

// فلتر العملاء الإضافي — لايف سايكل، تاج، قناة، وحملة/إعلان ممول. بيتحط جنب فلتر المدة الزمنية
// وينفع يتجمّع أكتر من فلتر مع بعض. قايمة الحملات جاية من حساب الإعلانات على ميتا نفسه
function CustomerFiltersPanel({ filters, setFilters, campaigns }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [lifecycles, setLifecycles] = useState([])
  const [tags, setTags] = useState([])
  const [channels, setChannels] = useState([])

  useEffect(() => {
    supabase.from('lifecycle_stages').select('id, name').order('stage_order').then(({ data }) => setLifecycles(data || []))
    supabase.from('tags').select('id, name').order('name').then(({ data }) => setTags(data || []))
    supabase.from('channels').select('id, platform, display_name, custom_name').order('platform').then(({ data }) => setChannels(data || []))
  }, [])

  const activeCount = Object.values(filters).filter(Boolean).length
  const clear = () => setFilters({ lifecycle: '', tag: '', channel: '', campaign: '' })

  return (
    <div className="bg-surface-2 rounded-2xl border border-surface-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm text-fg">
        <span className="flex items-center gap-2">
          <Zap size={14} className="text-fg-muted" />
          {t('reports.filters.additionalFilters')} {activeCount > 0 && <span className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>}
        </span>
        <ChevronDown size={16} className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2.5">
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">{t('reports.filters.lifecycleStage')}</label>
            <select value={filters.lifecycle} onChange={e => setFilters({ ...filters, lifecycle: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">{t('reports.common.all')}</option>
              {lifecycles.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">{t('reports.filters.tag')}</label>
            <select value={filters.tag} onChange={e => setFilters({ ...filters, tag: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">{t('reports.common.all')}</option>
              {tags.map(tg => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">{t('reports.filters.channel')}</label>
            <select value={filters.channel} onChange={e => setFilters({ ...filters, channel: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">{t('reports.common.all')}</option>
              {channels.map(c => {
                const platformDef = PLATFORMS.find(p => p.key === c.platform)
                return (
                  <option key={c.id} value={c.id}>
                    {t('reports.filters.channelOptionLabel', { platform: platformDef ? t(platformDef.labelKey) : c.platform, name: c.custom_name || c.display_name || c.id })}
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">{t('reports.filters.campaigns')}</label>
            <select value={filters.campaign} onChange={e => setFilters({ ...filters, campaign: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">{t('reports.common.all')}</option>
              {campaigns.length === 0 && <option value="" disabled>{t('reports.filters.noCampaigns')}</option>}
              {campaigns.map(c => (
                <optgroup key={c.id} label={c.name}>
                  <option value={`campaign:${c.id}`}>{t('reports.filters.wholeCampaign')}</option>
                  {c.ads.map(a => <option key={a.id} value={`ad:${a.id}`}>↳ {a.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {activeCount > 0 && (
            <button onClick={clear} className="text-xs text-danger hover:underline">{t('reports.filters.clearAll')}</button>
          )}
        </div>
      )}
    </div>
  )
}

function CustomersTab() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [metric, setMetric] = useState('new') // 'new' | 'active'
  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filters, setFilters] = useState({ lifecycle: '', tag: '', channel: '', campaign: '' })
  const [campaigns, setCampaigns] = useState([])
  const [chartData, setChartData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`${API_URL}/ads/campaigns`).then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => setCampaigns([]))
  }, [])

  useEffect(() => {
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return }
    load()
  }, [metric, range, customFrom, customTo, filters])

  const load = async () => {
    setLoading(true)
    const { from, to } = computeDateBounds(range, customFrom, customTo)
    const params = new URLSearchParams({ metric })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (filters.lifecycle) params.set('lifecycle', filters.lifecycle)
    if (filters.tag) params.set('tag', filters.tag)
    if (filters.channel) params.set('channel', filters.channel)
    if (filters.campaign) {
      const [ctype, cid] = filters.campaign.split(':')
      const adIds = ctype === 'ad' ? [cid] : (campaigns.find(c => c.id === cid)?.ads || []).map(a => a.id)
      if (adIds.length) params.set('campaignAdIds', adIds.join(','))
    }

    let dayBuckets = [], apiTotal = 0
    try {
      const res = await apiFetch(`${API_URL}/reports/customers-timeseries?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      dayBuckets = data.buckets || []
      apiTotal = data.total || 0
    } catch { /* بنسيب dayBuckets فاضية، هيعرض "مفيش بيانات" */ }

    // حدود الفترة الفعلية: لو مفيش حد "من" (فترة "الكل")، بناخد أقدم يوم راجع من السيرفر
    const times = dayBuckets.map(b => new Date(b.day).getTime())
    const startDate = from ? new Date(from) : new Date(times.length ? Math.min(...times) : Date.now())
    const endDate = to ? new Date(to) : new Date()
    const spanDays = Math.max(1, Math.round((endDate - startDate) / 86400000))
    const granularity = spanDays > 45 ? 'week' : 'day'

    const buckets = []
    const bucketMap = {}
    if (granularity === 'day') {
      const cur = new Date(startDate); cur.setHours(0, 0, 0, 0)
      const last = new Date(endDate); last.setHours(0, 0, 0, 0)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: formatShort(cur), count: 0 }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 1)
      }
    } else {
      const cur = mondayOf(startDate)
      const last = mondayOf(endDate)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: t('reports.customers.weekLabel', { date: formatShort(cur) }), count: 0 }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 7)
      }
    }

    dayBuckets.forEach(b => {
      const d = new Date(b.day)
      const key = granularity === 'day' ? dayKey(d) : dayKey(mondayOf(d))
      const bucket = bucketMap[key]
      if (bucket) bucket.count += b.count
    })

    setChartData(buckets.map(({ key, label, count }) => ({ key, label, count })))
    setTotal(apiTotal)
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.customers.title')}</h2>

      <div className="flex bg-surface-3 rounded-xl p-0.5">
        <button onClick={() => setMetric('new')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${metric === 'new' ? 'bg-brand text-white' : 'text-fg-muted'}`}>
          {t('reports.customers.metricNew')}
        </button>
        <button onClick={() => setMetric('active')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${metric === 'active' ? 'bg-brand text-white' : 'text-fg-muted'}`}>
          {t('reports.customers.metricActive')}
        </button>
      </div>
      <p className="text-xs text-fg-subtle -mt-2">
        {metric === 'new' ? t('reports.customers.descNew') : t('reports.customers.descActive')}
      </p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      <CustomerFiltersPanel filters={filters} setFilters={setFilters} campaigns={campaigns} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.filters.selectDatesPrompt')}</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">{metric === 'new' ? t('reports.customers.totalNew') : t('reports.customers.totalActive')}</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            {total === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noData')}</p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke={isDark ? '#2c2c2a' : '#e4e4e7'} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: isDark ? '#2c2c2a' : '#e4e4e7' }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ background: isDark ? '#212127' : '#fff', border: `1px solid ${isDark ? '#36363e' : '#e4e4e7'}`, borderRadius: 8, fontSize: 12 }} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── العملاء حسب الدولة ─────────────────────────────────────
// كام عميل جديد دخل من كل دولة، حسب حقل contacts.country — العملاء اللي الحقل ده فاضي عندهم
// بيتحسبوا تحت عمود "بدون" بدل ما يختفوا من التقرير
function CountriesTab() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return }
    load()
  }, [range, customFrom, customTo])

  const load = async () => {
    setLoading(true)
    const { from, to } = computeDateBounds(range, customFrom, customTo)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    try {
      const res = await apiFetch(`${API_URL}/reports/countries?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows((data.rows || []).map(r => ({ country: r.country || t('reports.countries.none'), count: r.count })))
    } catch {
      setRows([])
    }
    setLoading(false)
  }

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.countries.title')}</h2>
      <p className="text-xs text-fg-subtle -mt-2">{t('reports.countries.description')}</p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.filters.selectDatesPrompt')}</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">{t('reports.countries.total')}</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          {rows.length === 0 ? (
            <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noData')}</p>
          ) : (
            <>
              <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={rows} barCategoryGap="20%">
                      <CartesianGrid vertical={false} stroke={isDark ? '#2c2c2a' : '#e4e4e7'} strokeDasharray="3 3" />
                      <XAxis dataKey="country" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: isDark ? '#2c2c2a' : '#e4e4e7' }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: isDark ? '#212127' : '#fff', border: `1px solid ${isDark ? '#36363e' : '#e4e4e7'}`, borderRadius: 8, fontSize: 12 }} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {rows.map((r, i) => <Cell key={r.country} fill={CHANNEL_COLOR_PALETTE[i % CHANNEL_COLOR_PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
                {rows.map(r => (
                  <div key={r.country} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-sm text-fg truncate">{r.country}</span>
                    <div className="w-32 h-1.5 rounded-full bg-surface-3 overflow-hidden hidden sm:block">
                      <div className="h-full bg-brand" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-fg w-10 text-end">{r.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function OverviewTab() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [channel, setChannel] = useState('all') // 'all' أو channel_id بعينه
  const [channelsList, setChannelsList] = useState([]) // القنوات المتربطة فعلياً، كل واحدة باسمها الحقيقي
  const [byChannel, setByChannel] = useState([]) // [{day, channel_id, count}] من السيرفر
  const [byLifecycle, setByLifecycle] = useState([]) // [{lifecycle_stage_id, name, color, count}] من السيرفر
  const [apiTotal, setApiTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/channels`)
        const data = await res.json()
        setChannelsList((data.channels || []).filter(c => c.id))
      } catch { /* لو فشل، هنفضل نعرض التقرير بس من غير أسماء قنوات محددة */ }
    })()
  }, [])

  useEffect(() => {
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return } // استنى لحد ما يختار التاريخين
    load()
  }, [range, customFrom, customTo, channel])

  const getDateBounds = () => {
    if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to: null } }
    if (range === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); return { from: d.toISOString(), to: null } }
    if (range === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return { from: d.toISOString(), to: null } }
    if (range === 'custom') {
      if (!customFrom || !customTo) return { from: null, to: null }
      let fromStr = customFrom, toStr = customTo
      if (fromStr > toStr) { const tmp = fromStr; fromStr = toStr; toStr = tmp }
      const to = new Date(toStr); to.setHours(23, 59, 59, 999)
      return { from: new Date(fromStr).toISOString(), to: to.toISOString() }
    }
    return { from: null, to: null }
  }

  // بنعتمد على تاريخ أول محادثة للعميل على كل قناة (مش تاريخ إنشاء العميل نفسه) عشان نقدر نوزّع
  // العدد على القناة المحددة بالظبط — عميل واحد ممكن يبقى ليه أكتر من محادثة على أكتر من قناة
  const load = async () => {
    setLoading(true)
    const { from, to } = getDateBounds()
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (channel !== 'all') params.set('channel', channel)
    try {
      const res = await apiFetch(`${API_URL}/reports/overview?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setByChannel(data.byChannel || [])
      setByLifecycle(data.byLifecycle || [])
      setApiTotal(data.total || 0)
    } catch {
      setByChannel([]); setByLifecycle([]); setApiTotal(0)
    }
    setLoading(false)
  }

  // كل قناة بيظهرلها اسمها الحقيقي (مش اسم منصة عام) + لون مميز، عشان لو فيه أكتر من قناة لنفس
  // المنصة (أرقام واتساب متعددة مثلاً) متتلخبطش مع بعض في الشارت
  const activeChannels = useMemo(() => {
    const list = channel === 'all' ? channelsList : channelsList.filter(c => c.id === channel)
    return list.map((c, i) => ({ key: c.id, label: getChannelLabel(c) || c.platform, color: CHANNEL_COLOR_PALETTE[i % CHANNEL_COLOR_PALETTE.length] }))
  }, [channelsList, channel])

  // تجميع البيانات المجمّعة من السيرفر: توزيع يومي/أسبوعي لكل قناة + توزيع الـ lifecycle —
  // بيتحسب مرة واحدة لحد ما byChannel/byLifecycle تتغيّر (مصفوفات صغيرة جاهزة من الـ endpoint)
  const { chartData, lifecycleData, total } = useMemo(() => {
    const { from, to } = getDateBounds()

    // حدود الفترة الفعلية: لو مفيش حد "من" (فترة "الكل")، بناخد أقدم يوم راجع من السيرفر
    const createdTimes = byChannel.map(r => new Date(r.day).getTime())
    const startDate = from ? new Date(from) : new Date(createdTimes.length ? Math.min(...createdTimes) : Date.now())
    const endDate = to ? new Date(to) : new Date()
    const spanDays = Math.max(1, Math.round((endDate - startDate) / 86400000))
    const granularity = spanDays > 45 ? 'week' : 'day'

    // ابني قايمة الفترات (buckets) فاضية الأول، عشان الأيام اللي مفيهاش عملاء تظهر بصفر بدل ما تختفي من المحور
    const buckets = []
    const bucketMap = {}
    const emptyChannelCounts = () => Object.fromEntries(activeChannels.map(c => [c.key, 0]))
    if (granularity === 'day') {
      const cur = new Date(startDate); cur.setHours(0, 0, 0, 0)
      const last = new Date(endDate); last.setHours(0, 0, 0, 0)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: formatShort(cur), ...emptyChannelCounts() }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 1)
      }
    } else {
      const cur = mondayOf(startDate)
      const last = mondayOf(endDate)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: t('reports.customers.weekLabel', { date: formatShort(cur) }), ...emptyChannelCounts() }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 7)
      }
    }

    byChannel.forEach(r => {
      const d = new Date(r.day)
      const key = granularity === 'day' ? dayKey(d) : dayKey(mondayOf(d))
      const bucket = bucketMap[key]
      if (bucket && r.channel_id in bucket) bucket[r.channel_id] += r.count
    })

    const lifecycleMap = {} // { stageId|'none': { name, color, count } }
    byLifecycle.forEach(r => {
      const stageKey = r.lifecycle_stage_id || 'none'
      if (!lifecycleMap[stageKey]) lifecycleMap[stageKey] = { name: r.name || t('reports.overview.noStage'), color: r.color || '#78716C', count: 0 }
      lifecycleMap[stageKey].count += r.count
    })

    return {
      chartData: buckets,
      lifecycleData: Object.values(lifecycleMap).sort((a, b) => b.count - a.count),
      total: apiTotal,
    }
  }, [byChannel, byLifecycle, apiTotal, activeChannels, range, customFrom, customTo])

  const chartTheme = isDark
    ? { grid: '#2c2c2a', axis: '#71717a', tooltipBg: '#212127', tooltipBorder: '#36363e', text: '#f8f8fa' }
    : { grid: '#e4e4e7', axis: '#71717a', tooltipBg: '#ffffff', tooltipBorder: '#e4e4e7', text: '#18181b' }

  const BarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.text }}>
        <p className="font-semibold mb-1">{label}</p>
        {payload.map(p => (
          <div key={p.dataKey} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-fg-muted">{activeChannels.find(c => c.key === p.dataKey)?.label}:</span>
            <b>{p.value}</b>
          </div>
        ))}
      </div>
    )
  }

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
      <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.text }}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.payload.color }} />
          <span>{d.name}:</span> <b>{d.value}</b>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.overview.title')}</h2>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {RANGE_OPTS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${range === r.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-white'}`}>
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      {/* فلتر القناة — بيتطبق على كل الشارتات تحت. كل قناة باسمها الحقيقي مش اسم المنصة بس،
          عشان لو فيه أكتر من رقم واتساب مثلاً يبقوا واضحين من بعض */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <button onClick={() => setChannel('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border ${channel === 'all' ? 'bg-fg text-surface border-fg' : 'bg-transparent text-fg-muted border-surface-3 hover:text-fg'}`}>
          {t('reports.overview.allChannels')}
        </button>
        {channelsList.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border ${channel === c.id ? 'bg-fg text-surface border-fg' : 'bg-transparent text-fg-muted border-surface-3 hover:text-fg'}`}>
            {getChannelLabel(c)}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2 bg-surface-2 rounded-xl p-3 border border-surface-3">
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">{t('reports.filters.from')}</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">{t('reports.filters.to')}</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>
      )}

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.filters.selectDatesPrompt')}</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">{t('reports.customers.totalNew')}</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>

          {/* Column Chart — عدد العملاء الجدد لكل يوم (أو أسبوع لو الفترة طويلة) */}
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            <p className="text-sm font-medium text-fg mb-3">{t('reports.overview.dailyBreakdown')}</p>
            {total === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noData')}</p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} barCategoryGap="20%" barGap={2}>
                    <CartesianGrid vertical={false} stroke={chartTheme.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={{ stroke: chartTheme.grid }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                    {activeChannels.length > 1 && <Legend formatter={(v) => activeChannels.find(c => c.key === v)?.label || v} wrapperStyle={{ fontSize: 12, color: chartTheme.text }} />}
                    {activeChannels.map(c => (
                      <Bar key={c.key} dataKey={c.key} name={c.key} fill={c.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Pie Chart — توزيع مراحل الـ Lifecycle */}
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            <p className="text-sm font-medium text-fg mb-3">{t('reports.overview.lifecycleDistribution')}</p>
            {lifecycleData.length === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noData')}</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div style={{ width: '100%', maxWidth: 220, height: 220 }} className="flex-shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={lifecycleData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} stroke={chartTheme.tooltipBg} strokeWidth={2}>
                        {lifecycleData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  {lifecycleData.map((d, i) => {
                    const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-fg flex-1 truncate">{d.name}</span>
                        <span className="text-fg-muted text-xs">{pct}%</span>
                        <span className="font-semibold text-fg w-8 text-end">{d.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── حضور الموظفين ──────────────────────────────────────────
// مصدرين مختلفين هنا: agent_status_log بيسجل بس لما الموظف يدوس زرار تغيير الحالة بنفسه يدوياً
// (متاح/مشغول/غير متاح) — ده بيوضح الحالة اللي هو اختارها، مش بالضرورة كل وقت اشتغاله الفعلي.
// عشان "إجمالي الساعات" يبقى رقم حقيقي نقدر نعتمد عليه حتى لو الموظف نسي يغيّر حالته، بنستخدم
// agent_heartbeats — نبضة بتتسجل كل ~٩٠ ثانية طول ما التاب فاتح وظاهر قدامه (AuthContext)،
// وده بيدينا "كان فاتح التطبيق فعلياً من كذا لحد كذا" بغض النظر عن الحالة اللي هو حاططها
const ATTENDANCE_STATUS_OPTS = [
  { key: 'online', labelKey: 'reports.attendance.status.online', dot: 'bg-success', text: 'text-success' },
  { key: 'busy', labelKey: 'reports.attendance.status.busy', dot: 'bg-follow', text: 'text-follow' },
  { key: 'offline', labelKey: 'reports.attendance.status.offline', dot: 'bg-slate-500', text: 'text-fg-subtle' },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function relTime(dateStr) {
  if (!dateStr) return i18n.t('reports.time.none')
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return i18n.t('reports.time.now')
  if (mins < 60) return i18n.t('reports.time.minutesAgo', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return i18n.t('reports.time.hoursAgo', { count: hours })
  return i18n.t('reports.time.daysAgo', { count: Math.floor(hours / 24) })
}

function formatClock(d) {
  return localeFormatTime(d, { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms) {
  const totalMins = Math.round(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return i18n.t('reports.duration.minutes', { count: m })
  return i18n.t('reports.duration.hoursMinutes', { hours: h, minutes: m })
}

// بيحسب من agent_status_log تايم لاين الحالة (أونلاين/مشغول/أوفلاين) لموظف معين في يوم معين —
// من آخر حالة معروفة قبل بداية اليوم، لحد آخر تغيير فيه (أو دلوقتي لو النهارده)
async function computeDayTimeline(agentId, dateStr) {
  const dayStart = new Date(`${dateStr}T00:00:00`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999`)
  const isToday = dateStr === todayStr()
  const nowClipped = new Date(Math.min(Date.now(), dayEnd.getTime()))

  const { data: before } = await supabase
    .from('agent_status_log').select('status, changed_at')
    .eq('agent_id', agentId).lt('changed_at', dayStart.toISOString())
    .order('changed_at', { ascending: false }).limit(1)
  const { data: within } = await supabase
    .from('agent_status_log').select('status, changed_at')
    .eq('agent_id', agentId)
    .gte('changed_at', dayStart.toISOString()).lte('changed_at', dayEnd.toISOString())
    .order('changed_at', { ascending: true })

  const timeline = [
    { status: before?.[0]?.status || 'offline', at: dayStart },
    ...(within || []).map(r => ({ status: r.status, at: new Date(r.changed_at) })),
  ]

  return timeline.map((entry, i) => {
    const end = timeline[i + 1]?.at || (isToday ? nowClipped : dayEnd)
    return { status: entry.status, start: entry.at, end, ms: Math.max(0, end - entry.at) }
  }).filter(s => s.ms > 0)
}

// الوقت الفعلي اللي الموظف كان فاتح فيه التطبيق في يوم معين، محسوب من كثافة نبضات الحضور —
// أي فجوة بين نبضتين أكبر من ٣ أضعاف فترة النبضة (٩٠ ثانية) معناها التاب اتقفل أو الجهاز نام،
// فبنوقف العد هناك بدل ما نفترض إنه فاضل شغال طول الفجوة دي
const HEARTBEAT_INTERVAL_MS = 90 * 1000
async function computeDayPresenceMs(agentId, dateStr) {
  const dayStart = new Date(`${dateStr}T00:00:00`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999`)
  const { data } = await supabase
    .from('agent_heartbeats').select('at')
    .eq('agent_id', agentId)
    .gte('at', dayStart.toISOString()).lte('at', dayEnd.toISOString())
    .order('at', { ascending: true })

  const beats = (data || []).map(r => new Date(r.at).getTime())
  if (beats.length === 0) return 0

  const gapTolerance = HEARTBEAT_INTERVAL_MS * 3
  let totalMs = HEARTBEAT_INTERVAL_MS // أول نبضة بتفترض إنه كان فاتح على الأقل لمدة فترة نبضة واحدة
  for (let i = 1; i < beats.length; i++) {
    totalMs += Math.min(beats[i] - beats[i - 1], gapTolerance)
  }
  return totalMs
}

function AttendanceTab() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState([])
  const [selectedAgentIds, setSelectedAgentIds] = useState(null) // null لحد ما الموظفين يتحملوا، وقتها بنختارهم كلهم افتراضياً
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [summaries, setSummaries] = useState([]) // [{ agent, totals, segments }]
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [expandedAgentId, setExpandedAgentId] = useState(null)

  useEffect(() => {
    loadAgents()
    const interval = setInterval(loadAgents, 20000) // تحديث دوري لحالة الموظفين الحالية
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedAgentIds?.length) loadSummaries(selectedAgentIds, selectedDate)
    else setSummaries([])
  }, [selectedAgentIds, selectedDate])

  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('id, name, status, is_online, last_seen_at').order('name')
    setAgents(data || [])
    setSelectedAgentIds(prev => prev || (data || []).map(a => a.id)) // أول تحميل: كل الموظفين مختارين
  }

  const loadSummaries = async (agentIds, dateStr) => {
    setLoadingSummaries(true)
    setExpandedAgentId(null)
    const results = await Promise.all(agentIds.map(async id => {
      const [segs, presenceMs] = await Promise.all([
        computeDayTimeline(id, dateStr),
        computeDayPresenceMs(id, dateStr)
      ])
      const totals = { online: 0, busy: 0, offline: 0 }
      segs.forEach(s => { totals[s.status] = (totals[s.status] || 0) + s.ms })
      return { agentId: id, segments: segs, totals, presenceMs }
    }))
    setSummaries(results)
    setLoadingSummaries(false)
  }

  const toggleAgent = (id) => {
    setSelectedAgentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const toggleAll = () => {
    setSelectedAgentIds(prev => prev.length === agents.length ? [] : agents.map(a => a.id))
  }

  const dayTotalMs = 24 * 60 * 60 * 1000
  const expandedSummary = summaries.find(s => s.agentId === expandedAgentId)
  const expandedAgent = agents.find(a => a.id === expandedAgentId)

  const dropdownLabel = !selectedAgentIds || selectedAgentIds.length === agents.length
    ? t('reports.attendance.allAgents')
    : selectedAgentIds.length === 1
      ? agents.find(a => a.id === selectedAgentIds[0])?.name || t('reports.attendance.oneAgent')
      : t('reports.attendance.multipleAgents', { count: selectedAgentIds.length })

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.attendance.title')}</h2>
      <p className="text-xs text-fg-subtle -mt-2">
        {t('reports.attendance.description')}
      </p>

      {/* اختيار الموظفين + التاريخ */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <button onClick={() => setShowAgentDropdown(v => !v)}
            className="w-full flex items-center justify-between bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg">
            <span>{dropdownLabel}</span>
            <ChevronDown size={14} className={`text-fg-subtle transition-transform ${showAgentDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showAgentDropdown && (
            <div className="absolute top-full inset-x-0 mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-20 max-h-72 overflow-y-auto">
              <button onClick={toggleAll}
                className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3/60 text-sm text-start border-b border-surface-3">
                <input type="checkbox" readOnly checked={selectedAgentIds?.length === agents.length} />
                <span className="font-medium text-fg">{t('reports.attendance.selectAll')}</span>
              </button>
              {agents.map(a => {
                const st = ATTENDANCE_STATUS_OPTS.find(s => s.key === (a.status || 'offline')) || ATTENDANCE_STATUS_OPTS[2]
                return (
                  <button key={a.id} onClick={() => toggleAgent(a.id)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3/60 text-sm text-start">
                    <input type="checkbox" readOnly checked={selectedAgentIds?.includes(a.id) || false} />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    <span className="flex-1 text-fg truncate">{a.name}</span>
                    <span className={`text-[11px] flex-shrink-0 ${st.text}`}>
                      {t(st.labelKey)} · {relTime(a.last_seen_at)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <input type="date" value={selectedDate} max={todayStr()} onChange={e => setSelectedDate(e.target.value)}
          className="bg-surface-2 border border-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>

      {/* جدول ملخص الساعات لكل موظف مختار في اليوم ده */}
      {loadingSummaries ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summaries.length > 0 ? (
        <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
          {summaries.map(s => {
            const a = agents.find(ag => ag.id === s.agentId)
            if (!a) return null
            return (
              <button key={s.agentId} onClick={() => setExpandedAgentId(expandedAgentId === s.agentId ? null : s.agentId)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-surface-3/60 transition-colors ${expandedAgentId === s.agentId ? 'bg-surface-3/60' : ''}`}>
                <span className="flex-1 text-sm font-medium text-fg truncate">{a.name}</span>
                <span className="text-xs text-fg-subtle hidden sm:inline">{t('reports.attendance.statusDuration', { duration: formatDuration((s.totals.online || 0) + (s.totals.busy || 0)) })}</span>
                <span className="text-xs text-fg font-semibold w-28 text-end">{t('reports.attendance.actualDuration', { duration: formatDuration(s.presenceMs || 0) })}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.attendance.selectAtLeastOne')}</p>
      )}

      {/* تفاصيل يوم الموظف اللي اتفتح */}
      {expandedAgent && expandedSummary && (
        <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 space-y-3">
          <p className="text-sm font-medium text-fg">{t('reports.attendance.dayDetailsTitle', { name: expandedAgent.name })}</p>

          {!expandedSummary.segments?.length ? (
            <p className="text-center text-fg-subtle text-sm py-8">{t('reports.attendance.noDataForDay', { date: selectedDate })}</p>
          ) : (
            <>
              {/* شريط اليوم الأفقي — 24 ساعة */}
              <div className="flex h-3 rounded-full overflow-hidden bg-surface-3">
                {expandedSummary.segments.map((s, i) => (
                  <div key={i} style={{ width: `${(s.ms / dayTotalMs) * 100}%` }}
                    className={ATTENDANCE_STATUS_OPTS.find(o => o.key === s.status)?.dot} />
                ))}
              </div>
              <div className="flex items-center gap-4 text-xs text-fg-muted">
                {ATTENDANCE_STATUS_OPTS.map(o => (
                  <span key={o.key} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${o.dot}`} /> {t(o.labelKey)}: <b className="text-fg">{formatDuration(expandedSummary.totals[o.key] || 0)}</b>
                  </span>
                ))}
              </div>

              {/* تفاصيل الفترات */}
              <div className="space-y-1.5 pt-1">
                {expandedSummary.segments.filter(s => s.status !== 'offline').map((s, i) => {
                  const st = ATTENDANCE_STATUS_OPTS.find(o => o.key === s.status)
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className="text-fg-muted flex-1">{t(st.labelKey)} {t('reports.filters.from')} {formatClock(s.start)} {t('reports.filters.to')} {formatClock(s.end)}</span>
                      <span className="text-fg font-medium">{formatDuration(s.ms)}</span>
                    </div>
                  )
                })}
                {expandedSummary.segments.every(s => s.status === 'offline') && (
                  <p className="text-center text-fg-subtle text-xs py-2">{t('reports.attendance.allDayOffline')}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── تقرير التاجات ──────────────────────────────────────────
// لكل تاج: عدد العملاء الكلي، وعدد اللي شاتهم لسه مفتوح ومعداش عليه ٢٤ ساعة (دول بس اللي ينفع
// نبعتلهم رسالة جماعية دلوقتي، احترامًا لقيود المنصات على الرسايل خارج نافذة الـ٢٤ ساعة)
function TagsReportTab() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedTagId, setExpandedTagId] = useState(null)
  const [bulkTagId, setBulkTagId] = useState(null)
  const [bulkText, setBulkText] = useState('')
  const [sendingBulk, setSendingBulk] = useState(false)

  useEffect(() => { loadReport() }, [])
  const loadReport = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/tags/report`)
      const data = await res.json()
      setTags(data.tags || [])
    } catch {
      toast.error(t('reports.tags.loadError'))
    }
    setLoading(false)
  }

  const bulkTag = tags.find(tg => tg.id === bulkTagId)

  const sendBulk = async () => {
    if (!bulkText.trim() || !bulkTagId) return
    setSendingBulk(true)
    try {
      const res = await apiFetch(`${API_URL}/tags/${bulkTagId}/bulk-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bulkText.trim(), agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('reports.tags.sendFailed'))
      toast.success(t('reports.tags.sendSuccess', { sent: data.sent }) + (data.failed ? t('reports.tags.sendSuccessFailedSuffix', { failed: data.failed }) : ''))
      setBulkTagId(null)
      setBulkText('')
    } catch (err) {
      toast.error(t('reports.common.errorPrefix', { error: err.message }))
    }
    setSendingBulk(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-fg-subtle">
        {t('reports.tags.description')}
      </p>

      {tags.length === 0 && (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.tags.noTags')}</p>
      )}

      {tags.map(tag => (
        <div key={tag.id} className="bg-surface-2 rounded-2xl border border-surface-3 overflow-hidden">
          <button onClick={() => setExpandedTagId(expandedTagId === tag.id ? null : tag.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-surface-3/40 transition-colors">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
            <span className="flex-1 text-sm font-medium text-fg">{tag.name}</span>
            <span className="text-xs text-fg-subtle">{t('reports.tags.contactsCount', { count: tag.count })}</span>
            {tag.eligibleCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                {t('reports.tags.eligibleCount', { count: tag.eligibleCount })}
              </span>
            )}
            <ChevronDown size={14} className={`text-fg-subtle transition-transform ${expandedTagId === tag.id ? 'rotate-180' : ''}`} />
          </button>

          {expandedTagId === tag.id && (
            <div className="border-t border-surface-3 p-3 space-y-2">
              {tag.contacts.length === 0 ? (
                <p className="text-center text-fg-subtle text-xs py-3">{t('reports.tags.noContactsOnTag')}</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {tag.contacts.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg bg-surface-3/40">
                      <span className="flex-1 text-fg truncate">{c.name || c.platform_id || t('reports.tags.noName')}</span>
                      {c.canBulkMessage ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success flex-shrink-0">{t('reports.tags.openChat')}</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">{t('reports.tags.notAvailable')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setBulkTagId(tag.id); setBulkText('') }} disabled={tag.eligibleCount === 0}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Send size={14} /> {t('reports.tags.bulkMessageButton', { count: tag.eligibleCount })}
              </button>
            </div>
          )}
        </div>
      ))}

      {bulkTagId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !sendingBulk && setBulkTagId(null)}>
          <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-3">
              <span className="font-semibold text-fg text-sm">{t('reports.tags.bulkModalTitle', { name: bulkTag?.name })}</span>
              <button onClick={() => setBulkTagId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-fg-subtle">{t('reports.tags.bulkModalSubtitle', { count: bulkTag?.eligibleCount })}</p>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4} autoFocus
                placeholder={t('reports.tags.bulkPlaceholder')}
                className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setBulkTagId(null)} disabled={sendingBulk}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                {t('reports.tags.cancel')}
              </button>
              <button onClick={sendBulk} disabled={sendingBulk || !bulkText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {sendingBulk ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('reports.tags.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── تقرير أداء الموظفين ─────────────────────────────────────
// سرعة الرد = الوقت بين أول رسالة عميل جديدة والرد الأول عليها من نفس الموظف (بمتوسط كل الردود
// في الفترة المختارة)، مستقبلة من عدد رسائل العملاء في المحادثات اللي الموظف رد فيها، ومبعوتة
// من كل رسايله هو نفسه (من غير الملاحظات الداخلية اللي مش بتتبعت للعميل)
function PerformanceTab() {
  const { t } = useTranslation()
  const [range, setRange] = useState('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAgents() }, [])
  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('id, name, avatar_url').order('name')
    setAgents(data || [])
  }

  useEffect(() => {
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return }
    load()
  }, [range, customFrom, customTo])

  const load = async () => {
    setLoading(true)
    const { from, to } = computeDateBounds(range, customFrom, customTo)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    try {
      const res = await apiFetch(`${API_URL}/reports/performance?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows || [])
    } catch {
      setRows([])
    }
    setLoading(false)
  }

  const stats = useMemo(() => {
    const perAgent = Object.fromEntries(rows.map(r => [r.agent_id, r]))
    return agents.map(a => {
      const st = perAgent[a.id]
      const avgReplyMs = st?.avg_reply_seconds != null ? Number(st.avg_reply_seconds) * 1000 : null
      return {
        agent: a, sent: st?.sent || 0, received: st?.received || 0,
        customers: st?.customers || 0, avgReplyMs
      }
    }).sort((a, b) => b.sent - a.sent)
  }, [rows, agents])

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.performance.title')}</h2>
      <p className="text-xs text-fg-subtle -mt-2">
        {t('reports.performance.description')}
      </p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.filters.selectDatesPrompt')}</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats.every(s => s.sent === 0 && s.received === 0) ? (
        <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noMessages')}</p>
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
          {stats.map(s => (
            <div key={s.agent.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <AgentAvatar agent={s.agent} size={22} />
                <span className="text-sm font-semibold text-fg flex-1 truncate">{s.agent.name}</span>
                <span className="text-xs text-fg-subtle">
                  {s.avgReplyMs != null ? t('reports.performance.avgReply', { duration: formatDuration(s.avgReplyMs) }) : t('reports.performance.noTrackedReplies')}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-fg-muted">{t('reports.performance.received')} <b className="text-fg">{s.received}</b></span>
                <span className="text-fg-muted">{t('reports.performance.sent')} <b className="text-fg">{s.sent}</b></span>
                <span className="text-fg-muted">{t('reports.performance.respondedCustomers')} <b className="text-fg">{s.customers}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentAvatar({ agent, size = 22 }) {
  const [broken, setBroken] = useState(false)
  if (agent?.avatar_url && !broken) {
    return <img src={agent.avatar_url} onError={() => setBroken(true)} alt=""
      style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-surface-3 flex items-center justify-center text-fg-muted font-semibold flex-shrink-0" >
      <span style={{ fontSize: size * 0.45 }}>{agent?.name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  )
}

// ─── تقرير حجم رسايل القنوات ──────────────────────────────────
// كام رسالة واردة (من العميل) دخلت من كل قناة بعينها في فترة معينة
function ChannelVolumeTab() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [range, setRange] = useState('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [channelsList, setChannelsList] = useState([])
  const [channelsLoaded, setChannelsLoaded] = useState(false)
  const [counts, setCounts] = useState(null) // { channel_id|'none': count }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/channels`)
        const data = await res.json()
        setChannelsList((data.channels || []).filter(c => c.id))
      } catch { /* هنعرض بالـ id بس لو فشل */ }
      setChannelsLoaded(true)
    })()
  }, [])

  useEffect(() => {
    if (!channelsLoaded) return
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return }
    load()
  }, [range, customFrom, customTo, channelsLoaded])

  // بنستخدم كويري "عدّ بس" (count: 'exact', head: true) لكل قناة على حدة بدل ما نجيب الصفوف
  // كلها ونعدّها إحنا — سوبابيز بترجع 1000 صف بالأكتر لأي كويري عادي (حتى لو حطينا limit أعلى)،
  // فلو الرسايل أكتر من كده كانت النتيجة بتيجي غلط وأقل من الحقيقي. الـ count الحقيقي مش محدود بكده
  const load = async () => {
    setLoading(true)
    const { from, to } = computeDateBounds(range, customFrom, customTo)
    const buildQuery = (channelId) => {
      let q = supabase.from('messages')
        .select('id, conversations!inner(channel_id)', { count: 'exact', head: true })
        .eq('direction', 'inbound')
        .neq('content_type', 'note')
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', to)
      q = channelId === null ? q.is('conversations.channel_id', null) : q.eq('conversations.channel_id', channelId)
      return q
    }

    const channelIds = channelsList.map(c => c.id)
    const results = await Promise.all([...channelIds.map(id => buildQuery(id)), buildQuery(null)])
    const map = {}
    channelIds.forEach((id, i) => { map[id] = results[i].count || 0 })
    map.none = results[results.length - 1].count || 0
    setCounts(map)
    setLoading(false)
  }

  const rows = useMemo(() => {
    if (!counts) return []
    const list = channelsList.map(c => ({ id: c.id, label: getChannelLabel(c), count: counts[c.id] || 0 }))
    if (counts.none) list.push({ id: 'none', label: t('reports.volume.legacyChannels'), count: counts.none })
    return list.sort((a, b) => b.count - a.count)
  }, [counts, channelsList, t])

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.volume.title')}</h2>
      <p className="text-xs text-fg-subtle -mt-2">{t('reports.volume.description')}</p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">{t('reports.filters.selectDatesPrompt')}</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">{t('reports.volume.totalInbound')}</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          {rows.length === 0 ? (
            <p className="text-center text-fg-subtle text-sm py-10">{t('reports.common.noMessages')}</p>
          ) : (
            <>
              <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={rows} barCategoryGap="25%">
                      <CartesianGrid vertical={false} stroke={isDark ? '#2c2c2a' : '#e4e4e7'} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: isDark ? '#2c2c2a' : '#e4e4e7' }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: isDark ? '#212127' : '#fff', border: `1px solid ${isDark ? '#36363e' : '#e4e4e7'}`, borderRadius: 8, fontSize: 12 }} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {rows.map((r, i) => <Cell key={r.id} fill={CHANNEL_COLOR_PALETTE[i % CHANNEL_COLOR_PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-sm text-fg truncate">{r.label}</span>
                    <div className="w-32 h-1.5 rounded-full bg-surface-3 overflow-hidden hidden sm:block">
                      <div className="h-full bg-brand" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-fg w-10 text-end">{r.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── تصدير بيانات العملاء (Backup) ──────────────────────────────────────
// بيحمّل ملف CSV فيه كل عميل كلّم العيادة بكل البيانات المتاحة عنه: بيانات أساسية، المرحلة،
// التاجات، وكل حقل مخصص عرّفه الأدمن — نسخة احتياطية كاملة تتفتح في إكسل عادي
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function ExportTab() {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')
  const toast = useToast()

  const exportBackup = async () => {
    setExporting(true)
    try {
      setProgress(t('reports.export.fetchingContacts'))
      const contacts = await fetchAllRows(() => supabase.from('contacts').select('*').order('created_at', { ascending: true }))

      setProgress(t('reports.export.fetchingMeta'))
      const [{ data: stages }, { data: tags }, { data: fieldDefs }] = await Promise.all([
        supabase.from('lifecycle_stages').select('id, name'),
        supabase.from('tags').select('id, name'),
        supabase.from('custom_field_definitions').select('id, name').order('name')
      ])
      const stageMap = Object.fromEntries((stages || []).map(s => [s.id, s.name]))
      const tagMap = Object.fromEntries((tags || []).map(tg => [tg.id, tg.name]))

      setProgress(t('reports.export.fetchingContactExtras'))
      const [contactTags, customValues] = await Promise.all([
        fetchAllRows(() => supabase.from('contact_tags').select('contact_id, tag_id')),
        fetchAllRows(() => supabase.from('contact_custom_fields').select('contact_id, field_definition_id, value'))
      ])
      const tagsByContact = {}
      contactTags.forEach(r => {
        if (!tagsByContact[r.contact_id]) tagsByContact[r.contact_id] = []
        if (tagMap[r.tag_id]) tagsByContact[r.contact_id].push(tagMap[r.tag_id])
      })
      const customByContact = {}
      customValues.forEach(r => {
        if (!customByContact[r.contact_id]) customByContact[r.contact_id] = {}
        customByContact[r.contact_id][r.field_definition_id] = r.value
      })

      setProgress(t('reports.export.buildingFile'))
      const PLATFORM_LABEL = { whatsapp: t('reports.platforms.whatsapp'), facebook: t('reports.platforms.facebook'), instagram: t('reports.platforms.instagram'), tiktok: t('reports.platforms.tiktok') }
      const baseHeaders = [
        t('reports.export.headers.name'), t('reports.export.headers.phone'), t('reports.export.headers.country'),
        t('reports.export.headers.platform'), t('reports.export.headers.firstContactDate'), t('reports.export.headers.lifecycleStage'),
        t('reports.export.headers.tags'), t('reports.export.headers.notes'), t('reports.export.headers.blocked')
      ]
      const fieldHeaders = (fieldDefs || []).map(f => f.name)
      const headers = [...baseHeaders, ...fieldHeaders]

      const rows = contacts.map(c => {
        const base = [
          c.name || '',
          c.phone || '',
          c.country || '',
          PLATFORM_LABEL[c.platform] || c.platform || '',
          c.created_at ? localeFormatDate(c.created_at) : '',
          stageMap[c.lifecycle_stage_id] || '',
          (tagsByContact[c.id] || []).join(' / '),
          c.notes || '',
          c.is_blocked ? t('reports.export.yes') : t('reports.export.no')
        ]
        const fields = (fieldDefs || []).map(f => customByContact[c.id]?.[f.id] ?? '')
        return [...base, ...fields]
      })

      const csv = '﻿' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t('reports.export.filenamePrefix')}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t('reports.export.success', { count: contacts.length }))
    } catch (err) {
      toast.error(t('reports.export.exportErrorPrefix', { error: err.message }))
    } finally {
      setExporting(false)
      setProgress('')
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('reports.export.title')}</h2>
      <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 space-y-3">
        <p className="text-sm text-fg-muted leading-relaxed">
          {t('reports.export.description')}
        </p>
        <button onClick={exportBackup} disabled={exporting}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-brand hover:bg-brand-dark text-white transition-colors disabled:opacity-60">
          {exporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {progress || t('reports.export.downloading')}
            </>
          ) : (
            <>
              <Download size={16} />
              {t('reports.export.downloadButton')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
