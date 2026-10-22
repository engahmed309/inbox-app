import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Printer, FileSpreadsheet, RefreshCw, TrendingUp, TrendingDown, Trophy, Zap, MessageCircle, Award, Target, AlertTriangle, Lightbulb } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

// التقرير المجمّع — شاشة واحدة بكل أرقام الفترة + تحليل الذكاء الاصطناعي + تصدير PDF/Excel.
// النصوص عربي ثابت هنا (التقرير بالعربي وناتج الذكاء الاصطناعي بالعربي) بدل مفاتيح الترجمة.

const TZ = 'Africa/Cairo'
export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'))
const ymdCairo = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
function cairoMidnight(ymd) {
  const noon = new Date(`${ymd}T12:00:00Z`)
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(noon).find(p => p.type === 'timeZoneName')?.value || 'GMT+2'
  const m = tz.match(/GMT([+-]\d+)/)
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - (m ? Number(m[1]) : 2) * 3600000)
}
const addDays = (ymd, n) => ymdCairo(new Date(new Date(`${ymd}T12:00:00Z`).getTime() + n * 86400000))

const PRESETS = [
  { key: '7d', label: 'آخر 7 أيام' }, { key: 'prev7', label: 'آخر 7 أيام كاملة' }, { key: '30d', label: 'آخر 30 يوم' },
  { key: 'month', label: 'هذا الشهر' }, { key: 'lastMonth', label: 'الشهر الماضي' }, { key: 'custom', label: 'فترة مخصصة' },
]
export function rangeFor(preset, customFrom, customTo) {
  const today = ymdCairo(new Date())
  let a, b
  if (preset === '7d') { a = addDays(today, -6); b = addDays(today, 1) }
  else if (preset === 'prev7') { a = addDays(today, -7); b = today }   // الأسبوع اللي خلص امبارح (من غير النهارده) — اللي التقرير الأسبوعي بيغطيه
  else if (preset === '30d') { a = addDays(today, -29); b = addDays(today, 1) }
  else if (preset === 'month') { a = `${today.slice(0, 8)}01`; b = addDays(today, 1) }
  else if (preset === 'lastMonth') {
    const first = `${today.slice(0, 8)}01`
    a = `${ymdCairo(new Date(cairoMidnight(first).getTime() - 86400000)).slice(0, 8)}01`; b = first
  } else { if (!customFrom || !customTo || customTo < customFrom) return null; a = customFrom; b = addDays(customTo, 1) }
  return { from: cairoMidnight(a).toISOString(), to: cairoMidnight(b).toISOString(), label: `${a} → ${addDays(b, -1)}` }
}

export const dur = (s) => {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)} ث`
  if (s < 3600) return `${Math.floor(s / 60)} د${Math.round(s % 60) ? ` ${Math.round(s % 60)} ث` : ''}`
  return `${Math.floor(s / 3600)} س ${Math.round((s % 3600) / 60)} د`
}
const PLATFORM_AR = { whatsapp: 'واتساب', facebook: 'فيسبوك', instagram: 'إنستجرام', telegram: 'تيليجرام', tiktok: 'تيك توك' }
const PLATFORM_COLOR = { whatsapp: '#16A34A', facebook: '#3B82F6', instagram: '#EC4899', telegram: '#0EA5E9', tiktok: '#64748B' }
const AREA_AR = { sales: 'مبيعات', service: 'خدمة', content: 'محتوى', ads: 'إعلانات', team: 'فريق', tech: 'تقنية' }
const PRIO = { high: ['أولوية عالية', 'bg-danger/15 text-danger'], medium: ['متوسطة', 'bg-amber-500/15 text-amber-500'], low: ['منخفضة', 'bg-surface-3 text-fg-subtle'] }
const FLAG_AR = { rude_or_dismissive: 'أسلوب جاف/مستهين', ignored_question: 'تجاهل سؤال', pushy: 'إلحاح زائد', wrong_or_risky_info: 'معلومة خاطئة/خطرة', too_short_or_cold: 'ردود باردة/مقتضبة', no_next_step: 'من غير خطوة تالية', copy_paste_feel: 'إحساس نسخ ولصق', slow_gaps: 'فجوات بطيئة' }

function Delta({ pct, invert = false, suffix = '%' }) {
  if (pct == null) return <span className="text-[11px] text-fg-subtle">جديد</span>
  if (pct === 0) return <span className="text-[11px] text-fg-subtle">ثابت</span>
  const good = invert ? pct < 0 : pct > 0
  const Icon = pct > 0 ? TrendingUp : TrendingDown
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${good ? 'text-success' : 'text-danger'}`}><Icon size={12} />{Math.abs(pct)}{suffix}</span>
}
export const Card = ({ title, hint, right, children, className = '' }) => (
  <section className={`bg-surface-2 border border-surface-3 rounded-2xl p-4 break-inside-avoid ${className}`}>
    {(title || right) && (
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1 min-w-0"><h3 className="text-sm font-bold text-fg">{title}</h3>{hint && <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">{hint}</p>}</div>
        {right}
      </div>
    )}
    {children}
  </section>
)
const Kpi = ({ label, value, sub, delta, invert }) => (
  <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5 break-inside-avoid">
    <p className="text-[11px] text-fg-subtle">{label}</p>
    <p className="text-2xl font-bold text-fg mt-1 tabular-nums">{value}</p>
    <div className="mt-1 flex items-center gap-2 flex-wrap">{delta !== undefined && <Delta pct={delta} invert={invert} />}{sub && <span className="text-[11px] text-fg-subtle">{sub}</span>}</div>
  </div>
)

