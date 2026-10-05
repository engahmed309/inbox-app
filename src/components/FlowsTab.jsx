import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { Plus, Trash2, Edit2, ChevronUp, ChevronDown, GitBranch, X, ListChecks } from 'lucide-react'

// مسارات الرد التلقائي: الأدمن بيحدد "لو العميل رد على تمبلت X (أو كتب كلمة Y) يحصل إيه" وبيبني خطوات
// فيها تفرّع حسب رد العميل. المحرّك في السيرفر (flows.js) والتعريف كله بيتخزّن من هنا — مفيش مسار ثابت في الكود.
const inputCls = 'w-full bg-surface-3 rounded-xl py-2 px-3 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand'
const PLATFORMS = ['whatsapp', 'whatsapp_qr', 'facebook', 'instagram', 'telegram', 'tiktok']
const STEP_TYPES = ['message', 'template', 'wait', 'wait_reply', 'lifecycle', 'tag', 'assign', 'note', 'end']

const newStep = (type) => {
  switch (type) {
    case 'message': return { type, text: '', media_url: '' }
    case 'template': return { type, template_name: '', language: 'ar', params: [], channel_id: null }
    case 'wait': return { type, minutes: 60 }
    case 'wait_reply': return { type, timeout_minutes: 1440, branches: [{ label: '', match: { mode: 'contains', values: [] }, steps: [] }], else_steps: [], timeout_steps: [] }
    case 'lifecycle': return { type, stage_id: '' }
    case 'tag': return { type, tag_id: '', action: 'add' }
    case 'assign': return { type, target: 'team', team_id: '', agent_id: '' }
    case 'note': return { type, text: '', notify: false }
    default: return { type: 'end' }
  }
}
const emptyFlow = () => ({
  name: '', is_active: false, stop_on_agent_reply: true,
  trigger: { type: 'template_reply', template_name: '', window_hours: 72, platforms: [], match: { mode: 'any', values: [] } },
  steps: [newStep('message')],
})

// ─── مدخلات صغيرة ──────────────────────────────────────────
function MatchEditor({ match, onChange, allowAny = true }) {
  const { t } = useTranslation()
  const modes = allowAny ? ['any', 'equals', 'contains'] : ['equals', 'contains']
  return (
    <div className="space-y-2">
      <select value={match.mode} onChange={e => onChange({ ...match, mode: e.target.value })} className={inputCls}>
        {modes.map(m => <option key={m} value={m}>{t(`settings.flows.match.${m}`)}</option>)}
      </select>
      {match.mode !== 'any' && (
        <input value={(match.values || []).join('، ')} onChange={e => onChange({ ...match, values: e.target.value.split(/[,،]/).map(v => v.trim()) })}
          placeholder={t('settings.flows.match.valuesPlaceholder')} className={inputCls} />
      )}
    </div>
  )
}

function DurationInput({ minutes, onChange }) {
  const { t } = useTranslation()
  const unit = minutes % 1440 === 0 ? 'd' : minutes % 60 === 0 ? 'h' : 'm'
  const factor = unit === 'd' ? 1440 : unit === 'h' ? 60 : 1
  const set = (v, u) => onChange(Math.max(1, Math.round((Number(v) || 1) * (u === 'd' ? 1440 : u === 'h' ? 60 : 1))))
  return (
    <div className="flex gap-2">
      <input type="number" min="1" value={Math.round(minutes / factor)} onChange={e => set(e.target.value, unit)} className={inputCls} />
      <select value={unit} onChange={e => set(Math.round(minutes / factor), e.target.value)} className={`${inputCls} !w-28`}>
        <option value="m">{t('settings.flows.unit.m')}</option>
        <option value="h">{t('settings.flows.unit.h')}</option>
        <option value="d">{t('settings.flows.unit.d')}</option>
      </select>
    </div>
  )
}

function Pick({ value, onChange, items, placeholder }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder}</option>
      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
  )
}

