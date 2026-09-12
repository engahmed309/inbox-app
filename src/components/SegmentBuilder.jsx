import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2, Search } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

// كل حقل مع نوعه (بيحدد شكل مدخل القيمة) — لازم يتطابق مع SEGMENT_FIELDS في الباك إند. الحقول
// كلها (غير التاريخ) multi-select دايمًا بعمليتين بس: "أي من" (in) و"ولا واحد منهم" (not_in)
const MULTI_FIELDS = new Set(['lifecycle_stage_id', 'tag_id', 'channel_id', 'platform', 'conversation_status', 'country'])
const DATE_FIELDS = new Set(['lifecycle_stage_entered_at', 'contact_created_at'])
const MULTI_OPS = ['in', 'not_in']
const DATE_OPS = ['between', 'gte', 'lte']
// لو عدد الخيارات أكتر من كده بنضيف مربع بحث فوق قايمة الاختيار (الدول مثلاً ممكن توصل لمية دولة)
const SEARCH_THRESHOLD = 8

function emptyCondition(connector) {
  return { field: 'lifecycle_stage_id', op: 'in', value: [], connector }
}
function isValidCondition(c) {
  if (DATE_FIELDS.has(c.field)) {
    return c.op === 'between' ? Array.isArray(c.value) && c.value[0] && c.value[1] : !!c.value
  }
  return Array.isArray(c.value) && c.value.length > 0
}

// شرط + مجموعة شروط (AND/OR بين المجموعات، وAND/OR داخل كل مجموعة) هو الشكل اللي الباك إند بيفهمه،
// بس مش شكل سهل يتعرض للمستخدم كواجهة (مجموعات متداخلة). بدل كده بنعرض قايمة شروط مسطّحة، وكل شرط
// (غير الأول) ليه رابط (و / أو) بيوصله بالشرط اللي قبله — بالظبط زي ما بيتقال بالعربي "شرط كذا وكذا
// أو شرط كذا". أي سلسلة من "و" متتالية بتتلم في مجموعة واحدة تتقارن كـ AND، وكل "أو" بيبدأ مجموعة
// جديدة تتقارن بالمجموعات اللي قبلها بـ OR — وده بالظبط أولوية AND/OR الرياضية العادية (AND بيتنفذ
// الأول)، فمينفعش حد يتلخبط فيه
function conditionsToFilterDefinition(conditions) {
  const valid = conditions.filter(isValidCondition)
  if (!valid.length) return { operator: 'AND', groups: [] }
  const groups = [{ operator: 'AND', conditions: [valid[0]] }]
  for (let i = 1; i < valid.length; i++) {
    const { connector, ...cond } = valid[i]
    if (connector === 'OR') groups.push({ operator: 'AND', conditions: [cond] })
    else groups[groups.length - 1].conditions.push(cond)
  }
  return {
    operator: groups.length > 1 ? 'OR' : 'AND',
    groups: groups.map(g => ({ operator: 'AND', conditions: g.conditions.map(({ connector, ...c }) => c) }))
  }
}

// عكس التحويل فوق — لفتح شريحة محفوظة قبل كده للتعديل. أول شرط في كل مجموعة رابطه = عامل الدمج بين
// المجموعات، والباقي في نفس المجموعة رابطهم = عامل المجموعة نفسها
function filterDefinitionToConditions(filterDefinition) {
  const groups = filterDefinition?.groups || []
  if (!groups.length) return [emptyCondition()]
  const flat = []
  groups.forEach((g, gi) => {
    (g.conditions || []).forEach((c, ci) => {
      const connector = flat.length === 0 ? undefined : (ci === 0 ? (filterDefinition.operator === 'OR' ? 'OR' : 'AND') : (g.operator === 'OR' ? 'OR' : 'AND'))
      flat.push({ ...c, connector })
    })
  })
  return flat.length ? flat : [emptyCondition()]
}

