import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Printer, RefreshCw, AlertTriangle, CheckCircle2, Lightbulb, Download, ShieldCheck } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

// تقرير الجودة الشهري لرقم الـquality: العملاء اللي الكول سنتر حوّلهم لحجز في الشهر → كام اتبعتلهم من رقم الجودة وكام ردّوا → تقييم تجربتهم على ٨ محاور من
// محادثاتهم + تحليل بالذكاء الاصطناعي + قوائم أرقام للي ماتكلمناش معاهم + تصدير PDF. الأرقام من SQL مباشر؛ التقييم والخلاصة من تحليل مخزّن بسقف تكلفة.

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'))
const pc = (n) => (n == null ? '—' : `${n}%`)
const GREEN = '#0d9478', RED = '#dc2626', AMBER = '#d97706', GRAY = '#a1a1aa', BLUE = '#2563eb'
const RESOLUTION_AR = { resolved: 'اتحلّت', unresolved: 'لسه من غير حل', not_applicable: '—', unknown: '—' }
const STAFF_AR = { good: 'جيد', acceptable: 'مقبول', weak: 'ضعيف', not_applicable: '—' }
const PRIORITY_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }
const PRIORITY_COLOR = { high: RED, medium: AMBER, low: GRAY }
const TIMEFRAME_AR = { this_week: 'هذا الأسبوع', this_month: 'هذا الشهر', next_quarter: 'الربع القادم' }
const LEVEL = { excellent: ['ممتاز', GREEN], good: ['جيد', BLUE], needs_work: ['يحتاج تحسين', AMBER], critical: ['حرج', RED] }
const TOPIC_LABEL = { access: 'سهولة الوصول', speed: 'سرعة الاستجابة', staff: 'تعامل الموظفات', signup: 'الاشتراك والإجراءات', consult: 'الاستشارة الأولى', diet: 'استلام الحمية', followup: 'المتابعة بعد الاستشارة', app: 'التطبيق' }

