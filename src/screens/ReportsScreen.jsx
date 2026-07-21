import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { ArrowRight, BarChart3, Users2, Facebook, Instagram, Phone, Tag, ChevronDown, Send, X, Zap, Radio, Globe, Sparkles } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts'

const SECTIONS = [
  { key: 'ai', label: 'تقارير AI', icon: Sparkles },
  { key: 'overview', label: 'نظرة عامة', icon: BarChart3 },
  { key: 'customers', label: 'العملاء', icon: Users2 },
  { key: 'countries', label: 'الدول', icon: Globe },
  { key: 'attendance', label: 'حضور الموظفين', icon: Users2 },
  { key: 'performance', label: 'أداء الموظفين', icon: Zap },
  { key: 'volume', label: 'رسايل القنوات', icon: Radio },
  { key: 'tags', label: 'التاجات', icon: Tag },
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
  const [section, setSection] = useState('overview')
  const { agent } = useAuth()
  const navigate = useNavigate()

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-fg-muted">
      <p>غير مصرح بالوصول</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate('/')} className="text-fg-muted hover:text-fg">
          <ArrowRight size={20} />
        </button>
        <span className="font-bold text-fg">التقارير</span>
      </div>

      {/* Sections */}
      <div className="flex border-b border-surface-3 bg-surface-2 overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${section === s.key ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
            <s.icon size={14} />
            {s.label}
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
      </div>
    </div>
  )
}

// ─── تقارير بالذكاء الاصطناعي — سؤال بالعربي، رد نصي مباشر من الأدوات المضبوطة نفس التقارير ────
const SUGGESTED_QUESTIONS = [
  'كام عميل جديد الأسبوع ده؟',
  'مين أكتر موظف بعت رسايل الشهر ده؟',
  'كام محادثة مفتوحة دلوقتي؟',
  'عدد الرسايل الواردة لكل قناة النهاردة',
]