function Spark({ data, color, w = 120, h = 32 }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const pts = data.map((d, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (d.count / max) * (h - 4) - 2}`).join(' ')
  return <svg width={w} height={h} className="overflow-visible"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

// ─── جسم التقرير (بيتعرض على الشاشة وفي نسخة الطباعة) ────────────────────
export function ReportBody({ data, ai, range, print }) {
  const qual = ai?.quality || {}
  const awards = ai?.awards || data.awards
  const agents = data.agents
  const best = (key, dir) => {
    const v = agents.map(a => a[key]).filter(x => x != null)
    return v.length ? (dir === 'min' ? Math.min(...v) : Math.max(...v)) : null
  }
  const bestConv = best('conversion_pct'), bestSpeed = best('median_reply_s', 'min'), bestBk = best('bookings')
  const rev = data.revenue
  const msgs = data.messages
  const teamMedian = (() => { const l = agents.filter(a => a.median_reply_s != null && a.replies_n >= 20).map(a => a.median_reply_s).sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : null })()
  const bookingsChart = data.bookings.daily.map(d => ({ day: d.day.slice(5), count: d.count }))
  const chart = (
    print
      ? <BarChart width={700} height={190} data={bookingsChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} /><Bar dataKey="count" fill="#7C5CFC" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart>
      : <ResponsiveContainer width="100%" height={190}><BarChart data={bookingsChart}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-surface-3))" /><XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgb(var(--color-fg-subtle))' }} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'rgb(var(--color-fg-subtle))' }} width={28} /><Tooltip contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-surface-3))', borderRadius: 8, fontSize: 12 }} formatter={(v) => [v, 'حجوزات']} /><Bar dataKey="count" fill="rgb(var(--color-brand))" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
  )

  return (
    <div className="space-y-4" dir="rtl">
      {print && <div><h1 className="text-xl font-bold text-fg">التقرير المجمّع — د. محمد سعيد</h1><p className="text-xs text-fg-muted mt-1">الفترة: {range.label} (بتوقيت القاهرة) · اتولّد {new Date(data.generated_at).toLocaleString('ar-EG')}</p></div>}

      {/* مؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="حالات اتحوّلت لـ«تم الحجز»" value={fmt(data.bookings.total)} delta={data.bookings.change_pct} sub={`الفترة اللي قبلها: ${fmt(data.bookings.prev_total)}`} />
        <Kpi label="تجديدات اشتراك" value={fmt(data.bookings.renewals)} delta={data.bookings.prev_renewals ? Math.round(((data.bookings.renewals - data.bookings.prev_renewals) * 1000) / data.bookings.prev_renewals) / 10 : null} sub={`قبلها: ${fmt(data.bookings.prev_renewals)}`} />
        <Kpi label="إيراد تقديري (درهم)" value={fmt(Math.round(rev.cur.aed))} delta={rev.change_pct} sub={rev.cur.unpriced ? `+ ${rev.cur.unpriced} اشتراك من غير سعر` : 'اشتراكات مسجّلة × سعر الباقة'} />
        <Kpi label="رسائل واردة" value={fmt(msgs.total.inbound)} delta={msgs.total.change_pct} sub={`قبلها: ${fmt(msgs.total.prev_inbound)}`} />
        <Kpi label="عملاء جدد (من غير كومنتات)" value={fmt(msgs.total.organic_new)} delta={msgs.total.organic_new_change_pct} sub={msgs.total.from_comments ? `+ ${fmt(msgs.total.from_comments)} فتحهم وكيل الكومنتات` : undefined} />
        <Kpi label="وسيط سرعة أول رد (الفريق)" value={dur(teamMedian)} sub="للموظفين اللي ردّوا ٢٠+ مرة" />
      </div>

      {/* الحجوزات والمسار */}
      <Card title="الحجوزات" hint="الحجز = تغيير مرحلة العميل لـ«تم الحجز» (محادثة تتعدّ مرة واحدة). بتوقيت القاهرة.">
        {chart}
        <div className="mt-3 grid sm:grid-cols-3 gap-3 text-[12px]">
          <div><p className="text-fg-subtle mb-1">حسب المنصة</p><div className="flex flex-wrap gap-1.5">{Object.entries(data.bookings.by_platform).map(([k, v]) => <span key={k} className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">{PLATFORM_AR[k] || k}: <b>{v}</b></span>)}</div></div>
          <div><p className="text-fg-subtle mb-1">حسب الدولة</p><div className="flex flex-wrap gap-1.5"><span className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">الخليج: <b>{data.bookings.by_group.gulf}</b></span><span className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">مصر: <b>{data.bookings.by_group.egypt}</b></span><span className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">أخرى: <b>{data.bookings.by_group.other}</b></span></div></div>
          <div><p className="text-fg-subtle mb-1">المصدر</p><div className="flex flex-wrap gap-1.5"><span className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">إعلان: <b>{data.bookings.by_source.ad}</b></span><span className="px-2 py-0.5 rounded-full bg-surface-3 text-fg">عضوي: <b>{data.bookings.by_source.organic}</b></span></div></div>
        </div>
        <div className="mt-4">
          <p className="text-[12px] font-semibold text-fg mb-2">مسار المبيعات</p>
          {[['محادثات جديدة', 'new_conversations'], ['اتبعتلهم الباقات', 'packages'], ['اتبعتلهم طريقة الدفع', 'payment'], ['حجزوا', 'booked']].map(([label, k], i, arr) => {
            const v = data.funnel.cur[k], base = data.funnel.cur.new_conversations || 1
            const prev = i ? data.funnel.cur[arr[i - 1][1]] : null
            return (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <span className="w-32 text-[12px] text-fg-muted flex-shrink-0">{label}</span>
                <div className="flex-1 h-5 bg-surface-3 rounded-md overflow-hidden"><div className="h-full bg-brand/70" style={{ width: `${Math.max(1.5, (v / base) * 100)}%` }} /></div>
                <span className="w-16 text-[12px] tabular-nums text-fg text-end">{fmt(v)}</span>
                <span className="w-24 text-[11px] text-fg-subtle">{prev ? `${Math.round((v * 1000) / prev) / 10}% من اللي قبله` : <Delta pct={data.funnel.prev[k] ? Math.round(((v - data.funnel.prev[k]) * 1000) / data.funnel.prev[k]) / 10 : null} />}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* الموظفين */}
      <Card title="أداء الموظفين" hint="التحويل = حجوزات ÷ عملاء كلّمهم الموظف في الفترة، من غير محادثات وكيل الكومنتات (دي بتتعرض جنب العدد). وسيط أول رد = وقت الرد على أول رسالة من العميل في كل دفعة (الوسيط أدق من المتوسط لأن رد الصبح على رسالة الليل بيبوّظ المتوسط). ساعات الاتصال من نبضات التطبيق.">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] min-w-[860px]">
            <thead><tr className="text-fg-subtle text-start border-b border-surface-3">
              {['الموظف', 'حجوزات', 'عملاء', 'تحويل', 'وسيط أول رد', 'ردّ ≤ 5 د', 'سرعة قبل الحجز', 'ساعات اتصال', 'حجز/ساعة', 'تأخيرات', ...(ai ? ['جودة المحادثة', 'إقناع'] : [])].map(h => <th key={h} className="py-2 px-1.5 font-medium text-start whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {agents.map(a => {
                const q = qual[a.agent_id]
                const cell = (txt, isBest) => <td className={`py-2 px-1.5 tabular-nums whitespace-nowrap ${isBest ? 'text-success font-bold' : 'text-fg'}`}>{txt}</td>
                return (
                  <tr key={a.agent_id} className="border-b border-surface-3/60">
                    <td className="py-2 px-1.5 font-semibold text-fg whitespace-nowrap">{a.name}</td>
                    {cell(a.bookings, a.bookings === bestBk && bestBk > 0)}
                    <td className="py-2 px-1.5 tabular-nums whitespace-nowrap text-fg">{fmt(a.customers)}{a.customers_comments > 0 && <span className="text-[10px] text-fg-subtle"> ({fmt(a.customers_comments)} من الكومنتات)</span>}</td>
                    {cell(a.conversion_pct != null ? `${a.conversion_pct}%` : '—', a.conversion_pct === bestConv && a.customers >= awards.min_customers)}
                    {cell(dur(a.median_reply_s), a.median_reply_s === bestSpeed && a.replies_n >= 20)}
                    {cell(a.within5_pct != null ? `${a.within5_pct}%` : '—')}
                    {cell(dur(a.booked_first_reply_median_s))}
                    {cell(a.online_hours != null ? `${a.online_hours} س` : '—')}
                    {cell(a.bookings_per_online_hour ?? '—')}
                    {cell(a.delayed_alerts ? `${a.delayed_alerts}${a.escalated_alerts ? ` (${a.escalated_alerts} للأدمن)` : ''}` : '0')}
                    {ai && cell(q ? `${q.quality_score}/100` : '—', q && q.quality_score === Math.max(...Object.values(qual).map(x => x.quality_score)))}
                    {ai && cell(q ? `${q.persuasion_score}/100` : '—', q && q.persuasion_score === Math.max(...Object.values(qual).map(x => x.persuasion_score)))}
                  </tr>
                )
              })}
              {!agents.length && <tr><td colSpan={12} className="py-6 text-center text-fg-subtle">مفيش نشاط موظفين في الفترة دي</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-fg-subtle mt-2">«سرعة قبل الحجز» = وسيط أول رد في المحادثات اللي اتحوّلت لحجز في الفترة (بيتحسب على عمر المحادثة كله). الأخضر = الأفضل في العمود.</p>
      </Card>

      {/* الجوائز */}
      <Card title="الموظف المثالي والجوائز" hint={awards.quality_included ? 'الدرجة النهائية = تحويل ٣٥٪ + حجوزات ١٥٪ + سرعة ٢٥٪ + جودة محادثة ٢٥٪ (الجودة من عينة تقييم الذكاء الاصطناعي).' : 'الدرجة النهائية = تحويل ٤٥٪ + حجوزات ٢٠٪ + سرعة ٣٥٪. شغّل تحليل الذكاء الاصطناعي عشان تدخل جودة المحادثة وجائزة الإقناع.'}>
        {awards.ideal ? (
          <div className="grid lg:grid-cols-3 gap-3">
            <div className="lg:col-span-1 rounded-xl border border-brand/40 bg-brand/10 p-3.5">
              <div className="flex items-center gap-2 text-brand"><Trophy size={18} /><span className="text-xs font-bold">الموظف المثالي</span></div>
              <p className="text-lg font-bold text-fg mt-1">{awards.ideal.name}</p>
              <p className="text-3xl font-bold text-brand tabular-nums">{awards.ideal.score}<span className="text-sm text-fg-subtle">/100</span></p>
              <div className="mt-2 space-y-1">
                {[['تحويل', 'conversion'], ['حجوزات', 'bookings'], ['سرعة', 'speed'], ...(awards.quality_included ? [['جودة', 'quality']] : [])].map(([l, k]) => (
                  <div key={k} className="flex items-center gap-2 text-[11px]"><span className="w-10 text-fg-muted">{l}</span><div className="flex-1 h-1.5 bg-surface-3 rounded"><div className="h-full bg-brand rounded" style={{ width: `${awards.ideal.parts[k] ?? 0}%` }} /></div><span className="w-7 text-end tabular-nums text-fg-subtle">{awards.ideal.parts[k] ?? '—'}</span></div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3">
              {[
                ['الأكتر حجوزات', awards.most_bookings, (v) => `${v} حجز`, Target],
                ['الأعلى تحويلًا', awards.best_conversion, (v) => `${v}%`, Award],
                ['الأسرع ردًا', awards.fastest, dur, Zap],
                ['الأكتر إقناعًا (AI)', awards.most_persuasive, (v) => `${v}/100`, MessageCircle],
                ['الأجود محادثة (AI)', awards.best_quality, (v) => `${v}/100`, Award],
              ].map(([title, a, f, Icon]) => (
                <div key={title} className="rounded-xl border border-surface-3 bg-surface p-3">
                  <div className="flex items-center gap-1.5 text-fg-subtle text-[11px]"><Icon size={13} />{title}</div>
                  {a ? (<><p className="text-sm font-bold text-fg mt-1">{a.name}</p><p className="text-[12px] text-brand tabular-nums">{f(a.value)}{a.runner_up && <span className="text-fg-subtle"> · التاني: {a.runner_up.name} ({f(a.runner_up.value)})</span>}</p></>) : <p className="text-[12px] text-fg-subtle mt-1">{title.includes('AI') ? 'بعد تحليل الذكاء الاصطناعي' : '—'}</p>}
                </div>
              ))}
              {awards.ranking.length > 1 && (
                <div className="rounded-xl border border-surface-3 bg-surface p-3 sm:col-span-2">
                  <p className="text-[11px] text-fg-subtle mb-1.5">الترتيب العام (الموظفين اللي كلّموا {fmt(awards.min_customers)}+ عميل)</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">{awards.ranking.map((r, i) => <span key={r.agent_id} className="text-[12px] text-fg"><b className="text-fg-subtle">{i + 1}.</b> {r.name} <b className="text-brand tabular-nums">{r.score}</b></span>)}</div>
                </div>
              )}
            </div>
          </div>
        ) : <p className="text-xs text-fg-subtle">مفيش موظفين عندهم محادثات كفاية للمقارنة في الفترة دي.</p>}
      </Card>

      {/* الرسايل */}
      <Card title="وضع الرسايل" hint="رسايل العملاء الواردة مقارنة بالفترة اللي قبلها بنفس الطول. «من الكومنتات» = محادثات فتحها وكيل الكومنتات برسالة خاصة (مش عملاء جاؤوا لوحدهم).">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {msgs.platforms.map(p => (
            <div key={p.key} className="rounded-xl border border-surface-3 bg-surface p-3.5">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p.key] }} /><span className="text-sm font-bold text-fg">{PLATFORM_AR[p.key] || p.key}</span><span className="flex-1" /><Delta pct={p.change_pct} /></div>
              <p className="text-2xl font-bold text-fg tabular-nums mt-1">{fmt(p.inbound)}</p>
              <p className="text-[11px] text-fg-subtle">رسالة واردة · قبلها {fmt(p.prev_inbound)} · {fmt(p.customers)} عميل</p>
              <div className="mt-2"><Spark data={p.daily} color={PLATFORM_COLOR[p.key]} /></div>
              <p className="text-[11px] text-fg-muted mt-2">محادثات جديدة: <b>{fmt(p.new_conversations)}</b> <Delta pct={p.new_change_pct} />{p.from_comments ? <span className="text-fg-subtle"> · منها {fmt(p.from_comments)} من الكومنتات</span> : null}</p>
              <p className="text-[11px] text-fg-subtle">رسايل صادرة: {fmt(p.outbound)}</p>
            </div>
          ))}
        </div>
        {msgs.whatsapp_numbers.length > 0 && (
          <div className="mt-4">
            <p className="text-[12px] font-semibold text-fg mb-2">أرقام واتساب (رسايل واردة)</p>
            <div className="flex flex-wrap gap-2">{msgs.whatsapp_numbers.map(n => <span key={n.channel_id} className="px-2.5 py-1 rounded-lg bg-surface text-[12px] text-fg border border-surface-3">{n.name}: <b className="tabular-nums">{fmt(n.inbound)}</b> <Delta pct={n.change_pct} /></span>)}</div>
          </div>
        )}
        {msgs.peak_hours.length > 0 && <p className="text-[12px] text-fg-muted mt-3">أكتر ساعات ضغط (بتوقيت القاهرة): {msgs.peak_hours.map(h => `${h.hour}:00 (${fmt(h.count)} رسالة)`).join(' · ')}</p>}
      </Card>

      {/* البوستات */}
      <Card title="وصول البوستات والتفاعل" hint={data.posts?.notes?.join(' · ') || undefined}>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.posts?.instagram && (
            <div className="rounded-xl border border-surface-3 bg-surface p-3.5">
              <p className="text-sm font-bold text-fg flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLOR.instagram }} />إنستجرام</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[12px]">
                <div><p className="text-fg-subtle">وصول الحساب</p><p className="text-lg font-bold text-fg tabular-nums">{fmt(data.posts.instagram.account_reach)}</p></div>
                <div><p className="text-fg-subtle">المتابعين</p><p className="text-lg font-bold text-fg tabular-nums">{fmt(data.posts.instagram.followers)}</p></div>
                <div><p className="text-fg-subtle">منشورات</p><p className="font-bold text-fg tabular-nums">{fmt(data.posts.instagram.posts)}</p></div>
                <div><p className="text-fg-subtle">لايكات / تعليقات</p><p className="font-bold text-fg tabular-nums">{fmt(data.posts.instagram.likes)} / {fmt(data.posts.instagram.comments)}</p></div>
              </div>
              {data.posts.instagram.top?.slice(0, 4).map(t => <p key={t.id} className="text-[11px] text-fg-muted mt-1.5 truncate">• {t.caption || t.type} — {t.reach != null ? `وصول ${fmt(t.reach)}` : ''} {t.views != null ? `· مشاهدات ${fmt(t.views)}` : ''} · ♥ {fmt(t.likes)} · 💬 {fmt(t.comments)}</p>)}
            </div>
          )}
          {data.posts?.facebook && (
            <div className="rounded-xl border border-surface-3 bg-surface p-3.5">
              <p className="text-sm font-bold text-fg flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLOR.facebook }} />فيسبوك</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[12px]">
                <div><p className="text-fg-subtle">الوصول</p>{data.posts.facebook.reach_available ? <p className="text-lg font-bold text-fg tabular-nums">{fmt(data.posts.facebook.views)}</p> : <p className="text-[11px] text-amber-500 flex items-center gap-1"><AlertTriangle size={12} />مش متاح (صلاحية ناقصة)</p>}</div>
                <div><p className="text-fg-subtle">منشورات</p><p className="text-lg font-bold text-fg tabular-nums">{fmt(data.posts.facebook.posts)}</p></div>
                <div><p className="text-fg-subtle">تفاعلات / تعليقات</p><p className="font-bold text-fg tabular-nums">{fmt(data.posts.facebook.reactions)} / {fmt(data.posts.facebook.comments)}</p></div>
                <div><p className="text-fg-subtle">مشاركات</p><p className="font-bold text-fg tabular-nums">{fmt(data.posts.facebook.shares)}</p></div>
              </div>
              {data.posts.facebook.top?.slice(0, 4).map(t => <p key={t.id} className="text-[11px] text-fg-muted mt-1.5 truncate">• {t.caption || 'منشور'} — ♥ {fmt(t.reactions)} · 💬 {fmt(t.comments)} · ↗ {fmt(t.shares)}</p>)}
            </div>
          )}
        </div>
        {data.posts?.top_commented?.length > 0 && (
          <div className="mt-3"><p className="text-[12px] font-semibold text-fg mb-1.5">أكتر منشورات جابت تعليقات (وكام حجز منها)</p>
            {data.posts.top_commented.map((t, i) => <p key={i} className="text-[12px] text-fg-muted truncate">{i + 1}. {PLATFORM_AR[t.platform] || t.platform} — {t.caption} — <b className="text-fg">{fmt(t.comments)}</b> تعليق · <b className="text-fg">{fmt(t.authors)}</b> شخص · حجوزات: <b className="text-success">{fmt(t.bookings)}</b></p>)}
          </div>)}
      </Card>

      {/* الإعلانات وتكلفة الحجز */}
      <Card title="الإعلانات وتكلفة الحجز" hint={data.ads?.note || 'الصرف من ميتا + المحادثات اللي وصلت عندنا فعلًا من الإعلانات ووصلت لأنهي مرحلة. تكلفة الحجز = الصرف ÷ حجوزات الفترة اللي جاية من محادثات إعلانية.'}>
        {data.ads?.available ? (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={`الصرف (${data.ads.currency || ''})`} value={fmt(Math.round(data.ads.spend))} sub={`${fmt(data.ads.impressions)} ظهور · ${fmt(data.ads.clicks)} نقرة`} />
            <Kpi label="محادثات من الإعلانات" value={fmt(data.ads.our_conversations)} sub={data.ads.cost_per_conversation != null ? `${data.ads.cost_per_conversation} ${data.ads.currency || ''} للمحادثة` : `ميتا بتقول ${fmt(data.ads.meta_conversations)}`} />
            <Kpi label="حجوزات من الإعلانات" value={fmt(data.ads.bookings_in_period)} sub={`وصلوا للباقات ${fmt(data.ads.packages)} · للدفع ${fmt(data.ads.payment)}`} />
            <Kpi label="تكلفة الحجز" value={data.ads.cost_per_booking != null ? fmt(data.ads.cost_per_booking) : '—'} sub={data.ads.currency || undefined} />
          </div>
          {data.ads.by_ad.length > 0 && (
            <div className="overflow-x-auto mt-3 -mx-1"><table className="w-full text-[12px] min-w-[560px]">
              <thead><tr className="text-fg-subtle border-b border-surface-3">{['الإعلان', 'الصرف', 'محادثات', 'باقات', 'دفع', 'حجز', 'تكلفة الحجز'].map(h => <th key={h} className="py-1.5 px-1.5 font-medium text-start">{h}</th>)}</tr></thead>
              <tbody>{data.ads.by_ad.map(a => (
                <tr key={a.ad_id} className="border-b border-surface-3/60 text-fg"><td className="py-1.5 px-1.5 max-w-[220px] truncate">{a.name}</td><td className="px-1.5 tabular-nums">{fmt(a.spend)}</td><td className="px-1.5 tabular-nums">{a.conversations}</td><td className="px-1.5 tabular-nums">{a.packages}</td><td className="px-1.5 tabular-nums">{a.payment}</td><td className="px-1.5 tabular-nums">{a.booked}</td><td className="px-1.5 tabular-nums">{a.cost_per_booking != null ? fmt(a.cost_per_booking) : '—'}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>) : <p className="text-xs text-fg-subtle">مفيش صرف إعلاني ولا محادثات من إعلانات في الفترة دي (الإعلانات واقفة). أول ما تشتغل التكلفة هتظهر هنا لوحدها.</p>}
      </Card>

      {/* تحليل الذكاء الاصطناعي */}
      {ai && <SectionBoundary label="تحليل الذكاء الاصطناعي"><AiSection ai={ai} /></SectionBoundary>}
    </div>
  )
}

// حارس محلي: لو جزء من التقرير (زي التحليل) اتكسر مايوقعش الصفحة كلها ولا يعمل ريفريش للتطبيق (الحارس العام بيعمل كده)
class SectionBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Report section failed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger">تعذّر عرض «{this.props.label}»: {String(this.state.error?.message || this.state.error).slice(0, 160)}. جرّب «إعادة التحليل».</div>
  }
}

const A = (x) => (Array.isArray(x) ? x : [])
function AiSection({ ai }) {
  const n = ai.narrative || {}
  const lost = ai.lost || { sample: 0, reasons: [], objections: [], payment_issues: [], who_stopped: {} }
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-brand" />{n.headline}</span>} hint={`تحليل بالذكاء الاصطناعي · ${new Date(ai.generated_at).toLocaleString('ar-EG')} · تكلفة التحليل ≈ ${ai.cost_usd}${ai.truncated ? " · ⚠ الرد اتقطع لطوله وبعض الأقسام ناقصة — ارفع السقف وأعد التحليل" : ""}`}>
        <ul className="space-y-1.5 list-disc ps-5">{A(n.summary).map((s, i) => <li key={i} className="text-[13px] text-fg leading-relaxed">{s}</li>)}</ul>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          {[['الحجوزات', n.bookings_insight], ['الرسايل', n.messages_insight], ['البوستات', n.posts_insight]].filter(x => x[1]).map(([t, b]) => <div key={t} className="rounded-xl bg-surface border border-surface-3 p-3"><p className="text-[12px] font-bold text-fg mb-1">{t}</p><p className="text-[12px] text-fg-muted leading-relaxed">{b}</p></div>)}
        </div>
      </Card>

      {lost.sample > 0 && (
        <Card title="ليه العملاء مابيحجزوش؟" hint={`عينة ${lost.sample} محادثة وصلت للباقات أو الدفع ومحجزتش (من ${fmt(lost.population)} محادثة في الفترة). الأرقام تقريبية — عينة مش حصر.`}>
          <div className="space-y-1.5">{A(lost.reasons).map(r => (
            <div key={r.key} className="flex items-center gap-2"><span className="w-40 text-[12px] text-fg-muted flex-shrink-0">{r.label}</span><div className="flex-1 h-4 bg-surface-3 rounded overflow-hidden"><div className="h-full bg-brand/70" style={{ width: `${r.pct}%` }} /></div><span className="w-20 text-[12px] tabular-nums text-fg text-end">{r.pct}% ({r.count})</span></div>
          ))}</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-[12px]">
            <div><p className="font-semibold text-fg mb-1">مين وقّف المحادثة؟</p><p className="text-fg-muted">العميل: {lost.who_stopped?.customer ?? 0} · الموظف: {lost.who_stopped?.agent ?? 0} · غير واضح: {lost.who_stopped?.unclear ?? 0}</p></div>
            {A(lost.objections).length > 0 && <div><p className="font-semibold text-fg mb-1">أكتر اعتراضات</p><p className="text-fg-muted">{A(lost.objections).map(o => `«${o.text}» (${o.count})`).join(' · ')}</p></div>}
            {A(lost.payment_issues).length > 0 && <div className="sm:col-span-2"><p className="font-semibold text-fg mb-1">مشاكل الدفع المذكورة</p><p className="text-fg-muted">{A(lost.payment_issues).map(o => `${o.text} (${o.count})`).join(' · ')}</p></div>}
          </div>
        </Card>
      )}

      <Card title="ملاحظات على كل موظف" hint="مبنية على أرقامه + تقييم عينة من محادثاته (حتى ١٠ محادثات لكل موظف). الهدف المساعدة والتطوير مش المحاسبة.">
        <div className="grid md:grid-cols-2 gap-3">
          {A(n.agent_notes).map(a => {
            const q = ai.quality?.[a.agent_id]
            return (
              <div key={a.agent_id} className="rounded-xl bg-surface border border-surface-3 p-3.5">
                <p className="text-sm font-bold text-fg">{a.name}</p>
                <p className="text-[12px] text-fg-muted mt-0.5 leading-relaxed">{a.verdict}</p>
                {q && <p className="text-[11px] text-fg-subtle mt-1">عينة {q.n}: أدب {q.politeness}/5 · احترافية {q.professionalism}/5 · وضوح {q.clarity}/5 · إقناع {q.persuasion}/5{Object.keys(q.flags).length ? ` · ملاحظات متكررة: ${Object.entries(q.flags).map(([k, v]) => `${FLAG_AR[k] || k} (${v})`).join('، ')}` : ''}</p>}
                {a.strengths?.length > 0 && <div className="mt-2"><p className="text-[11px] font-semibold text-success">نقاط القوة</p><ul className="list-disc ps-5">{a.strengths.map((s, i) => <li key={i} className="text-[12px] text-fg">{s}</li>)}</ul></div>}
                {a.improve?.length > 0 && <div className="mt-2"><p className="text-[11px] font-semibold text-amber-500">فرص التحسين</p><ul className="list-disc ps-5">{a.improve.map((s, i) => <li key={i} className="text-[12px] text-fg">{s}</li>)}</ul></div>}
                {a.tip && <p className="mt-2 text-[12px] text-brand flex gap-1.5"><Lightbulb size={14} className="flex-shrink-0 mt-0.5" />{a.tip}</p>}
              </div>
            )
          })}
        </div>
        {n.ideal_agent_reason && <p className="mt-3 text-[12px] text-fg-muted"><b className="text-fg">ليه الموظف المثالي؟ </b>{n.ideal_agent_reason}</p>}
      </Card>

      <Card title="توصيات لتطوير الخدمة والمبيعات">
        <div className="space-y-2.5">
          {A(n.recommendations).map((r, i) => (
            <div key={i} className="rounded-xl bg-surface border border-surface-3 p-3 break-inside-avoid">
              <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-bold text-fg">{i + 1}. {r.title}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIO[r.priority]?.[1]}`}>{PRIO[r.priority]?.[0]}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-fg-subtle">{AREA_AR[r.area] || r.area}</span></div>
              <p className="text-[12px] text-fg-muted mt-1 leading-relaxed">{r.detail}</p>
            </div>
          ))}
        </div>
        {A(n.objection_replies).length > 0 && (
          <div className="mt-4"><p className="text-[12px] font-bold text-fg mb-1.5">ردود جاهزة للاعتراضات المتكررة</p>
            <div className="space-y-2">{A(n.objection_replies).map((r, i) => (
              <div key={i} className="rounded-xl bg-surface border border-surface-3 p-3">
                <p className="text-[11px] text-fg-subtle">الاعتراض: «{r.objection}»</p>
                <p className="text-[13px] text-fg mt-1 whitespace-pre-wrap leading-relaxed">{r.reply}</p>
                <button onClick={() => { try { navigator.clipboard.writeText(r.reply) } catch { /* مش مهم */ } }} className="no-print mt-1.5 text-[11px] text-brand hover:underline">نسخ الرد</button>
              </div>
            ))}</div></div>
        )}
        {A(n.team_ideas).length > 0 && <div className="mt-4"><p className="text-[12px] font-bold text-fg mb-1">أفكار لتحفيز الفريق وتطويره</p><ul className="list-disc ps-5 space-y-1">{A(n.team_ideas).map((s, i) => <li key={i} className="text-[12px] text-fg-muted">{s}</li>)}</ul></div>}
        {A(n.caveats).length > 0 && <div className="mt-4 rounded-lg bg-amber-500/10 p-3"><p className="text-[11px] font-bold text-amber-500 mb-1">حدود الأرقام</p><ul className="list-disc ps-5">{A(n.caveats).map((s, i) => <li key={i} className="text-[11px] text-fg-muted">{s}</li>)}</ul></div>}
      </Card>
    </div>
  )
}

