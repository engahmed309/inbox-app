import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Save, User, Globe, Package } from 'lucide-react'

export default function ContactSidebar({ contact, conv, onClose, onUpdate }) {
  const [form, setForm] = useState({
    name: contact?.name || '',
    phone: contact?.phone || '',
    country: contact?.country || '',
    notes: contact?.notes || '',
    lifecycle_stage_id: contact?.lifecycle_stage_id || '',
  })
  const [lifecycles, setLifecycles] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [customValues, setCustomValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadData()
  }, [contact?.id])

  const loadData = async () => {
    const { data: stages } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    setLifecycles(stages || [])

    const { data: defs } = await supabase.from('custom_field_definitions').select('*').order('field_order')
    setCustomFields(defs || [])

    if (contact?.id) {
      const { data: vals } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contact.id)
      const map = {}
      vals?.forEach(v => { map[v.field_definition_id] = v.value })
      setCustomValues(map)
    }
  }

  const save = async () => {
    setSaving(true)
    const { data: updated } = await supabase
      .from('contacts')
      .update(form)
      .eq('id', contact.id)
      .select()
      .single()
    if (updated) onUpdate(updated)

    // Save custom fields
    for (const [fieldId, value] of Object.entries(customValues)) {
      await supabase.from('contact_custom_fields').upsert({
        contact_id: contact.id,
        field_definition_id: fieldId,
        value
      }, { onConflict: 'contact_id,field_definition_id' })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const currentStage = lifecycles.find(l => l.id === form.lifecycle_stage_id)

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-80 h-full bg-surface-2 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-3">
          <span className="font-semibold text-white">بيانات العميل</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center py-2">
            {contact?.profile_pic ? (
              <img src={contact.profile_pic} className="w-16 h-16 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center">
                <User size={24} className="text-slate-400" />
              </div>
            )}
            <span className="mt-2 text-xs text-slate-400">{contact?.platform_id}</span>
          </div>

          {/* Basic Fields */}
          <Field label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Field label="الهاتف" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <Field label="الدولة" value={form.country} onChange={v => setForm({ ...form, country: v })} />

          {/* Lifecycle */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">مرحلة الـ Lifecycle</label>
            <select
              value={form.lifecycle_stage_id}
              onChange={e => setForm({ ...form, lifecycle_stage_id: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">— بدون —</option>
              {lifecycles.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {currentStage && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentStage.color }} />
                <span className="text-xs text-slate-400">{currentStage.name}</span>
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium">حقول إضافية</p>
              <div className="space-y-3">
                {customFields.map(f => (
                  <div key={f.id}>
                    <label className="block text-xs text-slate-400 mb-1">{f.name}</label>
                    {f.field_type === 'select' ? (
                      <select
                        value={customValues[f.id] || ''}
                        onChange={e => setCustomValues({ ...customValues, [f.id]: e.target.value })}
                        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        <option value="">— اختر —</option>
                        {(f.options?.choices || []).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                        value={customValues[f.id] || ''}
                        onChange={e => setCustomValues({ ...customValues, [f.id]: e.target.value })}
                        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="p-4 border-t border-surface-3">
          <button onClick={save} disabled={saving}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? '✓ تم الحفظ' : (
              <><Save size={14} /> حفظ التغييرات</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  )
}