const currentMonth = () => {
  const d = new Date(Date.now() + 2 * 3600e3)   // قريب من توقيت القاهرة؛ كفاية لتحديد الشهر الافتراضي
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthTitle = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function Card({ title, hint, right, children, className = '' }) {
  return (
    <section className={`rounded-xl bg-surface-2 border border-surface-3 p-4 break-inside-avoid ${className}`}>
      {(title || right) && (
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            {title && <h3 className="font-bold text-fg text-sm">{title}</h3>}
            {hint && <p className="text-[11px] text-fg-subtle mt-0.5 leading-5">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

const PRINT_COLORS = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }
function Bar({ parts }) {
  const total = parts.reduce((s, p) => s + p.v, 0)
  if (!total) return <div className="h-2.5 rounded-full bg-surface-3" style={PRINT_COLORS} />
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-3" style={PRINT_COLORS}>
      {parts.filter(p => p.v > 0).map((p, i) => <div key={i} style={{ width: `${(p.v * 100) / total}%`, background: p.c, ...PRINT_COLORS }} title={`${p.l}: ${p.v}`} />)}
    </div>
  )
}

// فرق عن الشهر السابق: نقاط مئوية، والاتجاه الصح بيختلف (التغطية/الرضا: أعلى أحسن، الشكاوى: أقل أحسن)
function Delta({ cur, prev, lowerIsBetter }) {
  if (cur == null || prev == null) return null
  const d = Math.round((cur - prev) * 10) / 10
  if (d === 0) return <span className="text-[10px] text-fg-subtle"> · ثابت عن الشهر السابق</span>
  const good = lowerIsBetter ? d < 0 : d > 0
  return <span className="text-[10px]" style={{ color: good ? GREEN : RED }}> · {d > 0 ? '▲' : '▼'} {Math.abs(d)} عن الشهر السابق</span>
}

const th = 'py-2 px-2 font-medium text-start border-b border-surface-3 text-fg-subtle'
const td = 'py-2 px-2 border-b border-surface-3/60 text-fg align-top'

function ReportBody({ data, print, onExport, exporting }) {
  const f = data.funnel, fb = data.feedback, n = data.narrative, prev = data.previous
  const hasAnalysis = fb.analyzed > 0 || fb.media_only > 0
  const narrativeTopic = (key) => n?.topics?.find(t => t.key === key)
  const answered = fb.analyzed   // ردّوا بكلام قابل للتقييم
  const lvl = n?.assessment ? LEVEL[n.assessment.level] : null
  const prevAnswered = prev?.feedback?.analyzed
  const prevPositivePct = prevAnswered ? Math.round((prev.feedback.positive * 1000) / prevAnswered) / 10 : null
  const positivePct = answered ? Math.round((fb.positive * 1000) / answered) / 10 : null

  return (
    <div className="space-y-4">
      {print && (
        <header className="border-b-2 border-surface-3 pb-3 mb-2">
          <p className="text-[11px] text-fg-subtle">عيادة الدكتور محمد سعيد · رقم الجودة ({data.channel?.name})</p>
          <h1 className="text-2xl font-bold text-fg mt-1">تقرير الجودة الشهري — {monthTitle(data.month)}</h1>
          <p className="text-[11px] text-fg-subtle mt-1">تاريخ الإصدار: {new Date(data.generated_at).toLocaleDateString('ar-EG-u-nu-latn')} · {data.include_renewals ? 'الفئة: حجوزات الكول سنتر والتجديدات' : 'الفئة: حجوزات الكول سنتر'}</p>
        </header>
      )}

      {n?.headline && (
        <div className="rounded-xl border p-4 break-inside-avoid" style={{ borderColor: lvl ? lvl[1] : undefined }}>
          <div className="flex items-start gap-3">
            <p className="font-bold text-fg flex-1">{n.headline}</p>
            {lvl && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white flex-shrink-0" style={{ background: lvl[1], ...PRINT_COLORS }}>التقييم العام: {lvl[0]}</span>}
          </div>
          {n.assessment?.reason && <p className="text-xs text-fg-muted leading-6 mt-1.5">{n.assessment.reason}</p>}
          {n.executive_summary?.length > 0 && <ul className="list-disc ps-5 mt-2 space-y-1 text-xs text-fg leading-6">{n.executive_summary.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        </div>
      )}

      {/* ١) حجوزات الكول سنتر وتغطية المتابعة */}
      <Card title="١ — حجوزات الكول سنتر وإحصائيات متابعة العملاء" hint={`الفئة المستهدفة: كل عميل حوّله الكول سنتر لـ«تم الحجز» في ${monthTitle(data.month)}${data.include_renewals ? ' (وكذلك التجديدات)' : ''}، كل عميل مرة واحدة. محادثة العميل على رقم الجودة منفصلة عن محادثته مع الكول سنتر، فبنطابقها برقم الهاتف.`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {[
            ['حجوزات الكول سنتر (المطلوب متابعتهم)', fmt(f.should), `${f.new_count} حجز${f.renewal_count ? ` · ${f.renewal_count} تجديد` : ''}`, null],
            ['اتبعتلهم من رقم الجودة', fmt(f.contacted), <>{pc(f.contacted_pct)} من المطلوب<Delta cur={f.contacted_pct} prev={prev?.funnel?.contacted_pct} /></>, null],
            ['لم يتم التواصل معهم', fmt(f.not_contacted), `${fmt(f.reachable_not_contacted)} عندهم واتساب · ${fmt(f.no_phone)} بدون رقم`, null],
            ['ردّوا', fmt(f.replied), <>{pc(f.replied_pct)} ممّن اتبعتلهم<Delta cur={f.replied_pct} prev={prev?.funnel?.replied_pct} /></>, null],
            ['تم التواصل ومردّوش', fmt(f.not_replied), 'ممكن نعيد التواصل معهم', null],
            ['تقييم إيجابي', hasAnalysis ? fmt(fb.positive) : '—', hasAnalysis ? <>{pc(positivePct)} ممّن قيّموا<Delta cur={positivePct} prev={prevPositivePct} /></> : 'يظهر بعد التحليل', null],
            ['ملاحظات أو شكاوى', hasAnalysis ? fmt(fb.notes_or_complaints) : '—', hasAnalysis ? `منها ${fb.complaints} شكوى` : 'يظهر بعد التحليل', null]
          ].map(([l, v, s]) => (
            <div key={l} className="rounded-lg bg-surface border border-surface-3 p-3">
              <p className="text-[11px] text-fg-subtle">{l}</p>
              <p className="text-2xl font-bold text-fg tabular-nums mt-0.5">{v}</p>
              <p className="text-[10px] text-fg-muted mt-0.5">{s}</p>
            </div>
          ))}
        </div>
        <Bar parts={[{ l: 'ردّوا', v: f.replied, c: GREEN }, { l: 'مردّوش', v: f.not_replied, c: AMBER }, { l: 'لم يتم التواصل', v: f.not_contacted, c: GRAY }]} />
        <div className="flex gap-3 flex-wrap text-[10px] text-fg-muted mt-1.5">
          <span><i className="inline-block w-2 h-2 rounded-full me-1" style={{ background: GREEN }} />ردّوا</span>
          <span><i className="inline-block w-2 h-2 rounded-full me-1" style={{ background: AMBER }} />تم التواصل ومردّوش</span>
          <span><i className="inline-block w-2 h-2 rounded-full me-1" style={{ background: GRAY }} />لم يتم التواصل</span>
        </div>

        {!print && onExport && (
          <div className="flex gap-2 flex-wrap mt-4">
            <button onClick={() => onExport('not_contacted')} disabled={!!exporting || !f.reachable_not_contacted} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg hover:bg-surface-3/70 disabled:opacity-40"><Download size={13} />أرقام اللي ماتكلمناش معاهم ({fmt(f.reachable_not_contacted)}) — CSV</button>
            <button onClick={() => onExport('not_replied')} disabled={!!exporting || !f.not_replied} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg hover:bg-surface-3/70 disabled:opacity-40"><Download size={13} />أرقام اللي مردّوش ({fmt(f.not_replied)}) — CSV</button>
          </div>
        )}

        {data.by_agent?.length > 0 && (
          <div className="mt-5">
            <h4 className="font-bold text-fg text-xs mb-1">تغطية المتابعة حسب موظف الكول سنتر اللي سجّل الحجز</h4>
            <table className="w-full text-[11px]">
              <thead><tr><th className={th}>الموظف</th><th className={th}>حجوزاته</th><th className={th}>اتبعتلهم من الجودة</th><th className={th}>نسبة التغطية</th><th className={th}>ردّوا</th><th className={th}>بدون رقم واتساب</th></tr></thead>
              <tbody>{data.by_agent.map(a => (
                <tr key={a.agent_id}><td className={`${td} font-medium`}>{a.name}</td><td className={td}>{a.bookings}</td><td className={td}>{a.contacted}</td><td className={`${td} tabular-nums`}>{pc(a.contacted_pct)}</td><td className={td}>{a.replied}</td><td className={td}>{a.no_phone}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        <table className="w-full text-[11px] mt-4">
          <thead><tr><th className={th}>البند</th><th className={th}>العدد</th><th className={th}>ملاحظة</th></tr></thead>
          <tbody>
            <tr><td className={td}>لم يتم التواصل معهم</td><td className={td}>{fmt(f.not_contacted)}</td><td className={td}>{fmt(f.reachable_not_contacted)} عندهم رقم واتساب ولم نتواصل معهم، و{fmt(f.no_phone)} من غير رقم واتساب (فيسبوك/إنستجرام/تيليجرام) فلا يمكن الوصول لهم من هذا الرقم</td></tr>
            <tr><td className={td}>المدة من الحجز لأول تواصل</td><td className={td}>{f.median_days_to_contact != null ? `${f.median_days_to_contact} يوم` : '—'}</td><td className={td}>الوسيط · وفي 90% من الحالات خلال {f.p90_days_to_contact != null ? `${f.p90_days_to_contact} يوم` : '—'}</td></tr>
            {hasAnalysis && <tr><td className={td}>ردّوا برسالة صوتية أو صورة فقط</td><td className={td}>{fmt(fb.media_only)}</td><td className={td}>لم يمكن تقييمهم (لا يوجد نص مكتوب) ولا يدخلون في نسب التقييم</td></tr>}
            {hasAnalysis && <tr><td className={td}>محايد (ردّ بشكر أو تأكيد من غير تقييم)</td><td className={td}>{fmt(fb.neutral + fb.no_feedback)}</td><td className={td}>تقييم مختلط (راضٍ عن أمور وشاكٍ من أخرى): {fmt(fb.mixed)} · سلبي: {fmt(fb.negative)}</td></tr>}
            <tr><td className={td}>محادثات أخرى على الرقم</td><td className={td}>{fmt(data.other_conversations)}</td><td className={td}>عملاء حجزهم في شهور أخرى، أو كتبوا للرقم بأنفسهم؛ ليست ضمن الفئة المستهدفة</td></tr>
          </tbody>
        </table>
        {n?.coverage_insight && <p className="text-xs text-fg leading-6 mt-3 pt-3 border-t border-surface-3"><b>تحليل التغطية:</b> {n.coverage_insight}</p>}
        {n?.vs_previous && <p className="text-xs text-fg leading-6 mt-2"><b>مقارنة بالشهر السابق:</b> {n.vs_previous}</p>}
      </Card>

      {/* ٢) المحاور */}
      <Card title="٢ — تقييم تجربة العميل من بداية التواصل" hint={hasAnalysis ? `من محادثات ${fmt(answered)} عميل ردّوا برسالة مكتوبة. «لم يذكر» = لم يتطرق العميل للمحور. نسبة الرضا = إيجابي ÷ من ذكروا المحور.` : 'لسه ماتعملش تحليل لمحادثات هذا الشهر — اضغط «ابدأ التحليل» لتظهر النتائج.'}>
        {hasAnalysis ? (<>
          <table className="w-full text-[11px]">
            <thead><tr><th className={th}>المحور</th><th className={th}>إيجابي</th><th className={th}>سلبي</th><th className={th}>ملاحظات</th><th className={th}>لم يذكر</th><th className={th}>نسبة الرضا</th><th className={`${th} w-32`} /></tr></thead>
            <tbody>{fb.topics.map(t => {
              const pt = prev?.feedback?.topics?.find(x => x.key === t.key)
              return (
                <tr key={t.key}>
                  <td className={`${td} font-medium`}>{t.label}</td>
                  <td className={td} style={{ color: GREEN }}>{t.positive}</td>
                  <td className={td} style={{ color: RED }}>{t.negative}</td>
                  <td className={td} style={{ color: AMBER }}>{t.neutral}</td>
                  <td className={`${td} text-fg-muted`}>{Math.max(0, answered - t.mentioned)}</td>
                  <td className={`${td} tabular-nums`}>{t.mentioned ? pc(t.positive_pct) : '—'}{t.mentioned >= 5 && pt?.mentioned >= 5 && <Delta cur={t.positive_pct} prev={pt.positive_pct} />}</td>
                  <td className={td}><Bar parts={[{ l: 'إيجابي', v: t.positive, c: GREEN }, { l: 'ملاحظات', v: t.neutral, c: AMBER }, { l: 'سلبي', v: t.negative, c: RED }]} /></td>
                </tr>
              )
            })}</tbody>
          </table>

          <div className="space-y-3 mt-5">
            {fb.topics.map(t => {
              const nt = narrativeTopic(t.key)
              const samples = t.negative_notes.slice(0, 3)
              const extra = samples.length ? samples : t.neutral_notes.slice(0, 2)
              if (!t.mentioned && !nt?.summary) return null
              return (
                <div key={t.key} className="rounded-lg bg-surface border border-surface-3 p-3 break-inside-avoid">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-fg text-xs flex-1">{t.label}</h4>
                    <span className="text-[10px]" style={{ color: GREEN }}>إيجابي {t.positive}</span>
                    <span className="text-[10px]" style={{ color: RED }}>سلبي {t.negative}</span>
                    <span className="text-[10px]" style={{ color: AMBER }}>ملاحظات {t.neutral}</span>
                  </div>
                  {nt?.summary && <p className="text-xs text-fg leading-6 mt-1.5">{nt.summary}</p>}
                  {nt?.themes?.length > 0 && (
                    <ul className="mt-2 space-y-1">{nt.themes.map((th2, i) => (
                      <li key={i} className="text-[11px] text-fg flex gap-2"><span className="font-bold tabular-nums" style={{ color: th2.sentiment === 'positive' ? GREEN : th2.sentiment === 'negative' ? RED : AMBER }}>{th2.count}</span><span>{th2.title}</span></li>
                    ))}</ul>
                  )}
                  {!nt?.themes?.length && extra.length > 0 && (
                    <ul className="mt-2 space-y-1 list-disc ps-5">{extra.map((x, i) => <li key={i} className="text-[11px] text-fg-muted">{x.text}</li>)}</ul>
                  )}
                  {nt?.action && <p className="text-[11px] mt-2 flex gap-1.5 items-start" style={{ color: AMBER }}><Lightbulb size={12} className="mt-0.5 flex-shrink-0" />{nt.action}</p>}
                </div>
              )
            })}
          </div>
        </>) : null}
      </Card>

      {/* ٣) نقاط القوة والأسباب الجذرية */}
      {(n?.strengths?.length > 0 || n?.problems?.length > 0) && (
        <Card title="٣ — نقاط القوة وأهم المشاكل وأسبابها">
          {n.strengths?.length > 0 && (
            <div className="mb-4">
              <h4 className="font-bold text-xs mb-1.5" style={{ color: GREEN }}>اللي العملاء مدحوه</h4>
              <ul className="space-y-1.5">{n.strengths.map((s, i) => <li key={i} className="text-xs text-fg leading-6 break-inside-avoid"><b>{s.title}</b>{s.evidence ? <span className="text-fg-muted"> — {s.evidence}</span> : null}</li>)}</ul>
            </div>
          )}
          {n.problems?.length > 0 && (
            <div>
              <h4 className="font-bold text-xs mb-1.5" style={{ color: RED }}>أهم المشاكل (مرتبة بالخطورة)</h4>
              <ol className="space-y-2.5">{[...n.problems].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity)).map((p, i) => (
                <li key={i} className="rounded-lg bg-surface border border-surface-3 p-3 break-inside-avoid">
                  <p className="text-xs font-bold text-fg"><span style={{ color: PRIORITY_COLOR[p.severity] }}>●</span> {p.title}{p.topics?.length > 0 && <span className="font-normal text-[10px] text-fg-subtle"> · {p.topics.map(k => TOPIC_LABEL[k]).filter(Boolean).join('، ')}</span>}</p>
                  {p.evidence && <p className="text-[11px] text-fg-muted leading-6 mt-1">الدليل: {p.evidence}</p>}
                  {p.impact && <p className="text-[11px] text-fg-muted leading-6">الأثر: {p.impact}</p>}
                </li>
              ))}</ol>
            </div>
          )}
        </Card>
      )}

      {/* ٤) حالات تحتاج تدخل */}
      {hasAnalysis && fb.cases.length > 0 && (
        <Card title="٤ — حالات تحتاج متابعة من الإدارة" hint={`${fb.cases.length} عميل عندهم شكوى أو مشكلة، الأخطر والمتروك من غير حل في الأول.`}>
          {n?.risk_summary && <p className="text-xs text-fg leading-6 mb-3">{n.risk_summary}</p>}
          <table className="w-full text-[11px]">
            <thead><tr><th className={th}>العميل</th><th className={th}>الدولة</th><th className={th}>المشكلة</th><th className={th}>الحالة</th><th className={th}>معالجة الموظفة</th></tr></thead>
            <tbody>{fb.cases.slice(0, print ? 60 : 30).map(c => (
              <tr key={c.conv_id}>
                <td className={`${td} font-medium whitespace-nowrap`}>{c.urgent && <AlertTriangle size={11} className="inline me-1" style={{ color: RED }} />}{c.name}</td>
                <td className={td}>{c.country || '—'}</td>
                <td className={td}>{c.issue || '—'}</td>
                <td className={td} style={{ color: c.resolution === 'unresolved' ? RED : undefined }}>{RESOLUTION_AR[c.resolution] || '—'}</td>
                <td className={td}>{STAFF_AR[c.staff_response] || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {fb.cases.length > (print ? 60 : 30) && <p className="text-[10px] text-fg-subtle mt-1">ظاهر أول {print ? 60 : 30} حالة من {fb.cases.length}.</p>}
          {n?.staff_handling && <p className="text-xs text-fg leading-6 mt-3 pt-3 border-t border-surface-3"><b>معالجة الشكاوى:</b> {n.staff_handling}</p>}
        </Card>
      )}

      {/* ٥) التوصيات */}
      {n?.recommendations?.length > 0 && (
        <Card title="٥ — التوصيات وخطة العمل" hint="مرتبة بالأولوية، ولكل توصية مسؤول وإطار زمني ومؤشر قياس.">
          <ol className="space-y-3">{[...n.recommendations].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority)).map((r, i) => (
            <li key={i} className="flex gap-2.5 break-inside-avoid">
              <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 text-white" style={{ background: PRIORITY_COLOR[r.priority] || GRAY, ...PRINT_COLORS }}>{i + 1}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-fg">{r.title} <span className="font-normal text-[10px] text-fg-subtle">· أولوية {PRIORITY_AR[r.priority] || ''}{r.owner ? ` · المسؤول: ${r.owner}` : ''}{r.timeframe ? ` · ${TIMEFRAME_AR[r.timeframe]}` : ''}</span></p>
                <p className="text-[11px] text-fg-muted leading-6">{r.detail}</p>
                {r.metric && <p className="text-[11px] leading-6" style={{ color: BLUE }}>القياس: {r.metric}</p>}
              </div>
            </li>
          ))}</ol>
        </Card>
      )}

      {/* حدود الأرقام */}
      <Card title="كيف حُسبت الأرقام وحدودها">
        <ul className="list-disc ps-5 space-y-1 text-[11px] text-fg-muted leading-6">
          <li>الحجوزات = عملاء غيّر الكول سنتر مرحلتهم إلى «تم الحجز» داخل الشهر (بتوقيت القاهرة)، وهو نفس تعريف التقرير المجمّع. كل عميل يُحسب مرة. التطابق مع محادثات رقم الجودة برقم الهاتف.</li>
          <li>«اتبعتلهم» = أُرسلت لهم رسالة من رقم الجودة بعد الحجز (أو قبله بيوم). «ردّوا» = كتبوا أي رسالة بعد أول رسالة منا.</li>
          <li>عملاء الحجز من فيسبوك أو إنستجرام أو تيليجرام من غير رقم واتساب لا يمكن مطابقتهم، ويُعدّون «بدون رقم».</li>
          <li>تقييم المحاور تحليل آلي بالذكاء الاصطناعي لنص محادثة كل عميل، يعتمد على كلام العميل نفسه فقط، وقد يخطئ في حالات قليلة. الرسائل الصوتية والصور لا تُحلَّل.</li>
          <li>الآراء هنا آراء العملاء اللي ردّوا فقط؛ اللي لم نتواصل معهم أو لم يردّوا رأيهم غير معروف، فلا تُعمَّم النسب على كل العملاء.</li>
          {data.month === FIRST_MONTH_NOTE && <li>الرقم بدأ العمل في 29 سبتمبر 2026، فلا توجد مقارنة بشهر سابق كامل.</li>}
          {data.month === currentMonth() && <li>الشهر الحالي لم ينتهِ: عملاء حُجزوا في أواخره لم يحن موعد التواصل معهم بعد.</li>}
          {n?.caveats?.map((c, i) => <li key={`c${i}`}>{c}</li>)}
          {n?.meta && <li>تكلفة التحليل: ${n.meta.cost_usd} من سقف ${n.meta.cap_usd}{n.meta.left_unclassified_by_cap ? ` · ${n.meta.left_unclassified_by_cap} محادثة لم تُحلَّل بسبب السقف` : ''}.</li>}
        </ul>
      </Card>
    </div>
  )
}
const FIRST_MONTH_NOTE = '2026-10'

export default function QualityReport() {
  const toast = useToast()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const [month, setMonth] = useState(currentMonth())
  const [renewals, setRenewals] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [job, setJob] = useState(null)   // { step, progress }
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [cap, setCap] = useState(() => { try { return Number(localStorage.getItem('quality.aiCap')) || 0.5 } catch { return 0.5 } })   // سقف تكلفة التحليل بالدولار
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true); setError(null)
    try {
      const res = await apiFetch(`${API_URL}/reports/quality?month=${month}${renewals ? '&include_renewals=1' : ''}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'تعذّر تحميل التقرير')
      if (id === reqId.current) setData(d)
    } catch (err) { if (id === reqId.current) { setError(err.message); setData(null) } }
    finally { if (id === reqId.current) setLoading(false) }
  }, [month, renewals])
  useEffect(() => { if (/^\d{4}-\d{2}$/.test(month)) load() }, [load, month])

  const runAnalysis = async () => {
    setJob({ step: 'تجهيز', progress: 0 })
    try {
      const res = await apiFetch(`${API_URL}/reports/quality/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, include_renewals: renewals, max_cost_usd: cap }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'تعذّر بدء التحليل')
      for (let i = 0; i < 240; i++) {   // لحد ~١٠ دقايق
        await new Promise(r => setTimeout(r, 2500))
        const s = await (await apiFetch(`${API_URL}/reports/quality/analyze/${d.job_id}`)).json()
        if (s.status === 'error') throw new Error(s.error || 'التحليل فشل')
        if (s.status === 'done') {
          setJob(null)
          toast.success(`التحليل جاهز (التكلفة $${s.result?.cost_usd ?? '—'})${s.result?.left_by_cap ? ` — ${s.result.left_by_cap} محادثة اتأجلت بسبب السقف` : ''}`)
          await load(); return
        }
        setJob({ step: s.step, progress: s.progress })
      }
      throw new Error('التحليل أخد وقت أطول من المتوقع، افتح التقرير بعد شوية')
    } catch (err) { toast.error(err.message); setJob(null) }
  }

  const exportList = async (which) => {
    setExporting(true)
    try {
      const res = await apiFetch(`${API_URL}/reports/quality/export?month=${month}&which=${which}${renewals ? '&include_renewals=1' : ''}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'تعذّر تنزيل الملف')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `quality-${month}-${which === 'not_replied' ? 'not-replied' : 'not-contacted'}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) { toast.error(err.message) }
    finally { setExporting(false) }
  }

  const printPdf = () => {
    if (data && !data.feedback.analyzed && !window.confirm('لسه ماتعملش تحليل للمحاور، فملف الـPDF هيطلع بإحصائيات المتابعة بس. تكمّل؟')) return
    setPrinting(true)
  }
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = setTimeout(() => window.print(), 600)
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done) }
  }, [printing])

  const ai = data?.ai
  const budget = ai?.budget
  const capOptions = ai ? [0.25, 0.5, 1, 1.5].filter(v => v >= ai.min_cap && v <= ai.max_cap) : [0.5]
  const overBudget = budget?.budget && budget.used_tokens >= budget.budget

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto pb-24" dir="rtl">
      <style>{`
        .print-root { display: none; }
        @media print {
          #root { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; }
          .print-root { position: static !important; overflow: visible !important; height: auto !important; }
          .print-root { display: block !important; padding: 16px; --color-surface: 255 255 255; --color-surface-2: 248 248 250; --color-surface-3: 228 228 231; --color-fg: 24 24 27; --color-fg-muted: 82 82 91; --color-fg-subtle: 120 120 130; --color-brand: 124 92 252; --color-success: 13 148 120; --color-danger: 220 38 38; background: #fff; color: rgb(24 24 27); }
          body { background: #fff !important; }
          .break-inside-avoid { break-inside: avoid; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-fg flex-1 min-w-[160px]">تقرير الجودة</h2>
        <input type="month" value={month} max={currentMonth()} onChange={e => e.target.value && setMonth(e.target.value)} className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1 text-xs text-fg" />
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />تحديث</button>
        <button onClick={printPdf} disabled={!data || printing} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand text-white disabled:opacity-40"><Printer size={13} />تصدير PDF</button>
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" checked={renewals} onChange={e => setRenewals(e.target.checked)} />اشمل التجديدات (الافتراضي: حجوزات «تم الحجز» فقط)</label>

      {loading && !data && <div className="py-16 flex flex-col items-center gap-3 text-fg-subtle"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /><p className="text-xs">بجمع الأرقام…</p></div>}
      {error && <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger">{error}</div>}

      {data && (<>
        <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-brand" />تحليل المحادثات بالذكاء الاصطناعي</span>}
          hint={`بيقرا محادثات العملاء اللي ردّوا ويقيّم تجربتهم على ٨ محاور ويكتب التحليل والتوصيات. المحادثة اللي اتحللت قبل كده مابتتحللش تاني (مابتتصرفش عليها فلوس تاني). ${data.analysis_pending ? `${data.analysis_pending} محادثة محتاجة تحليل، التكلفة المتوقعة ≈ $${ai.estimate_usd}.` : ''}`}
          right={!job && isAdmin && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <label className="flex items-center gap-1 text-[11px] text-fg-muted">السقف <select value={cap} onChange={e => { const v = Number(e.target.value); setCap(v); try { localStorage.setItem('quality.aiCap', String(v)) } catch { /* مش مهم */ } }} className="bg-surface border border-surface-3 rounded-lg px-1.5 py-1 text-fg">{capOptions.map(v => <option key={v} value={v}>${v}</option>)}</select></label>
            <button onClick={runAnalysis} disabled={overBudget} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand text-white disabled:opacity-40"><Sparkles size={13} />{data.narrative ? (data.analysis_pending ? 'حدّث التحليل' : 'أعد كتابة التحليل') : 'ابدأ التحليل'}</button>
          </div>}>
          {job ? (
            <div className="flex items-center gap-3 text-xs text-fg-muted"><div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />{job.step}{job.progress ? ` ${job.progress}%` : ''}</div>
          ) : data.narrative ? (
            <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 size={13} />التحليل جاهز{data.narrative.generated_at ? ` (آخر تحديث ${new Date(data.narrative.generated_at).toLocaleDateString('ar-EG-u-nu-latn')})` : ''}{data.analysis_pending ? ` · وفيه ${data.analysis_pending} محادثة جديدة لسه ماتحللتش` : ''}.</p>
          ) : <p className="text-xs text-fg-subtle">لسه ماتعملش تحليل لهذا الشهر.</p>}
          <p className="text-[11px] text-fg-subtle mt-2 flex items-center gap-1.5"><ShieldCheck size={12} />
            {overBudget ? 'وصلت لسقف الاستهلاك الشهري المحدد في إعدادات AI Agent — التحليل متوقف.' : `السقف بيمنع أي تحليل من تخطّي $${cap}: التحليل بيقف قبله ويأجّل باقي المحادثات للتشغيل الجاي. `}
            {budget && (budget.budget ? `استهلاك الشهر ده: ${fmt(budget.used_tokens)} من ${fmt(budget.budget)} توكن.` : `استهلاك الذكاء الاصطناعي الشهر ده (كل الخدمات): ≈ $${budget.used_usd}.`)}
          </p>
        </Card>
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}><ReportBody data={data} onExport={exportList} exporting={exporting} /></div>
      </>)}

      {printing && data && createPortal(<div className="print-root" dir="rtl"><ReportBody data={data} print /></div>, document.body)}
    </div>
  )
}