// أداة بناء/تعديل شريحة (segment) — قسم عادي داخل صفحة الإعدادات (مش ديالوج عائم)، بياخد عرض
// الصفحة كامل زي أي تاب تاني. بيعرض عدد حي أثناء البناء بس، من غير أي قائمة محادثات خلفه
export default function SegmentBuilder({ segment, lifecycles, tagsList, allChannels, countryOptions, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(segment?.name || '')
  const [conditions, setConditions] = useState(filterDefinitionToConditions(segment?.filter_definition))
  const [valueSearch, setValueSearch] = useState({}) // { [conditionIndex]: 'نص البحث' } — مش بيتحفظ، للعرض بس
  const [previewCount, setPreviewCount] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)
  const requestSeqRef = useRef(0)

  const buildFilterDefinition = useCallback(() => conditionsToFilterDefinition(conditions), [conditions])

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
  }, [conditions, buildFilterDefinition])

  const updateCondition = (idx, patch) => {
    setConditions(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const next = { ...c, ...patch }
      if (patch.field && patch.field !== c.field) {
        next.op = DATE_FIELDS.has(patch.field) ? 'between' : 'in'
        next.value = DATE_FIELDS.has(patch.field) ? ['', ''] : []
      }
      return next
    }))
  }
  const addCondition = () => setConditions(prev => [...prev, emptyCondition('AND')])
  const removeCondition = (idx) => setConditions(prev => {
    const next = prev.filter((_, i) => i !== idx)
    // أول شرط في القايمة مالوش رابط أبدًا (مفيش حاجة قبله يتوصل بيها)
    if (next.length) next[0] = { ...next[0], connector: undefined }
    return next.length ? next : [emptyCondition()]
  })
  const resetFilter = () => setConditions([emptyCondition()])

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

  const renderValueInput = (cond, idx) => {
    if (MULTI_FIELDS.has(cond.field)) {
      const options = optionsFor(cond.field)
      const selected = Array.isArray(cond.value) ? cond.value : []
      const search = valueSearch[idx] || ''
      const visible = search.trim()
        ? options.filter(o => o.label.toLowerCase().includes(search.trim().toLowerCase()))
        : options
      const toggleValue = (v) => updateCondition(idx, { value: selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v] })
      return (
        <div>
          {options.length > SEARCH_THRESHOLD && (
            <div className="relative mb-1.5">
              <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input value={search} onChange={e => setValueSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                placeholder={t('conversations.segments.builder.searchValues')}
                className="w-full bg-surface-3 rounded-lg ps-8 pe-2 py-1.5 text-sm text-fg placeholder-fg-subtle" />
            </div>
          )}
          <div className="bg-surface-3 rounded-lg p-1.5 max-h-48 overflow-y-auto space-y-0.5">
            {visible.length === 0 && <p className="text-xs text-fg-subtle text-center py-2">{t('conversations.segments.builder.noOptionsMatch')}</p>}
            {visible.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-surface-2 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggleValue(o.value)} className="accent-brand w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-fg truncate">{o.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <p className="text-[11px] text-fg-subtle mt-1">{t('conversations.segments.builder.selectedCount', { count: selected.length })}</p>
          )}
        </div>
      )
    }
    if (cond.op === 'between') {
      const [from, to] = Array.isArray(cond.value) ? cond.value : ['', '']
      return (
        <div className="flex gap-1.5">
          <input type="date" value={from || ''} onChange={e => updateCondition(idx, { value: [e.target.value, to || ''] })}
            className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
          <input type="date" value={to || ''} onChange={e => updateCondition(idx, { value: [from || '', e.target.value] })}
            className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
        </div>
      )
    }
    return <input type="date" value={cond.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })}
      className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg w-full" />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{segment ? t('conversations.segments.builder.editTitle') : t('conversations.segments.builder.title')}</h2>
        <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={18} /></button>
      </div>

      <input value={name} onChange={e => setName(e.target.value)} placeholder={t('conversations.segments.builder.namePlaceholder')}
        className="w-full bg-surface-2 border border-surface-3 rounded-xl py-2.5 px-4 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />

      <div className="space-y-2">
        {conditions.map((cond, idx) => (
          <div key={idx}>
            {idx > 0 && (
              <div className="flex items-center gap-1.5 py-1.5">
                <div className="h-px bg-surface-3 flex-1" />
                <button onClick={() => updateCondition(idx, { connector: 'AND' })}
                  className={`px-3 py-1 rounded-lg text-xs font-medium ${cond.connector !== 'OR' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                  {t('conversations.segments.builder.connectorAnd')}
                </button>
                <button onClick={() => updateCondition(idx, { connector: 'OR' })}
                  className={`px-3 py-1 rounded-lg text-xs font-medium ${cond.connector === 'OR' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                  {t('conversations.segments.builder.connectorOr')}
                </button>
                <div className="h-px bg-surface-3 flex-1" />
              </div>
            )}
            <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex gap-1.5">
                    <select value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value })}
                      className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0">
                      {[...MULTI_FIELDS, ...DATE_FIELDS].map(f => <option key={f} value={f}>{t(`conversations.segments.fields.${f}`)}</option>)}
                    </select>
                    <select value={cond.op} onChange={e => updateCondition(idx, { op: e.target.value })}
                      className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg w-32 flex-shrink-0">
                      {(DATE_FIELDS.has(cond.field) ? DATE_OPS : MULTI_OPS).map(op => <option key={op} value={op}>{t(`conversations.segments.ops.${op}`)}</option>)}
                    </select>
                  </div>
                  {renderValueInput(cond, idx)}
                </div>
                {conditions.length > 1 && (
                  <button onClick={() => removeCondition(idx)} className="text-fg-subtle hover:text-danger flex-shrink-0 p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addCondition} className="flex items-center gap-1 text-sm text-brand hover:underline">
        <Plus size={14} /> {t('conversations.segments.builder.addCondition')}
      </button>

      <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 text-sm text-fg-muted">
        {previewLoading ? t('conversations.segments.builder.counting')
          : previewCount === null ? t('conversations.segments.builder.noConditionsYet')
          : t('conversations.segments.builder.previewCount', { count: previewCount })}
      </div>

      <div className="flex gap-2 pt-1">
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
