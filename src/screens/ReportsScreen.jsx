import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { ArrowRight, BarChart3, Users2, Facebook, Instagram, Phone, Tag, ChevronDown, Send, X } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts'

const SECTIONS = [
  { key: 'overview', label: 'نظرة عامة', icon: BarChart3 },
  { key: 'attendance', label: 'حضور الموظفين', icon: Users2 },
  { key: 'tags', label: 'التاجات', icon: Tag },
]

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
        {section === 'overview' && <OverviewTab />}
        {section === 'attendance' && <AttendanceTab />}
        {section === 'tags' && <TagsReportTab />}
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

const CHANNEL_OPTS = [
  { key: 'all', label: 'كل القنوات' },
  ...PLATFORMS.map(p => ({ key: p.key, label: p.label })),
]

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

function OverviewTab() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [channel, setChannel] = useState('all')
  const [rows, setRows] = useState([]) // بيانات العملاء الخام بعد الفلترة، عشان نجمّعها محلياً
  const [loading, setLoading] = useState(true)

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
      const to = new Date(customTo); to.setHours(23, 59, 59, 999)
      return { from: new Date(customFrom).toISOString(), to: to.toISOString() }
    }
    return { from: null, to: null }
  }

  const load = async () => {
    setLoading(true)
    const { from, to } = getDateBounds()
    let q = supabase.from('contacts').select('id, platform, created_at, lifecycle_stage_id, lifecycle_stages(name, color)')
    if (channel !== 'all') q = q.eq('platform', channel)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }

  // تجميع البيانات الخام: توزيع يومي/أسبوعي لكل قناة + توزيع الـ lifecycle — بيتحسب مرة واحدة لحد ما rows تتغير
  const { chartData, activePlatforms, lifecycleData, total } = useMemo(() => {
    const { from, to } = getDateBounds()
    const activePlatforms = channel === 'all' ? PLATFORMS : PLATFORMS.filter(p => p.key === channel)

    // حدود الفترة الفعلية: لو مفيش حد "من" (فترة "الكل")، بناخد أقدم تاريخ موجود في البيانات
    const createdTimes = rows.map(r => new Date(r.created_at).getTime())
    const startDate = from ? new Date(from) : new Date(createdTimes.length ? Math.min(...createdTimes) : Date.now())
    const endDate = to ? new Date(to) : new Date()
    const spanDays = Math.max(1, Math.round((endDate - startDate) / 86400000))
    const granularity = spanDays > 45 ? 'week' : 'day'

    // ابني قايمة الفترات (buckets) فاضية الأول، عشان الأيام اللي مفيهاش عملاء تظهر بصفر بدل ما تختفي من المحور
    const buckets = []
    const bucketMap = {}
    if (granularity === 'day') {
      const cur = new Date(startDate); cur.setHours(0, 0, 0, 0)
      const last = new Date(endDate); last.setHours(0, 0, 0, 0)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: formatShort(cur), facebook: 0, instagram: 0, whatsapp: 0 }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 1)
      }
    } else {
      const cur = mondayOf(startDate)
      const last = mondayOf(endDate)
      while (cur <= last) {
        const key = dayKey(cur)
        const entry = { key, label: `أسبوع ${formatShort(cur)}`, facebook: 0, instagram: 0, whatsapp: 0 }
        buckets.push(entry); bucketMap[key] = entry
        cur.setDate(cur.getDate() + 7)
      }
    }

    const lifecycleMap = {} // { stageId|'none': { name, color, count } }
    rows.forEach(r => {
      const key = granularity === 'day' ? dayKey(r.created_at) : dayKey(mondayOf(r.created_at))
      const bucket = bucketMap[key]
      if (bucket && r.platform in bucket) bucket[r.platform]++

      const stage = r.lifecycle_stages
      const stageKey = r.lifecycle_stage_id || 'none'
      if (!lifecycleMap[stageKey]) lifecycleMap[stageKey] = { name: stage?.name || 'بدون مرحلة', color: stage?.color || '#78716C', count: 0 }
      lifecycleMap[stageKey].count++
    })

    return {
      chartData: buckets,
      activePlatforms,
      lifecycleData: Object.values(lifecycleMap).sort((a, b) => b.count - a.count),
      total: rows.length,
    }
  }, [rows, channel, range, customFrom, customTo])

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
            <span className="text-fg-muted">{PLATFORMS.find(pl => pl.key === p.dataKey)?.label}:</span>
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

      {/* فلتر القناة — بيتطبق على كل الشارتات تحت */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {CHANNEL_OPTS.map(c => (
          <button key={c.key} onClick={() => setChannel(c.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border ${channel === c.key ? 'bg-fg text-surface border-fg' : 'bg-transparent text-fg-muted border-surface-3 hover:text-fg'}`}>
            {c.label}
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
                    {activePlatforms.length > 1 && <Legend formatter={(v) => PLATFORMS.find(p => p.key === v)?.label || v} wrapperStyle={{ fontSize: 12, color: chartTheme.text }} />}
                    {activePlatforms.map(p => (
                      <Bar key={p.key} dataKey={p.key} name={p.key} fill={p.color[isDark ? 'dark' : 'light']} radius={[4, 4, 0, 0]} maxBarSize={36} />
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
// المصدر الوحيد للحقيقة هنا هو agent_status_log: كل تغيير حالة (أونلاين/مشغول/أوفلاين) بيتسجل فيه
// (AuthContext بيسجله تلقائي عند تسجيل الدخول/الخروج وتبديل التاب وتغيير الحالة يدوياً).
// من التتابع الزمني للتغييرات دي بنقدر نعيد بناء "كان أونلاين من كذا لحد كذا" لأي يوم.
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

function AttendanceTab() {
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [segments, setSegments] = useState(null) // null = مفيش موظف متختار لسه
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  useEffect(() => {
    loadAgents()
    const interval = setInterval(loadAgents, 20000) // تحديث دوري لحالة الموظفين الحالية
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedAgentId) loadTimeline(selectedAgentId, selectedDate)
  }, [selectedAgentId, selectedDate])

  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('id, name, status, is_online, last_seen_at').order('name')
    setAgents(data || [])
  }

  const loadTimeline = async (agentId, dateStr) => {
    setLoadingTimeline(true)
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

    // لو مفيش حالة معروفة قبل بداية اليوم، بنفترض إنه كان أوفلاين لحد أول تغيير نلاقيه
    const timeline = [
      { status: before?.[0]?.status || 'offline', at: dayStart },
      ...(within || []).map(r => ({ status: r.status, at: new Date(r.changed_at) })),
    ]

    const segs = timeline.map((entry, i) => {
      const end = timeline[i + 1]?.at || (isToday ? nowClipped : dayEnd)
      return { status: entry.status, start: entry.at, end, ms: Math.max(0, end - entry.at) }
    }).filter(s => s.ms > 0)

    setSegments(segs)
    setLoadingTimeline(false)
  }

  const totals = useMemo(() => {
    const t = { online: 0, busy: 0, offline: 0 }
    segments?.forEach(s => { t[s.status] = (t[s.status] || 0) + s.ms })
    return t
  }, [segments])

  const selectedAgent = agents.find(a => a.id === selectedAgentId)
  const dayTotalMs = 24 * 60 * 60 * 1000

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">حضور الموظفين</h2>
      <p className="text-xs text-fg-subtle -mt-2">
        الحالة الحالية لكل موظف، وآخر ظهور. اضغط على موظف لعرض تفاصيل يوم معيّن (من كام لحد كام كان متصل).
      </p>

      {/* قايمة الموظفين — الحالة الحالية */}
      <div className="bg-surface-2 rounded-2xl border border-surface-3 divide-y divide-surface-3 overflow-hidden">
        {agents.map(a => {
          const st = ATTENDANCE_STATUS_OPTS.find(s => s.key === (a.status || 'offline')) || ATTENDANCE_STATUS_OPTS[2]
          return (
            <button key={a.id} onClick={() => setSelectedAgentId(a.id === selectedAgentId ? null : a.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-surface-3/60 transition-colors ${selectedAgentId === a.id ? 'bg-surface-3/60' : ''}`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />
              <span className="flex-1 text-sm font-medium text-fg truncate">{a.name}</span>
              <span className={`text-xs ${st.text}`}>{st.label}</span>
              <span className="text-xs text-fg-subtle w-28 text-left">
                {a.status === 'offline' ? `آخر ظهور: ${relTime(a.last_seen_at)}` : `متصل ${relTime(a.last_seen_at) === 'الآن' ? 'الآن' : `من ${relTime(a.last_seen_at)}`}`}
              </span>
            </button>
          )
        })}
        {agents.length === 0 && <p className="text-center text-fg-subtle text-sm py-8">مفيش موظفين</p>}
      </div>

      {/* تفاصيل يوم معيّن للموظف المختار */}
      {selectedAgent && (
        <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">تفاصيل يوم — {selectedAgent.name}</p>
            <input type="date" value={selectedDate} max={todayStr()} onChange={e => setSelectedDate(e.target.value)}
              className="bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          {loadingTimeline ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !segments?.length ? (
            <p className="text-center text-fg-subtle text-sm py-8">مفيش بيانات ليوم {selectedDate}</p>
          ) : (
            <>
              {/* شريط اليوم الأفقي — 24 ساعة */}
              <div className="flex h-3 rounded-full overflow-hidden bg-surface-3">
                {segments.map((s, i) => (
                  <div key={i} style={{ width: `${(s.ms / dayTotalMs) * 100}%` }}
                    className={ATTENDANCE_STATUS_OPTS.find(o => o.key === s.status)?.dot} />
                ))}
              </div>
              <div className="flex items-center gap-4 text-xs text-fg-muted">
                {ATTENDANCE_STATUS_OPTS.map(o => (
                  <span key={o.key} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${o.dot}`} /> {o.label}: <b className="text-fg">{formatDuration(totals[o.key] || 0)}</b>
                  </span>
                ))}
              </div>

              {/* تفاصيل الفترات */}
              <div className="space-y-1.5 pt-1">
                {segments.filter(s => s.status !== 'offline').map((s, i) => {
                  const st = ATTENDANCE_STATUS_OPTS.find(o => o.key === s.status)
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className="text-fg-muted flex-1">{st.label} من {formatClock(s.start)} لـ {formatClock(s.end)}</span>
                      <span className="text-fg font-medium">{formatDuration(s.ms)}</span>
                    </div>
                  )
                })}
                {segments.every(s => s.status === 'offline') && (
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
