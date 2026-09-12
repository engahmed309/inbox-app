import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, Layers } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

// كل حقل مع نوعه (بيحدد شكل مدخل القيمة) — لازم يتطابق مع SEGMENT_FIELDS في الباك إند. الحقول
// كلها (غير التاريخ) بقت multi-select دايمًا بعمليتين بس: "أي من" (in) و"ولا واحد منهم" (not_in) —
// بالظبط زي respond.io، بدل ما يبقى فيه وضع منفصل لاختيار قيمة واحدة بس
const MULTI_FIELDS = new Set(['lifecycle_stage_id', 'tag_id', 'channel_id', 'platform', 'conversation_status', 'country'])
const DATE_FIELDS = new Set(['lifecycle_stage_entered_at', 'contact_created_at'])
const MULTI_OPS = ['in', 'not_in']
const DATE_OPS = ['between', 'gte', 'lte']

function emptyCondition() {
  return { field: 'lifecycle_stage_id', op: 'in', value: [] }
}
function emptyGroup() {
  return { operator: 'AND', conditions: [emptyCondition()] }
}

function isValidCondition(c) {
  if (DATE_FIELDS.has(c.field)) {
    return c.op === 'between' ? Array.isArray(c.value) && c.value[0] && c.value[1] : !!c.value
  }
  return Array.isArray(c.value) && c.value.length > 0
}