// ─── محرّر قايمة خطوات (متداخل: خطوة الانتظار للرد فيها فروع، كل فرع قايمة خطوات) ─────
function StepsEditor({ steps, onChange, options, depth = 0 }) {
  const { t } = useTranslation()
  const update = (i, patch) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const remove = (i) => onChange(steps.filter((_, k) => k !== i))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const copy = [...steps];
    [copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }

  return (
    <div className={`space-y-2 ${depth ? 'border-s-2 border-brand/40 ps-3' : ''}`}>
      {steps.map((s, i) => (
        <div key={i} className="bg-surface-2 border border-surface-3 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-subtle w-5">{i + 1}</span>
            <span className="flex-1 text-sm font-medium text-fg">{t(`settings.flows.step.${s.type}`)}</span>
            <button onClick={() => move(i, -1)} className="text-fg-muted hover:text-fg"><ChevronUp size={14} /></button>
            <button onClick={() => move(i, 1)} className="text-fg-muted hover:text-fg"><ChevronDown size={14} /></button>
            <button onClick={() => remove(i)} className="text-fg-muted hover:text-danger"><Trash2 size={14} /></button>
          </div>

          {s.type === 'message' && (
            <>
              <textarea rows={3} value={s.text} onChange={e => update(i, { text: e.target.value })} placeholder={t('settings.flows.messagePlaceholder')} className={inputCls} />
              <input value={s.media_url || ''} onChange={e => update(i, { media_url: e.target.value })} placeholder={t('settings.flows.mediaPlaceholder')} dir="ltr" className={inputCls} />
            </>
          )}
          {s.type === 'template' && (
            <>
              <select value={s.template_name ? `${s.template_name}|${s.language}` : ''}
                onChange={e => { const [n, l] = e.target.value.split('|'); update(i, { template_name: n || '', language: l || 'ar' }) }} className={inputCls}>
                <option value="">{t('settings.flows.pickTemplate')}</option>
                {options.templates.map(tp => <option key={`${tp.name}|${tp.language}`} value={`${tp.name}|${tp.language}`}>{tp.name} ({tp.language})</option>)}
              </select>
              <input value={(s.params || []).join('، ')} onChange={e => update(i, { params: e.target.value.split(/[,،]/).map(v => v.trim()).filter(Boolean) })}
                placeholder={t('settings.flows.paramsPlaceholder')} className={inputCls} />
              <Pick value={s.channel_id} onChange={v => update(i, { channel_id: v || null })} items={options.channels} placeholder={t('settings.flows.sameChannel')} />
            </>
          )}
          {s.type === 'wait' && <DurationInput minutes={s.minutes} onChange={m => update(i, { minutes: m })} />}
          {s.type === 'lifecycle' && <Pick value={s.stage_id} onChange={v => update(i, { stage_id: v })} items={options.stages} placeholder={t('settings.flows.pickStage')} />}
          {s.type === 'tag' && (
            <div className="flex gap-2">
              <select value={s.action} onChange={e => update(i, { action: e.target.value })} className={`${inputCls} !w-28`}>
                <option value="add">{t('settings.flows.tagAdd')}</option>
                <option value="remove">{t('settings.flows.tagRemove')}</option>
              </select>
              <Pick value={s.tag_id} onChange={v => update(i, { tag_id: v })} items={options.tags} placeholder={t('settings.flows.pickTag')} />
            </div>
          )}
          {s.type === 'assign' && (
            <div className="flex gap-2">
              <select value={s.target} onChange={e => update(i, { target: e.target.value })} className={`${inputCls} !w-28`}>
                <option value="team">{t('settings.flows.assignTeam')}</option>
                <option value="agent">{t('settings.flows.assignAgent')}</option>
              </select>
              {s.target === 'agent'
                ? <Pick value={s.agent_id} onChange={v => update(i, { agent_id: v })} items={options.agents} placeholder={t('settings.flows.pickAgent')} />
                : <Pick value={s.team_id} onChange={v => update(i, { team_id: v })} items={options.teams} placeholder={t('settings.flows.pickTeam')} />}
            </div>
          )}
          {s.type === 'note' && (
            <>
              <textarea rows={2} value={s.text} onChange={e => update(i, { text: e.target.value })} placeholder={t('settings.flows.notePlaceholder')} className={inputCls} />
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={!!s.notify} onChange={e => update(i, { notify: e.target.checked })} /> {t('settings.flows.notifyAgent')}
              </label>
            </>
          )}

          {s.type === 'wait_reply' && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-fg-muted mb-1">{t('settings.flows.timeoutAfter')}</p>
                <DurationInput minutes={s.timeout_minutes} onChange={m => update(i, { timeout_minutes: m })} />
              </div>
              {s.branches.map((b, bi) => (
                <div key={bi} className="bg-surface rounded-2xl p-3 space-y-2 border border-surface-3">
                  <div className="flex items-center gap-2">
                    <GitBranch size={13} className="text-brand flex-shrink-0" />
                    <input value={b.label} onChange={e => update(i, { branches: s.branches.map((x, k) => (k === bi ? { ...x, label: e.target.value } : x)) })}
                      placeholder={t('settings.flows.branchName')} className={inputCls} />
                    <button onClick={() => update(i, { branches: s.branches.filter((_, k) => k !== bi) })} className="text-fg-muted hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                  <p className="text-[11px] text-fg-muted">{t('settings.flows.ifReply')}</p>
                  <MatchEditor match={b.match} allowAny={false} onChange={m => update(i, { branches: s.branches.map((x, k) => (k === bi ? { ...x, match: m } : x)) })} />
                  <p className="text-[11px] text-fg-muted">{t('settings.flows.thenDo')}</p>
                  <StepsEditor steps={b.steps} options={options} depth={depth + 1}
                    onChange={st => update(i, { branches: s.branches.map((x, k) => (k === bi ? { ...x, steps: st } : x)) })} />
                </div>
              ))}
              <button onClick={() => update(i, { branches: [...s.branches, { label: '', match: { mode: 'contains', values: [] }, steps: [] }] })}
                className="text-xs text-brand flex items-center gap-1"><Plus size={12} /> {t('settings.flows.addBranch')}</button>

              <div className="bg-surface rounded-2xl p-3 space-y-2 border border-surface-3">
                <p className="text-xs font-medium text-fg">{t('settings.flows.elseTitle')}</p>
                <p className="text-[11px] text-fg-subtle">{t('settings.flows.elseHint')}</p>
                <StepsEditor steps={s.else_steps} options={options} depth={depth + 1} onChange={st => update(i, { else_steps: st })} />
              </div>
              <div className="bg-surface rounded-2xl p-3 space-y-2 border border-surface-3">
                <p className="text-xs font-medium text-fg">{t('settings.flows.timeoutTitle')}</p>
                <p className="text-[11px] text-fg-subtle">{t('settings.flows.timeoutHint')}</p>
                <StepsEditor steps={s.timeout_steps} options={options} depth={depth + 1} onChange={st => update(i, { timeout_steps: st })} />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* إضافة خطوة */}
      <select value="" onChange={e => { if (e.target.value) onChange([...steps, newStep(e.target.value)]) }}
        className="w-full bg-surface-3 text-brand text-xs rounded-xl py-2 px-3 focus:outline-none">
        <option value="">+ {t('settings.flows.addStep')}</option>
        {STEP_TYPES.filter(ty => !(depth >= 3 && ty === 'wait_reply')).map(ty => <option key={ty} value={ty}>{t(`settings.flows.step.${ty}`)}</option>)}
      </select>
    </div>
  )
}

// ─── محرّر مسار كامل ─────────────────────────────────────────
function FlowEditor({ flow, options, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState(flow || emptyFlow())
  const [saving, setSaving] = useState(false)
  const trig = form.trigger
  const setTrig = (patch) => setForm(f => ({ ...f, trigger: { ...f.trigger, ...patch } }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await apiFetch(`${API_URL}/flows${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.flows.saveError'))
      toast.success(t('settings.flows.saved'))
      onSaved()
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{form.id ? t('settings.flows.editFlow') : t('settings.flows.newFlow')}</h2>
        <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={18} /></button>
      </div>

      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('settings.flows.namePlaceholder')} className={inputCls} />

      <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3 space-y-3">
        <p className="text-sm font-semibold text-fg">{t('settings.flows.triggerTitle')}</p>
        <select value={trig.type} onChange={e => setTrig({ type: e.target.value, match: e.target.value === 'keyword' ? { mode: 'contains', values: [] } : { mode: 'any', values: [] } })} className={inputCls}>
          <option value="template_reply">{t('settings.flows.trigger.template_reply')}</option>
          <option value="keyword">{t('settings.flows.trigger.keyword')}</option>
          <option value="first_message">{t('settings.flows.trigger.first_message')}</option>
        </select>

        {trig.type === 'template_reply' && (
          <>
            <select value={trig.template_name || ''} onChange={e => setTrig({ template_name: e.target.value })} className={inputCls}>
              <option value="">{t('settings.flows.anyTemplate')}</option>
              {[...new Set(options.templates.map(tp => tp.name))].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="text-[11px] text-fg-muted">{t('settings.flows.replyCondition')}</p>
            <MatchEditor match={trig.match} onChange={m => setTrig({ match: m })} />
            <div>
              <p className="text-[11px] text-fg-muted mb-1">{t('settings.flows.windowHours')}</p>
              <input type="number" min="1" value={trig.window_hours} onChange={e => setTrig({ window_hours: Number(e.target.value) || 72 })} className={inputCls} />
            </div>
          </>
        )}
        {trig.type === 'keyword' && (
          <>
            <p className="text-[11px] text-fg-muted">{t('settings.flows.keywordHint')}</p>
            <MatchEditor match={trig.match} allowAny={false} onChange={m => setTrig({ match: m })} />
          </>
        )}
        {trig.type !== 'template_reply' && (
          <div>
            <p className="text-[11px] text-fg-muted mb-1">{t('settings.flows.platformsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => {
                const on = (trig.platforms || []).includes(p)
                return (
                  <button key={p} onClick={() => setTrig({ platforms: on ? trig.platforms.filter(x => x !== p) : [...(trig.platforms || []), p] })}
                    className={`px-3 py-1 rounded-full text-xs ${on ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>{p}</button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-fg mb-2">{t('settings.flows.stepsTitle')}</p>
        <StepsEditor steps={form.steps} options={options} onChange={steps => setForm({ ...form, steps })} />
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={form.stop_on_agent_reply} onChange={e => setForm({ ...form, stop_on_agent_reply: e.target.checked })} />
        {t('settings.flows.stopOnAgent')}
      </label>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
        {t('settings.flows.activate')}
      </label>

      <div className="fixed bottom-0 inset-x-0 p-3 bg-surface border-t border-surface-3 flex gap-2 z-20">
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-medium disabled:opacity-50">
          {saving ? '...' : t('settings.flows.save')}
        </button>
        <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-surface-3 text-fg-muted text-sm">{t('settings.flows.cancel')}</button>
      </div>
    </div>
  )
}

// ─── سجل تشغيلات مسار ─────────────────────────────────────────
function RunsPanel({ flow, onClose }) {
  const { t } = useTranslation()
  const [runs, setRuns] = useState(null)
  useEffect(() => {
    apiFetch(`${API_URL}/flows/${flow.id}/runs`).then(r => r.json()).then(d => setRuns(d.runs || [])).catch(() => setRuns([]))
  }, [flow.id])
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <h3 className="font-semibold text-fg text-sm">{flow.name} — {t('settings.flows.runs')}</h3>
          <button onClick={onClose} className="text-fg-muted"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-surface-3">
          {runs === null ? <p className="text-center text-fg-subtle text-sm py-8">...</p>
            : !runs.length ? <p className="text-center text-fg-subtle text-sm py-8">{t('settings.flows.noRuns')}</p>
            : runs.map(r => (
              <a key={r.id} href={`/chat/${r.conversation_id}`} className="block px-4 py-3 hover:bg-surface-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg">{r.contact_name || '—'}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-3 text-fg-muted">{t(`settings.flows.status.${r.status}`, r.status)}</span>
                </div>
                <p className="text-[11px] text-fg-subtle mt-0.5">{new Date(r.started_at).toLocaleString()}</p>
                <p className="text-[11px] text-fg-muted mt-1 truncate">
                  {(r.log || []).map(l => l.ok || l.error || l.branch || (l.timeout && t('settings.flows.timedOut')) || l.step || l.end).filter(Boolean).join(' ← ')}
                </p>
              </a>
            ))}
        </div>
      </div>
    </div>
  )
}

export default function FlowsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [flows, setFlows] = useState(null)
  const [editing, setEditing] = useState(undefined) // undefined = قايمة، null = جديد، object = تعديل
  const [runsFor, setRunsFor] = useState(null)
  const [options, setOptions] = useState({ stages: [], tags: [], teams: [], agents: [], templates: [], channels: [] })

  const load = async () => {
    try {
      const res = await apiFetch(`${API_URL}/flows`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFlows(data.flows || [])
    } catch (err) { setFlows([]); toast.error(err.message) }
  }
  useEffect(() => {
    load()
    apiFetch(`${API_URL}/flows/options`).then(r => r.json()).then(d => { if (d.stages) setOptions(d) }).catch(() => {})
  }, [])

  const toggle = async (f) => {
    const res = await apiFetch(`${API_URL}/flows/${f.id}/active`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !f.is_active }) })
    if (res.ok) setFlows(prev => prev.map(x => (x.id === f.id ? { ...x, is_active: !f.is_active } : x)))
    else toast.error(t('settings.flows.saveError'))
  }
  const remove = async (f) => {
    if (!confirm(t('settings.flows.deleteConfirm', { name: f.name }))) return
    const res = await apiFetch(`${API_URL}/flows/${f.id}`, { method: 'DELETE' })
    if (res.ok) setFlows(prev => prev.filter(x => x.id !== f.id))
    else toast.error(t('settings.flows.saveError'))
  }

  if (editing !== undefined) {
    return <FlowEditor flow={editing} options={options} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load() }} />
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.tabs.flows')}</h2>
        <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.flows.newFlow')}
        </button>
      </div>
      <p className="text-xs text-fg-subtle">{t('settings.flows.intro')}</p>

      {flows === null && <p className="text-center text-fg-subtle text-sm py-6">...</p>}
      {flows?.map(f => (
        <div key={f.id} className="bg-surface-2 rounded-2xl p-4 border border-surface-3 space-y-2">
          <div className="flex items-center gap-3">
            <GitBranch size={16} className="text-fg-subtle flex-shrink-0" />
            <span className="flex-1 text-sm text-fg truncate">{f.name}</span>
            <button onClick={() => toggle(f)} className={`text-[11px] px-2.5 py-1 rounded-full ${f.is_active ? 'bg-success/20 text-success' : 'bg-surface-3 text-fg-muted'}`}>
              {f.is_active ? t('settings.flows.on') : t('settings.flows.off')}
            </button>
            <button onClick={() => setRunsFor(f)} className="text-fg-muted hover:text-brand"><ListChecks size={15} /></button>
            <button onClick={() => setEditing(f)} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
            <button onClick={() => remove(f)} className="text-fg-muted hover:text-danger"><Trash2 size={14} /></button>
          </div>
          <p className="text-[11px] text-fg-subtle">
            {t(`settings.flows.trigger.${f.trigger?.type}`)}{f.trigger?.template_name ? `: ${f.trigger.template_name}` : ''}
            {' · '}{t('settings.flows.statsLine', { total: f.stats.total, running: f.stats.running, done: f.stats.done })}
          </p>
        </div>
      ))}
      {flows && !flows.length && <p className="text-center text-fg-subtle text-sm py-6">{t('settings.flows.empty')}</p>}

      {runsFor && <RunsPanel flow={runsFor} onClose={() => setRunsFor(null)} />}
    </div>
  )
}