function AiReportsTab() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([]) // [{ question, answer, loading, error }]
  const [asking, setAsking] = useState(false)

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || asking) return
    setQuestion('')
    setAsking(true)
    const idx = history.length
    setHistory(prev => [...prev, { question: text, answer: null, loading: true, error: null }])
    try {
      const res = await fetch(`${API_URL}/ai/reports-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحصول على إجابة')
      setHistory(prev => prev.map((h, i) => i === idx ? { ...h, answer: data.answer, loading: false } : h))
    } catch (err) {
      setHistory(prev => prev.map((h, i) => i === idx ? { ...h, error: err.message, loading: false } : h))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="p-4 space-y-4 flex flex-col h-full">
      <h2 className="font-semibold text-fg flex items-center gap-2"><Sparkles size={18} className="text-brand" /> تقارير بالـ AI</h2>
      <p className="text-xs text-fg-subtle -mt-2">اكتب سؤالك عن التقارير بالعربي العادي (تاريخ، موظف، قناة، دولة...) وهيرد عليك مباشرة.</p>

      {history.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map(q => (
            <button key={q} onClick={() => ask(q)}
              className="px-3 py-1.5 bg-surface-3 hover:bg-surface-2 rounded-full text-xs text-fg-muted">
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto">
        {history.map((h, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="bg-brand text-white rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm max-w-[85%]">{h.question}</div>
            </div>
            <div className="flex justify-start">
              <div className="bg-surface-2 border border-surface-3 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-fg max-w-[85%]">
                {h.loading ? (
                  <div className="flex items-center gap-2 text-fg-subtle">
                    <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" /> بيدوّر في التقارير...
                  </div>
                ) : h.error ? (
                  <span className="text-danger">خطأ: {h.error}</span>
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
          placeholder="اسأل عن أي حاجة في التقارير..."
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
  { key: 'facebook', label: 'فيسبوك', icon: Facebook, color: { light: '#3B82F6', dark: '#3B82F6' } },
  { key: 'instagram', label: 'إنستجرام', icon: Instagram, color: { light: '#EC4899', dark: '#EC4899' } },
  { key: 'whatsapp', label: 'واتساب', icon: Phone, color: { light: '#22C55E', dark: '#16A34A' } },
]

const RANGE_OPTS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'آخر ٧ أيام' },
  { key: 'month', label: 'الشهر' },
  { key: 'all', label: 'الكل' },
  { key: 'custom', label: 'فترة مخصصة' },
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
    return `${ch.display_name || 'واتساب'} #${last2}`
  }
  return ch.display_name || PLATFORMS.find(p => p.key === ch.platform)?.label || ch.platform
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
  return dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
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
  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {RANGE_OPTS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${range === r.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-white'}`}>
            {r.label}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="flex items-center gap-2 bg-surface-2 rounded-xl p-3 border border-surface-3">
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">من</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">إلى</label>
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
// بتجيب مجموعة IDs العملاء اللي بيطابقوا كل الفلاتر المفعّلة مع بعض (AND بين الأنواع المختلفة).
// null معناها مفيش فلتر خالص (كل العملاء). كل فلتر بيتحسب لوحده كـ Set وبعدين بنتقاطعهم مع بعض
async function getFilteredContactIds({ lifecycle, tag, channel, campaign }, campaignsList) {
  const sets = []
  if (lifecycle) {
    const rows = await fetchAllRows(() => supabase.from('contacts').select('id').eq('lifecycle_stage_id', lifecycle))
    sets.push(new Set(rows.map(r => r.id)))
  }
  if (tag) {
    const rows = await fetchAllRows(() => supabase.from('contact_tags').select('contact_id').eq('tag_id', tag))
    sets.push(new Set(rows.map(r => r.contact_id)))
  }
  if (channel) {
    const rows = await fetchAllRows(() => supabase.from('conversations').select('contact_id').eq('channel_id', channel))
    sets.push(new Set(rows.map(r => r.contact_id)))
  }
  if (campaign) {
    const [type, id] = campaign.split(':')
    let rows
    if (type === 'ad') {
      rows = await fetchAllRows(() => supabase.from('conversations').select('contact_id').eq('ad_referral->>ad_id', id))
    } else {
      // فلتر حملة كاملة — نلاقي كل الإعلانات اللي تحتها من القايمة الجاية من ميتا، ونفلتر بيهم كلهم
      const campaignAdIds = (campaignsList.find(c => c.id === id)?.ads || []).map(a => a.id)
      rows = campaignAdIds.length
        ? await fetchAllRows(() => supabase.from('conversations').select('contact_id').in('ad_referral->>ad_id', campaignAdIds))
        : []
    }
    sets.push(new Set(rows.map(r => r.contact_id)))
  }
  if (!sets.length) return null
  return sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))
}

// فلتر العملاء الإضافي — لايف سايكل، تاج، قناة، وحملة/إعلان ممول. بيتحط جنب فلتر المدة الزمنية
// وينفع يتجمّع أكتر من فلتر مع بعض. قايمة الحملات جاية من حساب الإعلانات على ميتا نفسه
function CustomerFiltersPanel({ filters, setFilters, campaigns }) {
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
          فلاتر إضافية {activeCount > 0 && <span className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>}
        </span>
        <ChevronDown size={16} className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2.5">
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">مرحلة الـ Lifecycle</label>
            <select value={filters.lifecycle} onChange={e => setFilters({ ...filters, lifecycle: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">الكل</option>
              {lifecycles.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">التاج</label>
            <select value={filters.tag} onChange={e => setFilters({ ...filters, tag: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">الكل</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">القناة</label>
            <select value={filters.channel} onChange={e => setFilters({ ...filters, channel: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">الكل</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>
                  {(c.platform === 'whatsapp' ? 'واتساب' : c.platform === 'facebook' ? 'فيسبوك' : 'انستجرام') + ' — ' + (c.custom_name || c.display_name || c.id)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">الإعلانات الممولة / الحملات</label>
            <select value={filters.campaign} onChange={e => setFilters({ ...filters, campaign: e.target.value })}
              className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none">
              <option value="">الكل</option>
              {campaigns.length === 0 && <option value="" disabled>مفيش حملات متاحة (اتأكدي إن حساب الإعلانات متظبط)</option>}
              {campaigns.map(c => (
                <optgroup key={c.id} label={c.name}>
                  <option value={`campaign:${c.id}`}>كل إعلانات الحملة دي</option>
                  {c.ads.map(a => <option key={a.id} value={`ad:${a.id}`}>↳ {a.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {activeCount > 0 && (
            <button onClick={clear} className="text-xs text-danger hover:underline">مسح كل الفلاتر</button>
          )}
        </div>
      )}
    </div>
  )
}

function CustomersTab() {
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
    fetch(`${API_URL}/ads/campaigns`).then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => setCampaigns([]))
  }, [])

  useEffect(() => {
    if (range === 'custom' && !(customFrom && customTo)) { setLoading(false); return }
    load()
  }, [metric, range, customFrom, customTo, filters])

  const load = async () => {
    setLoading(true)
    const { from, to } = computeDateBounds(range, customFrom, customTo)
    const allowedIds = await getFilteredContactIds(filters, campaigns)

    let dayOf // (row) => Date لليوم اللي الصف ده بيتحسب عليه
    let entries
    if (metric === 'new') {
      const buildQ = () => {
        let q = supabase.from('contacts').select('id, created_at').order('created_at', { ascending: true })
        if (from) q = q.gte('created_at', from)
        if (to) q = q.lte('created_at', to)
        if (allowedIds) q = q.in('id', allowedIds.size ? [...allowedIds] : ['00000000-0000-0000-0000-000000000000'])
        return q
      }
      entries = await fetchAllRows(buildQ)
      dayOf = (r) => new Date(r.created_at)
    } else {
      const buildQ = () => {
        let q = supabase.from('messages')
          .select('created_at, conversations!inner(contact_id)')
          .eq('direction', 'inbound').neq('content_type', 'note')
          .order('created_at', { ascending: true })
        if (from) q = q.gte('created_at', from)
        if (to) q = q.lte('created_at', to)
        return q
      }
      entries = await fetchAllRows(buildQ)
      if (allowedIds) entries = entries.filter(r => allowedIds.has(r.conversations?.contact_id))
      dayOf = (r) => new Date(r.created_at)
    }

    // حدود الفترة الفعلية: لو مفيش حد "من" (فترة "الكل")، بناخد أقدم تاريخ موجود في البيانات
    const times = entries.map(r => dayOf(r).getTime())
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
        const entry = { key, label: formatShort(cur), count: 0, _set: metric === 'active' ? new Set() : null }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 1)
      }
    } else {
      const cur = mondayOf(startDate)
      const last = mondayOf(endDate)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: `أسبوع ${formatShort(cur)}`, count: 0, _set: metric === 'active' ? new Set() : null }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 7)
      }
    }

    entries.forEach(r => {
      const d = dayOf(r)
      const key = granularity === 'day' ? dayKey(d) : dayKey(mondayOf(d))
      const bucket = bucketMap[key]
      if (!bucket) return
      if (metric === 'active') {
        const contactId = r.conversations?.contact_id
        if (contactId && !bucket._set.has(contactId)) { bucket._set.add(contactId); bucket.count++ }
      } else {
        bucket.count++
      }
    })

    setChartData(buckets.map(({ key, label, count }) => ({ key, label, count })))
    setTotal(metric === 'active'
      ? new Set(entries.map(r => r.conversations?.contact_id).filter(Boolean)).size
      : entries.length)
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">العملاء</h2>

      <div className="flex bg-surface-3 rounded-xl p-0.5">
        <button onClick={() => setMetric('new')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${metric === 'new' ? 'bg-brand text-white' : 'text-fg-muted'}`}>
          عملاء جدد (أول مرة)
        </button>
        <button onClick={() => setMetric('active')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${metric === 'active' ? 'bg-brand text-white' : 'text-fg-muted'}`}>
          كل العملاء اللي كلموا
        </button>
      </div>
      <p className="text-xs text-fg-subtle -mt-2">
        {metric === 'new'
          ? 'كام عميل جديد اتكلم مع العيادة لأول مرة في كل يوم.'
          : 'كام عميل (جديد أو قديم) بعت رسالة في كل يوم — العميل بيتعدّ مرة واحدة بس لو بعت أكتر من رسالة في نفس اليوم.'}
      </p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      <CustomerFiltersPanel filters={filters} setFilters={setFilters} campaigns={campaigns} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">اختار تاريخ "من" و"إلى" لعرض التقرير</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">{metric === 'new' ? 'إجمالي العملاء الجدد' : 'إجمالي العملاء المختلفين'}</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            {total === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">مفيش بيانات في الفترة دي</p>
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
    const buildQ = () => {
      let q = supabase.from('contacts').select('country, created_at')
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', to)
      return q
    }
    const entries = await fetchAllRows(buildQ)
    const map = {}
    entries.forEach(r => {
      const key = r.country?.trim() || 'بدون'
      map[key] = (map[key] || 0) + 1
    })
    setRows(Object.entries(map).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">العملاء حسب الدولة</h2>
      <p className="text-xs text-fg-subtle -mt-2">كام عميل جديد دخل من كل دولة في الفترة المختارة. "بدون" يعني حقل الدولة فاضي عند العميل.</p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">اختار تاريخ "من" و"إلى" لعرض التقرير</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">إجمالي العملاء</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          {rows.length === 0 ? (
            <p className="text-center text-fg-subtle text-sm py-10">مفيش بيانات في الفترة دي</p>
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
                    <span className="text-sm font-semibold text-fg w-10 text-left">{r.count}</span>
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
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [channel, setChannel] = useState('all') // 'all' أو channel_id بعينه
  const [channelsList, setChannelsList] = useState([]) // القنوات المتربطة فعلياً، كل واحدة باسمها الحقيقي
  const [rows, setRows] = useState([]) // بيانات العملاء الخام بعد الفلترة، عشان نجمّعها محلياً
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/channels`)
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
    const buildQ = () => {
      let q = supabase.from('conversations')
        .select('id, platform, channel_id, created_at, contact_id, contacts(lifecycle_stage_id, lifecycle_stages(name, color))')
        .order('id', { ascending: true })
      if (channel !== 'all') q = q.eq('channel_id', channel)
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', to)
      return q
    }
    setRows(await fetchAllRows(buildQ))
    setLoading(false)
  }

  // كل قناة بيظهرلها اسمها الحقيقي (مش اسم منصة عام) + لون مميز، عشان لو فيه أكتر من قناة لنفس
  // المنصة (أرقام واتساب متعددة مثلاً) متتلخبطش مع بعض في الشارت
  const activeChannels = useMemo(() => {
    const list = channel === 'all' ? channelsList : channelsList.filter(c => c.id === channel)
    return list.map((c, i) => ({ key: c.id, label: getChannelLabel(c) || c.platform, color: CHANNEL_COLOR_PALETTE[i % CHANNEL_COLOR_PALETTE.length] }))
  }, [channelsList, channel])

  // تجميع البيانات الخام: توزيع يومي/أسبوعي لكل قناة + توزيع الـ lifecycle — بيتحسب مرة واحدة لحد ما rows تتغير
  const { chartData, lifecycleData, total } = useMemo(() => {
    const { from, to } = getDateBounds()

    // حدود الفترة الفعلية: لو مفيش حد "من" (فترة "الكل")، بناخد أقدم تاريخ موجود في البيانات
    const createdTimes = rows.map(r => new Date(r.created_at).getTime())
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
        const entry = { key, label: `أسبوع ${formatShort(cur)}`, ...emptyChannelCounts() }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 7)
      }
    }

    const lifecycleMap = {} // { stageId|'none': { name, color, count } }
    rows.forEach(r => {
      const key = granularity === 'day' ? dayKey(r.created_at) : dayKey(mondayOf(r.created_at))
      const bucket = bucketMap[key]
      if (bucket && r.channel_id in bucket) bucket[r.channel_id]++

      const stage = r.contacts?.lifecycle_stages
      const stageKey = r.contacts?.lifecycle_stage_id || 'none'
      if (!lifecycleMap[stageKey]) lifecycleMap[stageKey] = { name: stage?.name || 'بدون مرحلة', color: stage?.color || '#78716C', count: 0 }
      lifecycleMap[stageKey].count++
    })

    return {
      chartData: buckets,
      lifecycleData: Object.values(lifecycleMap).sort((a, b) => b.count - a.count),
      total: rows.length,
    }
  }, [rows, activeChannels, range, customFrom, customTo])

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
      <h2 className="font-semibold text-fg">تقارير العملاء</h2>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {RANGE_OPTS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${range === r.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-white'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* فلتر القناة — بيتطبق على كل الشارتات تحت. كل قناة باسمها الحقيقي مش اسم المنصة بس،
          عشان لو فيه أكتر من رقم واتساب مثلاً يبقوا واضحين من بعض */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <button onClick={() => setChannel('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border ${channel === 'all' ? 'bg-fg text-surface border-fg' : 'bg-transparent text-fg-muted border-surface-3 hover:text-fg'}`}>
          كل القنوات
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
            <label className="block text-xs text-fg-muted mb-1">من</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1">إلى</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="w-full bg-surface-3 rounded-lg px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>
      )}

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">اختار تاريخ "من" و"إلى" لعرض التقرير</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">إجمالي العملاء الجدد</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>

          {/* Column Chart — عدد العملاء الجدد لكل يوم (أو أسبوع لو الفترة طويلة) */}
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            <p className="text-sm font-medium text-fg mb-3">العملاء الجدد — تفصيل يومي</p>
            {total === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">مفيش بيانات في الفترة دي</p>
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
            <p className="text-sm font-medium text-fg mb-3">توزيع مراحل الـ Lifecycle</p>
            {lifecycleData.length === 0 ? (
              <p className="text-center text-fg-subtle text-sm py-10">مفيش بيانات في الفترة دي</p>
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
                        <span className="font-semibold text-fg w-8 text-left">{d.count}</span>
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
  { key: 'online', label: 'متصل', dot: 'bg-success', text: 'text-success' },
  { key: 'busy', label: 'مشغول', dot: 'bg-follow', text: 'text-follow' },
  { key: 'offline', label: 'غير متصل', dot: 'bg-slate-500', text: 'text-fg-subtle' },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function relTime(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  return `منذ ${Math.floor(hours / 24)} يوم`
}

function formatClock(d) {
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms) {
  const totalMins = Math.round(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}د`
  return `${h}س ${m}د`
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
    ? 'كل الموظفين'
    : selectedAgentIds.length === 1
      ? agents.find(a => a.id === selectedAgentIds[0])?.name || 'موظف واحد'
      : `${selectedAgentIds.length} موظفين محددين`

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">حضور الموظفين</h2>
      <p className="text-xs text-fg-subtle -mt-2">
        "فعلياً" = وقت حقيقي متحسوب من إن التطبيق كان فاتح قدام الموظف، مش من حالته اللي هو حاططها بنفسه (ممكن ينسى يغيّرها).
        اضغط على أي موظف تشوف تفاصيل حالاته (متصل/مشغول/غير متصل) على مدار اليوم.
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
            <div className="absolute top-full right-0 left-0 mt-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-20 max-h-72 overflow-y-auto">
              <button onClick={toggleAll}
                className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3/60 text-sm text-right border-b border-surface-3">
                <input type="checkbox" readOnly checked={selectedAgentIds?.length === agents.length} />
                <span className="font-medium text-fg">تحديد الكل</span>
              </button>
              {agents.map(a => {
                const st = ATTENDANCE_STATUS_OPTS.find(s => s.key === (a.status || 'offline')) || ATTENDANCE_STATUS_OPTS[2]
                return (
                  <button key={a.id} onClick={() => toggleAgent(a.id)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-surface-3/60 text-sm text-right">
                    <input type="checkbox" readOnly checked={selectedAgentIds?.includes(a.id) || false} />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    <span className="flex-1 text-fg truncate">{a.name}</span>
                    <span className={`text-[11px] flex-shrink-0 ${st.text}`}>
                      {st.label} · {relTime(a.last_seen_at)}
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
                className={`w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-surface-3/60 transition-colors ${expandedAgentId === s.agentId ? 'bg-surface-3/60' : ''}`}>
                <span className="flex-1 text-sm font-medium text-fg truncate">{a.name}</span>
                <span className="text-xs text-fg-subtle hidden sm:inline">حالته: {formatDuration((s.totals.online || 0) + (s.totals.busy || 0))}</span>
                <span className="text-xs text-fg font-semibold w-28 text-left">فعلياً: {formatDuration(s.presenceMs || 0)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-fg-subtle text-sm py-8">اختار موظف واحد على الأقل</p>
      )}

      {/* تفاصيل يوم الموظف اللي اتفتح */}
      {expandedAgent && expandedSummary && (
        <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 space-y-3">
          <p className="text-sm font-medium text-fg">تفاصيل يوم — {expandedAgent.name}</p>

          {!expandedSummary.segments?.length ? (
            <p className="text-center text-fg-subtle text-sm py-8">مفيش بيانات ليوم {selectedDate}</p>
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
                    <span className={`w-2 h-2 rounded-full ${o.dot}`} /> {o.label}: <b className="text-fg">{formatDuration(expandedSummary.totals[o.key] || 0)}</b>
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
                      <span className="text-fg-muted flex-1">{st.label} من {formatClock(s.start)} لـ {formatClock(s.end)}</span>
                      <span className="text-fg font-medium">{formatDuration(s.ms)}</span>
                    </div>
                  )
                })}
                {expandedSummary.segments.every(s => s.status === 'offline') && (
                  <p className="text-center text-fg-subtle text-xs py-2">الموظف كان غير متصل طول اليوم ده</p>
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
      const res = await fetch(`${API_URL}/tags/report`)
      const data = await res.json()
      setTags(data.tags || [])
    } catch {
      toast.error('فشل تحميل تقرير التاجات')
    }
    setLoading(false)
  }

  const bulkTag = tags.find(t => t.id === bulkTagId)

  const sendBulk = async () => {
    if (!bulkText.trim() || !bulkTagId) return
    setSendingBulk(true)
    try {
      const res = await fetch(`${API_URL}/tags/${bulkTagId}/bulk-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bulkText.trim(), agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال')
      toast.success(`اتبعتت لـ ${data.sent} عميل${data.failed ? ` — فشلت ${data.failed}` : ''}`)
      setBulkTagId(null)
      setBulkText('')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
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
        عدد العملاء لكل تاج، وإمكانية بعت رسالة جماعية للي شاتهم لسه مفتوح ومعداش عليه ٢٤ ساعة (قيود المنصات بتمنع الرد بعد كده).
      </p>

      {tags.length === 0 && (
        <p className="text-center text-fg-subtle text-sm py-8">مفيش تاجات لسه — ضيفها من الإعدادات → التاجات</p>
      )}

      {tags.map(tag => (
        <div key={tag.id} className="bg-surface-2 rounded-2xl border border-surface-3 overflow-hidden">
          <button onClick={() => setExpandedTagId(expandedTagId === tag.id ? null : tag.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-surface-3/40 transition-colors">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
            <span className="flex-1 text-sm font-medium text-fg">{tag.name}</span>
            <span className="text-xs text-fg-subtle">{tag.count} عميل</span>
            {tag.eligibleCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                {tag.eligibleCount} متاح للرسالة الجماعية
              </span>
            )}
            <ChevronDown size={14} className={`text-fg-subtle transition-transform ${expandedTagId === tag.id ? 'rotate-180' : ''}`} />
          </button>

          {expandedTagId === tag.id && (
            <div className="border-t border-surface-3 p-3 space-y-2">
              {tag.contacts.length === 0 ? (
                <p className="text-center text-fg-subtle text-xs py-3">مفيش عملاء على التاج ده</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {tag.contacts.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg bg-surface-3/40">
                      <span className="flex-1 text-fg truncate">{c.name || c.platform_id || 'بدون اسم'}</span>
                      {c.canBulkMessage ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success flex-shrink-0">شات مفتوح</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">مش متاح</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setBulkTagId(tag.id); setBulkText('') }} disabled={tag.eligibleCount === 0}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Send size={14} /> رسالة جماعية ({tag.eligibleCount})
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
              <span className="font-semibold text-fg text-sm">رسالة جماعية — {bulkTag?.name}</span>
              <button onClick={() => setBulkTagId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-fg-subtle">هتتبعت لـ {bulkTag?.eligibleCount} عميل شاتهم لسه مفتوح ومعداش عليه ٢٤ ساعة.</p>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4} autoFocus
                placeholder="اكتب الرسالة اللي هتتبعت..."
                className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setBulkTagId(null)} disabled={sendingBulk}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={sendBulk} disabled={sendingBulk || !bulkText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {sendingBulk ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'إرسال'}
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
    const buildQ = () => {
      let q = supabase.from('messages')
        .select('conversation_id, direction, sent_by_agent_id, content_type, created_at')
        .neq('content_type', 'note')
        .order('created_at', { ascending: true })
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', to)
      return q
    }
    setRows(await fetchAllRows(buildQ))
    setLoading(false)
  }

  const stats = useMemo(() => {
    // اجمع الرسايل حسب المحادثة عشان نمشي على كل محادثة لوحدها بترتيبها الزمني
    const byConv = {}
    rows.forEach(m => { (byConv[m.conversation_id] ||= []).push(m) })

    const perAgent = {} // { agentId: { sent, received, replyTimes: [ms], customers: Set } }
    const ensure = (id) => (perAgent[id] ||= { sent: 0, received: 0, replyTimes: [], customers: new Set() })

    Object.entries(byConv).forEach(([convId, msgs]) => {
      let lastInboundAt = null
      msgs.forEach(m => {
        if (m.direction === 'inbound') {
          lastInboundAt = new Date(m.created_at)
        } else if (m.direction === 'outbound' && m.sent_by_agent_id) {
          const st = ensure(m.sent_by_agent_id)
          st.sent++
          st.customers.add(convId)
          if (lastInboundAt) {
            st.replyTimes.push(new Date(m.created_at) - lastInboundAt)
            st.received++
            lastInboundAt = null // الرد ده بيغطي رسالة العميل، من غير ما نعده تاني في رد جاي
          }
        }
      })
    })

    return agents.map(a => {
      const st = perAgent[a.id] || { sent: 0, received: 0, replyTimes: [], customers: new Set() }
      const avgReplyMs = st.replyTimes.length ? st.replyTimes.reduce((s, x) => s + x, 0) / st.replyTimes.length : null
      return {
        agent: a, sent: st.sent, received: st.received,
        customers: st.customers.size, avgReplyMs
      }
    }).sort((a, b) => b.sent - a.sent)
  }, [rows, agents])

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">أداء الموظفين</h2>
      <p className="text-xs text-fg-subtle -mt-2">
        سرعة الرد (متوسط الوقت من رسالة العميل لحد رد الموظف)، وعدد الرسايل المستقبلة والمبعوتة، وعدد العملاء المختلفين اللي رد عليهم — في الفترة المختارة.
      </p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">اختار تاريخ "من" و"إلى" لعرض التقرير</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats.every(s => s.sent === 0 && s.received === 0) ? (
        <p className="text-center text-fg-subtle text-sm py-10">مفيش رسايل في الفترة دي</p>
      ) : (
        <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
          {stats.map(s => (
            <div key={s.agent.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <AgentAvatar agent={s.agent} size={22} />
                <span className="text-sm font-semibold text-fg flex-1 truncate">{s.agent.name}</span>
                <span className="text-xs text-fg-subtle">
                  {s.avgReplyMs != null ? `متوسط الرد: ${formatDuration(s.avgReplyMs)}` : 'مفيش ردود متتبعة'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-fg-muted">استقبل: <b className="text-fg">{s.received}</b></span>
                <span className="text-fg-muted">بعت: <b className="text-fg">{s.sent}</b></span>
                <span className="text-fg-muted">عملاء اتردّ عليهم: <b className="text-fg">{s.customers}</b></span>
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
        const res = await fetch(`${API_URL}/channels`)
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
    if (counts.none) list.push({ id: 'none', label: 'قنوات قديمة (من غير رقم قناة محدد)', count: counts.none })
    return list.sort((a, b) => b.count - a.count)
  }, [counts, channelsList])

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">رسايل القنوات</h2>
      <p className="text-xs text-fg-subtle -mt-2">عدد الرسايل الواردة من العملاء لكل قناة بعينها، في الفترة المختارة.</p>

      <DateRangeFilter range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {range === 'custom' && !(customFrom && customTo) ? (
        <p className="text-center text-fg-subtle text-sm py-8">اختار تاريخ "من" و"إلى" لعرض التقرير</p>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 text-center">
            <p className="text-xs text-fg-muted mb-1">إجمالي الرسايل الواردة</p>
            <p className="text-3xl font-bold text-fg">{total}</p>
          </div>
          {rows.length === 0 ? (
            <p className="text-center text-fg-subtle text-sm py-10">مفيش رسايل في الفترة دي</p>
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
                    <span className="text-sm font-semibold text-fg w-10 text-left">{r.count}</span>
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