// موديال بناء/تعديل شريحة (segment) — لوحة جانبية (مش نافذة في النص) بتدعم أكتر من مجموعة شروط
// (AND/OR بين المجموعات، وAND/OR داخل كل مجموعة لوحدها). دي مجرد أداة تعريف/إدارة شرائح — مش
// بتعرض قائمة محادثات خلفها، بس عدد حي أثناء البناء عشان الأدمن يعرف حجم الشريحة قبل الحفظ
export default function SegmentBuilder({ segment, lifecycles, tagsList, allChannels, countryOptions, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(segment?.name || '')
  const [groups, setGroups] = useState(
    segment?.filter_definition?.groups?.length ? segment.filter_definition.groups : [emptyGroup()]
  )
  const [topOperator, setTopOperator] = useState(segment?.filter_definition?.operator || 'AND')
  const [previewCount, setPreviewCount] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)
  const requestSeqRef = useRef(0)

  const buildFilterDefinition = useCallback(() => ({
    operator: topOperator,
    groups: groups.map(g => ({ operator: g.operator, conditions: g.conditions.filter(isValidCondition) }))
      .filter(g => g.conditions.length)
  }), [groups, topOperator])

  // عدّ حي بس (من غير أي قائمة محادثات) — كل تغيير في الشروط بيحدّث العدد بعد فترة قصيرة من التوقف
  // عن الكتابة. requestSeqRef بيحل مشكلة الـ race condition لو المستخدم غيّر شرط تاني قبل ما رد
  // الطلب القديم يوصل: بنتجاهل أي رد قديم يوصل متأخر بدل ما يكتب فوق العدد الصحيح الحالي
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const filterDefinition = buildFilterDefinition()
    const seq = ++requestSeqRef.current
    if (!filterDefinition.groups.length) { setPreviewCount(null); return }
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await apiFetch(`${API_URL}/segments/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter_definition: filterDefinition })
        })
        const data = await res.json()
        if (seq !== requestSeqRef.current) return
        setPreviewCount(res.ok ? data.count : null)
      } catch { if (seq === requestSeqRef.current) setPreviewCount(null) }
      if (seq === requestSeqRef.current) setPreviewLoading(false)
    }, 450)
    return () => clearTimeout(debounceRef.current)
  }, [groups, buildFilterDefinition])

  const updateCondition = (gIdx, cIdx, patch) => {
    setGroups(prev => prev.map((g, i) => {
      if (i !== gIdx) return g
      return {
        ...g, conditions: g.conditions.map((c, j) => {
          if (j !== cIdx) return c
          const next = { ...c, ...patch }
          if (patch.field && patch.field !== c.field) {
            next.op = DATE_FIELDS.has(patch.field) ? 'between' : 'in'
            next.value = DATE_FIELDS.has(patch.field) ? ['', ''] : []
          }
          return next
        })
      }
    }))
  }
  const addCondition = (gIdx) => setGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, conditions: [...g.conditions, emptyCondition()] } : g))
  const removeCondition = (gIdx, cIdx) => setGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, conditions: g.conditions.filter((_, j) => j !== cIdx) } : g).filter(g => g.conditions.length))
  const addGroup = () => setGroups(prev => [...prev, emptyGroup()])
  const removeGroup = (gIdx) => setGroups(prev => prev.filter((_, i) => i !== gIdx))
  const setGroupOperator = (gIdx, operator) => setGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, operator } : g))
  const resetFilter = () => { setGroups([emptyGroup()]); setTopOperator('AND') }

  const save = async () => {
    if (!name.trim()) { toast.error(t('conversations.segments.builder.nameRequired')); return }
    const filterDefinition = buildFilterDefinition()
    if (!filterDefinition.groups.length) { toast.error(t('conversations.segments.builder.conditionRequired')); return }
    setSaving(true)
    try {
      const url = segment ? `${API_URL}/segments/${segment.id}` : `${API_URL}/segments`
      const res = await apiFetch(url, {
        method: segment ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filter_definition: filterDefinition })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('conversations.segments.builder.saveError'))
      toast.success(t('conversations.segments.builder.saved'))
      onSaved?.(data.segment)
    } catch (err) {
      toast.error(err.message || t('conversations.segments.builder.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const optionsFor = (field) => {
    if (field === 'lifecycle_stage_id') return lifecycles.map(l => ({ value: l.id, label: l.name }))
    if (field === 'tag_id') return tagsList.map(tg => ({ value: tg.id, label: tg.name }))
    if (field === 'channel_id') return allChannels.map(c => ({ value: c.id, label: c.custom_name || c.display_name || c.external_id }))
    if (field === 'country') return countryOptions.map(c => ({ value: c.country, label: `${c.country} (${c.count})` }))
    if (field === 'platform') return ['whatsapp', 'whatsapp_qr', 'facebook', 'instagram', 'tiktok'].map(p => ({ value: p, label: t(`conversations.segments.values.${p}`, p) }))
    if (field === 'conversation_status') return ['open', 'follow_up', 'closed'].map(s => ({ value: s, label: t(`conversations.segments.values.${s}`, s) }))
    return []
  }

  const renderValueInput = (cond, gIdx, cIdx) => {
    if (MULTI_FIELDS.has(cond.field)) {
      const options = optionsFor(cond.field)
      const selected = Array.isArray(cond.value) ? cond.value : []
      return (
        <select multiple value={selected}
          onChange={e => updateCondition(gIdx, cIdx, { value: Array.from(e.target.selectedOptions, o => o.value) })}
          className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0 h-[74px]">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    if (cond.op === 'between') {
      const [from, to] = Array.isArray(cond.value) ? cond.value : ['', '']
      return (
        <div className="flex gap-1.5 flex-1 min-w-0">
          <input type="date" value={from || ''} onChange={e => updateCondition(gIdx, cIdx, { value: [e.target.value, to || ''] })}
            className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
          <input type="date" value={to || ''} onChange={e => updateCondition(gIdx, cIdx, { value: [from || '', e.target.value] })}
            className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
        </div>
      )
    }
    return <input type="date" value={cond.value || ''} onChange={e => updateCondition(gIdx, cIdx, { value: e.target.value })}
      className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
  }

  return (
    <div className="bg-surface-2 rounded-2xl border border-surface-3 max-w-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <h3 className="font-semibold text-fg">{segment ? t('conversations.segments.builder.editTitle') : t('conversations.segments.builder.title')}</h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('conversations.segments.builder.namePlaceholder')}
            className="w-full bg-surface-3 rounded-xl py-2.5 px-4 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />

          {groups.map((group, gIdx) => (
            <div key={gIdx}>
              {gIdx > 0 && (
                <div className="flex items-center gap-1.5 text-xs py-1.5">
                  <span className="text-fg-subtle">{t('conversations.segments.builder.combineGroupsLabel')}</span>
                  <button onClick={() => setTopOperator('AND')} className={`px-2.5 py-1 rounded-lg font-medium ${topOperator === 'AND' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {t('conversations.segments.builder.matchAllGroups')}
                  </button>
                  <button onClick={() => setTopOperator('OR')} className={`px-2.5 py-1 rounded-lg font-medium ${topOperator === 'OR' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {t('conversations.segments.builder.matchAnyGroups')}
                  </button>
                </div>
              )}
            <div className="rounded-xl border border-surface-3 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <Layers size={12} className="text-fg-subtle" />
                  <span className="text-fg-muted">{t('conversations.segments.builder.matchLabel')}</span>
                  <button onClick={() => setGroupOperator(gIdx, 'AND')} className={`px-2.5 py-1 rounded-lg font-medium ${group.operator === 'AND' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {t('conversations.segments.builder.matchAll')}
                  </button>
                  <button onClick={() => setGroupOperator(gIdx, 'OR')} className={`px-2.5 py-1 rounded-lg font-medium ${group.operator === 'OR' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {t('conversations.segments.builder.matchAny')}
                  </button>
                </div>
                {groups.length > 1 && (
                  <button onClick={() => removeGroup(gIdx)} className="text-fg-subtle hover:text-danger p-1"><Trash2 size={13} /></button>
                )}
              </div>

              {group.conditions.map((cond, cIdx) => (
                <div key={cIdx} className="flex items-start gap-1.5">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex gap-1.5">
                      <select value={cond.field} onChange={e => updateCondition(gIdx, cIdx, { field: e.target.value })}
                        className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0">
                        {[...MULTI_FIELDS, ...DATE_FIELDS].map(f => <option key={f} value={f}>{t(`conversations.segments.fields.${f}`)}</option>)}
                      </select>
                      <select value={cond.op} onChange={e => updateCondition(gIdx, cIdx, { op: e.target.value })}
                        className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg w-32 flex-shrink-0">
                        {(DATE_FIELDS.has(cond.field) ? DATE_OPS : MULTI_OPS).map(op => <option key={op} value={op}>{t(`conversations.segments.ops.${op}`)}</option>)}
                      </select>
                    </div>
                    {renderValueInput(cond, gIdx, cIdx)}
                  </div>
                  <button onClick={() => removeCondition(gIdx, cIdx)} className="text-fg-subtle hover:text-danger flex-shrink-0 p-1 mt-1.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button onClick={() => addCondition(gIdx)} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <Plus size={13} /> {t('conversations.segments.builder.addCondition')}
              </button>
            </div>
            </div>
          ))}

          <button onClick={addGroup} className="flex items-center gap-1 text-sm text-brand hover:underline">
            <Plus size={14} /> {t('conversations.segments.builder.addGroup')}
          </button>

          <div className="bg-surface-3 rounded-xl p-3 text-sm text-fg-muted">
            {previewLoading ? t('conversations.segments.builder.counting')
              : previewCount === null ? t('conversations.segments.builder.noConditionsYet')
              : t('conversations.segments.builder.previewCount', { count: previewCount })}
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-3">
          <button onClick={resetFilter} className="px-4 py-2.5 rounded-xl bg-surface-3 text-fg text-sm font-medium">
            {t('conversations.segments.builder.resetFilter')}
          </button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-medium disabled:opacity-50">
            {saving ? t('conversations.segments.builder.saving') : segment ? t('conversations.segments.builder.save') : t('conversations.segments.builder.saveAsNew')}
          </button>
        </div>
    </div>
  )
}
