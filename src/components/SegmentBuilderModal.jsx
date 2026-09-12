import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2 } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

// كل حقل مع نوعه (بيحدد العمليات المتاحة وشكل مدخل القيمة) — لازم يتطابق مع SEGMENT_FIELDS في الباك إند
const FIELD_TYPES = {
  lifecycle_stage_id: 'uuid_select',
  lifecycle_stage_entered_at: 'date_range',
  country: 'text',
  tag_id: 'uuid_select',
  channel_id: 'uuid_select',
  platform: 'select',
  conversation_status: 'select',
  contact_created_at: 'date_range',
}

const OPS_BY_TYPE = { uuid_select: ['eq', 'in'], text: ['eq'], select: ['eq', 'in'], date_range: ['between', 'gte', 'lte'] }

function emptyCondition() {
  return { field: 'lifecycle_stage_id', op: 'eq', value: '' }
}

// موديال بناء/تعديل شريحة (segment) — قايمة شروط مسطحة بعامل AND/OR واحد لكل الشروط (v1، من غير
// تعشيش مجموعات — الشكل المخزّن في filter_definition بيسمح بمجموعات متعددة مستقبلاً من غير ما
// يتغيّر شكل البيانات، بس الواجهة هنا بتعرض مجموعة واحدة بس دلوقتي)
export default function SegmentBuilderModal({ segment, lifecycles, tagsList, allChannels, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(segment?.name || '')
  const [operator, setOperator] = useState(segment?.filter_definition?.groups?.[0]?.operator || 'AND')
  const [conditions, setConditions] = useState(
    segment?.filter_definition?.groups?.[0]?.conditions?.length
      ? segment.filter_definition.groups[0].conditions
      : [emptyCondition()]
  )
  const [previewCount, setPreviewCount] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)

  const buildFilterDefinition = useCallback(() => ({
    operator: 'AND',
    groups: [{ operator, conditions: conditions.filter(c => c.value !== '' && c.value != null) }]
  }), [operator, conditions])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const valid = conditions.filter(c => c.value !== '' && c.value != null)
    if (!valid.length) { setPreviewCount(null); return }
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await apiFetch(`${API_URL}/segments/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter_definition: buildFilterDefinition(), limit: 1 })
        })
        const data = await res.json()
        setPreviewCount(res.ok ? data.count : null)
      } catch { setPreviewCount(null) }
      setPreviewLoading(false)
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [conditions, operator, buildFilterDefinition])

  const updateCondition = (idx, patch) => {
    setConditions(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const next = { ...c, ...patch }
      // لو الحقل اتغيّر، ابدأ بعملية وقيمة فاضية من جديد عشان نتجنب قيمة من نوع تاني عالقة
      if (patch.field && patch.field !== c.field) { next.op = OPS_BY_TYPE[FIELD_TYPES[patch.field]][0]; next.value = '' }
      return next
    }))
  }

  const save = async () => {
    if (!name.trim()) { toast.error(t('conversations.segments.builder.nameRequired')); return }
    const validConditions = conditions.filter(c => c.value !== '' && c.value != null)
    if (!validConditions.length) { toast.error(t('conversations.segments.builder.conditionRequired')); return }
    setSaving(true)
    try {
      const url = segment ? `${API_URL}/segments/${segment.id}` : `${API_URL}/segments`
      const res = await apiFetch(url, {
        method: segment ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filter_definition: buildFilterDefinition() })
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

  const renderValueInput = (cond, idx) => {
    const type = FIELD_TYPES[cond.field]
    if (type === 'uuid_select') {
      const options = cond.field === 'lifecycle_stage_id' ? lifecycles
        : cond.field === 'tag_id' ? tagsList
        : allChannels // channel_id
      if (cond.op === 'in') {
        const selected = Array.isArray(cond.value) ? cond.value : []
        return (
          <select multiple value={selected} onChange={e => updateCondition(idx, { value: Array.from(e.target.selectedOptions, o => o.value) })}
            className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0 h-20">
            {options.map(o => <option key={o.id} value={o.id}>{o.name || o.display_name || o.custom_name}</option>)}
          </select>
        )
      }
      return (
        <select value={cond.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })}
          className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0">
          <option value="">{t('conversations.segments.builder.selectValue')}</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name || o.display_name || o.custom_name}</option>)}
        </select>
      )
    }
    if (type === 'select') {
      const options = cond.field === 'platform'
        ? ['whatsapp', 'whatsapp_qr', 'facebook', 'instagram', 'tiktok']
        : ['open', 'follow_up', 'closed']
      return (
        <select value={cond.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })}
          className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0">
          <option value="">{t('conversations.segments.builder.selectValue')}</option>
          {options.map(o => <option key={o} value={o}>{t(`conversations.segments.values.${o}`, o)}</option>)}
        </select>
      )
    }
    if (type === 'date_range') {
      if (cond.op === 'between') {
        const [from, to] = Array.isArray(cond.value) ? cond.value : ['', '']
        return (
          <div className="flex gap-1.5 flex-1 min-w-0">
            <input type="date" value={from || ''} onChange={e => updateCondition(idx, { value: [e.target.value, to || ''] })}
              className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
            <input type="date" value={to || ''} onChange={e => updateCondition(idx, { value: [from || '', e.target.value] })}
              className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
          </div>
        )
      }
      return <input type="date" value={cond.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })}
        className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
    }
    // text
    return <input type="text" value={cond.value || ''} onChange={e => updateCondition(idx, { value: e.target.value })}
      placeholder={t('conversations.segments.builder.valuePlaceholder')}
      className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-1 min-w-0" />
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-1 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-3 flex-shrink-0">
          <h3 className="font-semibold text-fg">{segment ? t('conversations.segments.builder.editTitle') : t('conversations.segments.builder.title')}</h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('conversations.segments.builder.namePlaceholder')}
            className="w-full bg-surface-3 rounded-xl py-2.5 px-4 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />

          <div className="flex items-center gap-2 text-sm">
            <span className="text-fg-muted">{t('conversations.segments.builder.matchLabel')}</span>
            <button onClick={() => setOperator('AND')} className={`px-3 py-1 rounded-lg text-xs font-medium ${operator === 'AND' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
              {t('conversations.segments.builder.matchAll')}
            </button>
            <button onClick={() => setOperator('OR')} className={`px-3 py-1 rounded-lg text-xs font-medium ${operator === 'OR' ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
              {t('conversations.segments.builder.matchAny')}
            </button>
          </div>

          <div className="space-y-2">
            {conditions.map((cond, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <select value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value })}
                  className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-shrink-0 w-36">
                  {Object.keys(FIELD_TYPES).map(f => <option key={f} value={f}>{t(`conversations.segments.fields.${f}`)}</option>)}
                </select>
                <select value={cond.op} onChange={e => updateCondition(idx, { op: e.target.value, value: e.target.value === 'in' ? [] : (Array.isArray(cond.value) ? '' : cond.value) })}
                  className="bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg flex-shrink-0 w-24">
                  {OPS_BY_TYPE[FIELD_TYPES[cond.field]].map(op => <option key={op} value={op}>{t(`conversations.segments.ops.${op}`)}</option>)}
                </select>
                {renderValueInput(cond, idx)}
                <button onClick={() => setConditions(prev => prev.filter((_, i) => i !== idx))} className="text-fg-subtle hover:text-danger flex-shrink-0 p-1">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={() => setConditions(prev => [...prev, emptyCondition()])}
            className="flex items-center gap-1 text-sm text-brand hover:underline">
            <Plus size={14} /> {t('conversations.segments.builder.addCondition')}
          </button>

          <div className="bg-surface-2 rounded-xl p-3 text-sm text-fg-muted">
            {previewLoading ? t('conversations.segments.builder.counting')
              : previewCount === null ? t('conversations.segments.builder.noConditionsYet')
              : t('conversations.segments.builder.previewCount', { count: previewCount })}
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface-3 text-fg text-sm font-medium">
            {t('conversations.segments.builder.cancel')}
          </button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-medium disabled:opacity-50">
            {saving ? t('conversations.segments.builder.saving') : t('conversations.segments.builder.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
