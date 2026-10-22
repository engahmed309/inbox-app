import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trophy, Printer, Target, Zap, Award, MessageCircle, Settings2 } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { rangeFor, fmt, dur, Card } from './ConsolidatedReport'

// لوحة الحوافز الشهرية: ترتيب الفريق ومين الموظف المثالي وجوائز الفئات (من التقرير المجمّع للشهر) + تقدّم كل موظف ناحية هدف الحجوزات.
// الأهداف والحوافز المقترحة بتتحفظ على المتصفح ده بس (مش في الداتابيز). جوائز الجودة والإقناع بتظهر لو اتعمل تحليل الذكاء الاصطناعي لنفس الشهر.
// «طباعة / PDF» بيطلّع نسخة فاتحة تتشارك مع الفريق.
const CONFIG_KEY = 'incentives.config'
const DEFAULT_CONFIG = { target: 40, prizes: { ideal: '', bookings: '', fastest: '', conversion: '' } }
const readConfig = () => { try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') } } catch { return DEFAULT_CONFIG } }
const MEDALS = ['🥇', '🥈', '🥉']

export function Board({ data, ai, range, config, print }) {
  const awards = ai?.awards || data.awards
  const days = Math.max(1, data.period.days)
  const agents = [...data.agents].sort((a, b) => b.bookings - a.bookings)
  const target = Number(config.target) || 0
  const prize = (k) => config.prizes?.[k] ? <span className="text-[11px] text-brand font-semibold">🎁 {config.prizes[k]}</span> : null
  return (
    <div className="space-y-4" dir="rtl">
      {print && <div><h1 className="text-xl font-bold text-fg">لوحة الحوافز — {range.label}</h1><p className="text-xs text-fg-muted mt-1">د. محمد سعيد · فريق خدمة العملاء</p></div>}

      {awards.ideal ? (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-5 text-center break-inside-avoid">
          <Trophy size={30} className="text-brand mx-auto" />
          <p className="text-[12px] text-fg-muted mt-2">الموظف المثالي</p>
          <p className="text-2xl font-bold text-fg mt-0.5">{awards.ideal.name}</p>
          <p className="text-4xl font-bold text-brand tabular-nums mt-1">{awards.ideal.score}<span className="text-base text-fg-subtle">/100</span></p>
          <div className="mt-1">{prize('ideal')}</div>
        </div>
      ) : <p className="text-xs text-fg-subtle">مفيش موظفين عندهم محادثات كفاية للترتيب في الفترة دي.</p>}

      {awards.ranking.length > 0 && (
        <Card title="الترتيب العام" hint={`الدرجة من 100 = ${awards.quality_included ? 'تحويل ٣٥٪ + حجوزات ١٥٪ + سرعة ٢٥٪ + جودة ٢٥٪' : 'تحويل ٤٥٪ + حجوزات ٢٠٪ + سرعة ٣٥٪'}.`}>
          <div className="space-y-2">{awards.ranking.map((r, i) => (
            <div key={r.agent_id} className="flex items-center gap-3">
              <span className="w-7 text-lg text-center">{MEDALS[i] || <span className="text-sm text-fg-subtle">{i + 1}</span>}</span>
              <span className="w-36 text-sm font-semibold text-fg truncate">{r.name}</span>
              <div className="flex-1 h-3 bg-surface-3 rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: `${r.score}%` }} /></div>
              <span className="w-10 text-end text-sm font-bold text-brand tabular-nums">{r.score}</span>
            </div>
          ))}</div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          ['الأكتر حجوزات', awards.most_bookings, (v) => `${v} حجز`, Target, 'bookings'],
          ['الأعلى تحويلًا', awards.best_conversion, (v) => `${v}%`, Award, 'conversion'],
          ['الأسرع ردًا', awards.fastest, dur, Zap, 'fastest'],
          ['الأكتر إقناعًا', awards.most_persuasive, (v) => `${v}/100`, MessageCircle, null],
          ['الأجود محادثة', awards.best_quality, (v) => `${v}/100`, Award, null],
        ].map(([title, a, f, Icon, pk]) => (
          <div key={title} className="rounded-xl border border-surface-3 bg-surface-2 p-3.5 break-inside-avoid">
            <div className="flex items-center gap-1.5 text-fg-subtle text-[12px]"><Icon size={14} />{title}</div>
            {a ? (<><p className="text-base font-bold text-fg mt-1">{a.name}</p><p className="text-[12px] text-brand tabular-nums">{f(a.value)}</p>{pk && <div className="mt-1">{prize(pk)}</div>}</>)
              : <p className="text-[12px] text-fg-subtle mt-1">{title === 'الأكتر إقناعًا' || title === 'الأجود محادثة' ? 'بعد تحليل الذكاء الاصطناعي للشهر' : '—'}</p>}
          </div>
        ))}
      </div>

      {target > 0 && (
        <Card title={`التقدّم ناحية هدف الشهر (${target} حجز لكل موظف)`} hint={`${days} يوم في الفترة — الهدف بيتحسب تناسبيًا لو الفترة أقل من شهر كامل.`}>
          <div className="space-y-2.5">{agents.map(a => {
            const t = Math.max(1, Math.round((target * Math.min(days, 31)) / 30))
            const pctDone = Math.min(100, Math.round((a.bookings / t) * 100))
            return (
              <div key={a.agent_id}>
                <div className="flex items-center justify-between text-[12px]"><span className="font-semibold text-fg">{a.name}</span><span className="text-fg-muted tabular-nums">{a.bookings} / {t} · {pctDone}%{a.bookings >= t ? ' ✅' : ''}</span></div>
                <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden mt-1"><div className={`h-full rounded-full ${a.bookings >= t ? 'bg-success' : 'bg-brand/70'}`} style={{ width: `${pctDone}%` }} /></div>
              </div>
            )
          })}</div>
        </Card>
      )}

      <Card title="أرقام الفريق" hint="للمقارنة بين الموظفين في نفس الفترة.">
        <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[520px]">
          <thead><tr className="text-fg-subtle border-b border-surface-3">{['الموظف', 'حجوزات', 'تحويل', 'وسيط أول رد', 'ساعات اتصال'].map(h => <th key={h} className="py-1.5 px-1.5 font-medium text-start">{h}</th>)}</tr></thead>
          <tbody>{agents.map(a => <tr key={a.agent_id} className="border-b border-surface-3/60 text-fg"><td className="py-1.5 px-1.5 font-semibold">{a.name}</td><td className="px-1.5 tabular-nums">{a.bookings}</td><td className="px-1.5 tabular-nums">{a.conversion_pct != null ? `${a.conversion_pct}%` : '—'}</td><td className="px-1.5 tabular-nums">{dur(a.median_reply_s)}</td><td className="px-1.5 tabular-nums">{a.online_hours} س</td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  )
}

export default function IncentivesBoard() {
  const [month, setMonth] = useState('month')   // month | lastMonth
  const [data, setData] = useState(null)
  const [ai, setAi] = useState(null)
  const [range, setRange] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [config, setConfig] = useState(readConfig)
  const [editing, setEditing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const r = rangeFor(month)
    const id = ++reqId.current
    setLoading(true); setError(null); setAi(null)
    ;(async () => {
      try {
        const q = `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`
        const res = await apiFetch(`${API_URL}/reports/consolidated?${q}`)
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'تعذّر تحميل اللوحة')
        if (id !== reqId.current) return
        setData(d); setRange(r)
        // تحليل الشهر لو اتعمل قبل كده (من غير ما نبدأ تحليل جديد ولا نصرف)
        const cres = await apiFetch(`${API_URL}/reports/consolidated/ai-cached?${q}`)
        const c = await cres.json().catch(() => ({}))
        if (id === reqId.current && c.result) setAi(c.result)
      } catch (err) { if (id === reqId.current) { setError(err.message); setData(null) } }
      finally { if (id === reqId.current) setLoading(false) }
    })()
  }, [month])

  const save = (patch) => {
    const next = { ...config, ...patch, prizes: { ...config.prizes, ...(patch.prizes || {}) } }
    setConfig(next)
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)) } catch { /* مش مهم */ }
  }
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = setTimeout(() => window.print(), 500)
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done) }
  }, [printing])

  const pill = (active) => `px-3 py-1.5 rounded-full text-xs font-medium ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`
  const input = 'bg-surface border border-surface-3 rounded-lg px-2 py-1 text-xs text-fg w-full'

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24" dir="rtl">
      <style>{`
        .print-root { display: none; }
        @media print {
          #root { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; }
          .print-root { position: static !important; overflow: visible !important; height: auto !important; }
          .print-root { display: block !important; padding: 16px; --color-surface: 255 255 255; --color-surface-2: 248 248 250; --color-surface-3: 228 228 231; --color-fg: 24 24 27; --color-fg-muted: 82 82 91; --color-fg-subtle: 120 120 130; --color-brand: 124 92 252; --color-success: 13 148 120; background: #fff; color: rgb(24 24 27); }
          body { background: #fff !important; }
          .break-inside-avoid { break-inside: avoid; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-fg flex-1 min-w-[160px] flex items-center gap-2"><Trophy size={18} className="text-brand" />لوحة الحوافز</h2>
        <button onClick={() => setMonth('month')} className={pill(month === 'month')}>هذا الشهر</button>
        <button onClick={() => setMonth('lastMonth')} className={pill(month === 'lastMonth')}>الشهر الماضي</button>
        <button onClick={() => setEditing(v => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-3 text-fg-muted hover:text-fg"><Settings2 size={13} />الأهداف والحوافز</button>
        <button onClick={() => setPrinting(true)} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand text-white disabled:opacity-40"><Printer size={13} />طباعة / PDF</button>
      </div>
      {range && <p className="text-[11px] text-fg-subtle -mt-2">{range.label} · بتوقيت القاهرة{month === 'month' ? ' · الشهر لسه شغال: الأرقام لحد دلوقتي' : ''}</p>}

      {editing && (
        <Card title="الأهداف والحوافز المقترحة" hint="بتتحفظ على المتصفح ده بس. اكتب الحافز نصًا (مثلًا «مكافأة 500 جنيه»)؛ بيظهر على الجائزة في اللوحة وفي الـPDF.">
          <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
            <label className="text-fg-muted">هدف الحجوزات الشهري لكل موظف<input type="number" min="0" value={config.target} onChange={e => save({ target: e.target.value })} className={`${input} mt-1`} /></label>
            {[['ideal', 'حافز الموظف المثالي'], ['bookings', 'حافز الأكتر حجوزات'], ['conversion', 'حافز الأعلى تحويلًا'], ['fastest', 'حافز الأسرع ردًا']].map(([k, l]) => (
              <label key={k} className="text-fg-muted">{l}<input value={config.prizes?.[k] || ''} onChange={e => save({ prizes: { [k]: e.target.value } })} className={`${input} mt-1`} placeholder="—" /></label>
            ))}
          </div>
        </Card>
      )}

      {loading && !data && <div className="py-16 flex flex-col items-center gap-3 text-fg-subtle"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /><p className="text-xs">بجمع أرقام الشهر… (أول مرة بتاخد من نص دقيقة لدقيقة)</p></div>}
      {error && <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger">{error}</div>}
      {data && <Board data={data} ai={ai} range={range} config={config} />}
      {printing && data && createPortal(<div className="print-root" dir="rtl"><Board data={data} ai={ai} range={range} config={config} print /></div>, document.body)}
    </div>
  )
}