// ─── تصدير Excel (CSV بـBOM عشان العربي) ────────────────────────────────
function downloadCsv(data, ai, range) {
  const q = ai?.quality || {}
  const rows = []
  const add = (...r) => rows.push(r)
  add('التقرير المجمّع', range.label)
  add()
  add('الحجوزات', data.bookings.total, 'الفترة السابقة', data.bookings.prev_total, 'تجديدات', data.bookings.renewals, 'إيراد تقديري AED', Math.round(data.revenue.cur.aed))
  add()
  add('الموظف', 'حجوزات', 'عملاء', 'تحويل %', 'وسيط أول رد (ث)', 'ردّ ≤5د %', 'سرعة قبل الحجز (ث)', 'ساعات اتصال', 'حجز/ساعة', 'تأخيرات', 'جودة المحادثة', 'إقناع')
  for (const a of data.agents) add(a.name, a.bookings, a.customers, a.conversion_pct ?? '', a.median_reply_s ?? '', a.within5_pct ?? '', a.booked_first_reply_median_s ?? '', a.online_hours ?? '', a.bookings_per_online_hour ?? '', a.delayed_alerts, q[a.agent_id]?.quality_score ?? '', q[a.agent_id]?.persuasion_score ?? '')
  add()
  add('المنصة', 'رسائل واردة', 'الفترة السابقة', 'تغيّر %', 'محادثات جديدة', 'منها من الكومنتات', 'رسائل صادرة')
  for (const p of data.messages.platforms) add(PLATFORM_AR[p.key] || p.key, p.inbound, p.prev_inbound, p.change_pct ?? '', p.new_conversations, p.from_comments || 0, p.outbound)
  add()
  add('اليوم', 'حجوزات')
  for (const d of data.bookings.daily) add(d.day, d.count)
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `التقرير-المجمع-${range.label.replace(/\s/g, '')}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const STEP_AR = { quality: 'بقيّم جودة محادثات الموظفين', lost: 'بحلّل أسباب العملاء اللي ماحجزوش', write: 'بكتب التحليل والتوصيات' }

export default function ConsolidatedReport() {
  const toast = useToast()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'   // المشرف بيشوف الأرقام وتحليل اتعمل قبل كده، لكن مابيبدأش تحليل جديد (بيصرف)
  const [preset, setPreset] = useState(() => { try { const p = sessionStorage.getItem('consolidated.preset'); if (p) { sessionStorage.removeItem('consolidated.preset'); return p } } catch { /* مش مهم */ } return '7d' })
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState(null)
  const [range, setRange] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ai, setAi] = useState(null)
  const [aiJob, setAiJob] = useState(null)   // { step, progress }
  const [cap, setCap] = useState(() => { try { return Number(localStorage.getItem('consolidated.aiCap')) || 0.25 } catch { return 0.25 } })   // سقف تكلفة التحليل بالدولار
  const [printing, setPrinting] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const r = rangeFor(preset, customFrom, customTo)
    if (!r) return
    const id = ++reqId.current
    setLoading(true); setError(null); setAi(null); setAiJob(null)
    try {
      const res = await apiFetch(`${API_URL}/reports/consolidated?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'تعذّر تحميل التقرير')
      if (id !== reqId.current) return
      setData(d); setRange(r)
      // تحليل اتعمل قبل كده لنفس الفترة (من غير ما نبدأ تحليل جديد ولا نصرف): بيظهر لأي حد بيفتح التقرير، المشرف كمان
      apiFetch(`${API_URL}/reports/consolidated/ai-cached?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`)
        .then(x => x.json()).then(c => { if (id === reqId.current && c?.result) setAi(c.result) }).catch(() => {})
    } catch (err) { if (id === reqId.current) { setError(err.message); setData(null) } }
    finally { if (id === reqId.current) setLoading(false) }
  }, [preset, customFrom, customTo])

  useEffect(() => { if (preset !== 'custom' || (customFrom && customTo)) load() }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const runAi = async (force = false) => {
    if (!range) return
    setAiJob({ step: 'quality', progress: 0 })
    try {
      const res = await apiFetch(`${API_URL}/reports/consolidated/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: range.from, to: range.to, force, max_cost_usd: cap }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      if (d.result) { setAi(d.result); setAiJob(null); return }
      for (let i = 0; i < 120; i++) {   // لحد ~٦ دقايق
        await new Promise(r => setTimeout(r, 3000))
        const sres = await apiFetch(`${API_URL}/reports/consolidated/ai/${d.job_id}`)
        const s = await sres.json()
        if (!sres.ok) throw new Error(s.error)
        if (s.status === 'done') { setAi(s.result); setAiJob(null); return }
        if (s.status === 'error') throw new Error(s.error)
        setAiJob({ step: s.step, progress: s.progress })
      }
      throw new Error('التحليل أخد وقت أطول من المتوقع، جرّب تاني بعد شوية')
    } catch (err) { toast.error(err.message); setAiJob(null) }
  }

  // PDF: بنرسم نسخة الطباعة (فاتحة، من غير أزرار) في portal على الـbody وبنطبع، والـCSS بيخفي باقي التطبيق وقت الطباعة بس
  const printPdf = () => setPrinting(true)
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = setTimeout(() => window.print(), 600)
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done) }
  }, [printing])

  const pill = (active) => `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto pb-24" dir="rtl">
      <style>{`
        .print-root { display: none; }
        @media print {
          #root { display: none !important; }
          .print-root { display: block !important; padding: 16px; --color-surface: 255 255 255; --color-surface-2: 248 248 250; --color-surface-3: 228 228 231; --color-fg: 24 24 27; --color-fg-muted: 82 82 91; --color-fg-subtle: 120 120 130; --color-brand: 124 92 252; --color-success: 13 148 120; --color-danger: 220 38 38; background: #fff; color: rgb(24 24 27); }
          body { background: #fff !important; }
          .break-inside-avoid { break-inside: avoid; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-fg flex-1 min-w-[180px]">التقرير المجمّع</h2>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />تحديث</button>
        <button onClick={() => data && downloadCsv(data, ai, range)} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40"><FileSpreadsheet size={13} />Excel</button>
        <button onClick={printPdf} disabled={!data || printing} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand text-white disabled:opacity-40"><Printer size={13} />تصدير PDF</button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map(p => <button key={p.key} onClick={() => setPreset(p.key)} className={pill(preset === p.key)}>{p.label}</button>)}
        {preset === 'custom' && (
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            من <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1 text-fg" />
            إلى <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1 text-fg" />
          </span>
        )}
        {range && <span className="text-[11px] text-fg-subtle ms-auto">{range.label} · مقارنة بنفس الطول قبلها</span>}
      </div>

      {loading && !data && <div className="py-16 flex flex-col items-center gap-3 text-fg-subtle"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /><p className="text-xs">بجمع الأرقام… (أول مرة بتاخد من نص دقيقة لدقيقة، وبعدها بتتخزّن 5 دقايق)</p></div>}
      {error && <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger">{error}</div>}

      {data && (<>
        <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-brand" />تحليل بالذكاء الاصطناعي</span>}
          hint={`بيقيّم عينة من محادثات كل موظف، ويحلّل أسباب ضياع العملاء، ويكتب التحليل والتوصيات وملاحظات كل موظف، ويضيف جودة المحادثة للموظف المثالي. بياخد حوالي دقيقة-دقيقتين. التكلفة المتوقعة ≈ ${data.ai_estimate_usd ?? '—'} والتحليل بيقف عند السقف اللي تختاره.`}
          right={!aiJob && isAdmin && <div className="flex items-center gap-2 flex-shrink-0"><label className="flex items-center gap-1 text-[11px] text-fg-muted">السقف <select value={cap} onChange={e => { const v = Number(e.target.value); setCap(v); try { localStorage.setItem('consolidated.aiCap', String(v)) } catch { /* مش مهم */ } }} className="bg-surface border border-surface-3 rounded-lg px-1.5 py-1 text-fg">{[0.15, 0.25, 0.5, 1].map(v => <option key={v} value={v}>${v}</option>)}</select></label><button onClick={() => runAi(!!ai)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand text-white"><Sparkles size={13} />{ai ? 'إعادة التحليل' : 'ابدأ التحليل'}</button></div>}>
          {aiJob ? (
            <div className="flex items-center gap-3 text-xs text-fg-muted"><div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />{STEP_AR[aiJob.step] || 'شغّال…'}{aiJob.progress ? ` ${aiJob.progress}%` : ''}</div>
          ) : ai ? <p className="text-xs text-success">التحليل جاهز وظاهر في الصفحة (وبيدخل في PDF وExcel).</p> : <p className="text-xs text-fg-subtle">لسه ماتعملش تحليل لهذه الفترة.</p>}
        </Card>
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}><ReportBody data={data} ai={ai} range={range} /></div>

      </>)}

      {printing && data && createPortal(<div className="print-root" dir="rtl"><ReportBody data={data} ai={ai} range={range} print /></div>, document.body)}
    </div>
  )
}
