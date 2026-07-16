import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { logActivity } from '../lib/activityLog'
import CountrySelect from './CountrySelect'
import RequestAdminModal from './RequestAdminModal'
import { COUNTRY_MAP } from '../lib/countries'
import { X, Save, User, Globe, Package, Tag, Ban, ShieldCheck, Trash2, Send, Copy, Check } from 'lucide-react'

const FIELD_LABELS = { name: 'الاسم', phone: 'الهاتف', country: 'الدولة', notes: 'الملاحظات' }

// بيقسم الرقم لكود الدولة + باقي الرقم بصيغته المحلية (بصفر في الأول) عشان يبقى واضح ومقروء أكتر
// من رقم طويل متصل، ونحتفظ بالرقم الكامل من غير مسافات عشان النسخ يبقى دقيق
function splitPhone(phone, countryCode) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const country = countryCode ? COUNTRY_MAP[countryCode] : null
  if (country && digits.startsWith(country.dial)) {
    const rest = digits.slice(country.dial.length)
    return { code: country.code, dial: country.dial, local: country.dial === '1' ? rest : `0${rest}` }
  }
  return { code: null, dial: null, local: digits }
}

function PhoneDisplay({ phone, countryCode }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const split = splitPhone(phone, countryCode)
  if (!split) return (
    <div className="bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg-subtle">لا يوجد رقم</div>
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`+${split.dial || ''}${split.local}`.replace(/\s/g, ''))
      setCopied(true)
      toast.success('تم نسخ الرقم')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('فشل النسخ')
    }
  }

  return (
    <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5">
      {split.code && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-2 text-fg-muted flex-shrink-0">{split.code}</span>
      )}
      <span className="text-sm text-fg flex-1 truncate" dir="ltr">
        {split.dial ? `+${split.dial} ${split.local}` : split.local}
      </span>
      <button onClick={copy} title="انسخ الرقم" className="text-fg-muted hover:text-brand flex-shrink-0">
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

export default function ContactSidebar({ contact, conv, channelLabel, onClose, onUpdate, onDeleted }) {
  const { agent } = useAuth()
  const toast = useToast()
  const [blocking, setBlocking] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  const [originalCustomValues, setOriginalCustomValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [allTags, setAllTags] = useState([])
  const [contactTags, setContactTags] = useState([])
  const [requestModalType, setRequestModalType] = useState(null) // 'tag' | 'lifecycle' | null

  useEffect(() => {
    loadData()
  }, [contact?.id])

  const loadData = async () => {
    const { data: stages } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    setLifecycles(stages || [])

    const { data: defs } = await supabase.from('custom_field_definitions').select('*').order('field_order')
    setCustomFields(defs || [])

    const { data: allTagsData } = await supabase.from('tags').select('*').order('name')
    setAllTags(allTagsData || [])

    if (contact?.id) {
      const { data: vals } = await supabase
        .from('contact_custom_fields')
        .select('*')
        .eq('contact_id', contact.id)
      const map = {}
      vals?.forEach(v => { map[v.field_definition_id] = v.value })
      setCustomValues(map)
      setOriginalCustomValues(map)

      const { data: ctRows } = await supabase
        .from('contact_tags').select('tag_id, tags(id, name, color)').eq('contact_id', contact.id)
      setContactTags((ctRows || []).map(r => r.tags).filter(Boolean))
    }
  }

  const toggleTag = async (tag) => {
    const has = contactTags.some(t => t.id === tag.id)
    if (has) {
      await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tag.id)
      setContactTags(prev => prev.filter(t => t.id !== tag.id))
      logActivity(conv?.id, agent?.id, `أزال تاج "${tag.name}" من العميل`)
    } else {
      await supabase.from('contact_tags').insert({ contact_id: contact.id, tag_id: tag.id })
      setContactTags(prev => [...prev, tag])
      logActivity(conv?.id, agent?.id, `أضاف تاج "${tag.name}" للعميل`)
    }
  }

  const save = async () => {
    setSaving(true)

    // قارن القيم القديمة بالجديدة قبل الحفظ عشان نسجل التغييرات في نشاط المحادثة
    const changes = []
    for (const key of ['name', 'phone', 'country', 'notes']) {
      const oldVal = contact?.[key] || ''
      const newVal = form[key] || ''
      if (oldVal !== newVal) {
        changes.push(`غيّر ${FIELD_LABELS[key]} من "${oldVal || '—'}" إلى "${newVal || '—'}"`)
      }
    }
    if ((contact?.lifecycle_stage_id || '') !== (form.lifecycle_stage_id || '')) {
      const oldName = lifecycles.find(l => l.id === contact?.lifecycle_stage_id)?.name || 'بدون مرحلة'
      const newName = lifecycles.find(l => l.id === form.lifecycle_stage_id)?.name || 'بدون مرحلة'
      changes.push(`غيّر مرحلة الـ Lifecycle من "${oldName}" إلى "${newName}"`)
    }
    for (const f of customFields) {
      const oldVal = originalCustomValues[f.id] || ''
      const newVal = customValues[f.id] || ''
      if (oldVal !== newVal) {
        changes.push(`غيّر ${f.name} من "${oldVal || '—'}" إلى "${newVal || '—'}"`)
      }
    }

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
    setOriginalCustomValues(customValues)

    for (const change of changes) {
      logActivity(conv?.id, agent?.id, change)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleBlock = async () => {
    const newVal = !contact.is_blocked
    setBlocking(true)
    const { error } = await supabase.from('contacts').update({ is_blocked: newVal }).eq('id', contact.id)
    setBlocking(false)
    if (error) { toast.error('حصل خطأ، حاول تاني'); return }
    onUpdate({ ...contact, is_blocked: newVal })
    logActivity(conv?.id, agent?.id, newVal ? 'حظر العميل' : 'ألغى حظر العميل')
    toast.success(newVal ? 'اتحظر العميل' : 'اتلغى حظر العميل')
  }

  // بيمسح كل أثر العميل من قاعدة البيانات — المحادثات والرسايل والتاجات والحقول الإضافية، بالترتيب
  // الصح عشان مايصطدمش بقيود الـ foreign key
  const deleteContact = async () => {
    if (!confirm(`متأكد إنك عايز تمسح كل بيانات "${contact?.name || 'العميل ده'}" نهائياً؟ الإجراء ده مينفعش يتراجع فيه.`)) return
    if (!confirm('تأكيد أخير: هيتم حذف المحادثة وكل الرسايل المرتبطة بالعميل ده نهائياً. متأكد؟')) return

    setDeleting(true)
    const { data: convs } = await supabase.from('conversations').select('id').eq('contact_id', contact.id)
    const convIds = (convs || []).map(c => c.id)

    if (convIds.length) {
      await supabase.from('messages').delete().in('conversation_id', convIds)
      await supabase.from('conversation_reads').delete().in('conversation_id', convIds)
      await supabase.from('conversation_assignment_log').delete().in('conversation_id', convIds)
      await supabase.from('conversation_activity_log').delete().in('conversation_id', convIds)
      await supabase.from('conversations').delete().in('id', convIds)
    }
    await supabase.from('contact_tags').delete().eq('contact_id', contact.id)
    await supabase.from('contact_custom_fields').delete().eq('contact_id', contact.id)
    const { error } = await supabase.from('contacts').delete().eq('id', contact.id)

    setDeleting(false)
    if (error) { toast.error('حصل خطأ أثناء الحذف'); return }
    toast.success('اتمسحت بيانات العميل')
    onDeleted?.()
  }

  const currentStage = lifecycles.find(l => l.id === form.lifecycle_stage_id)

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-80 h-full bg-surface-2 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-3">
          <span className="font-semibold text-fg">بيانات العميل</span>
          <button onClick={onClose} className="text-fg-muted hover:text-fg">
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
                <User size={24} className="text-fg-muted" />
              </div>
            )}
            <span className="mt-2 text-xs text-fg-muted">{contact?.platform_id}</span>
            {channelLabel && (
              <span className="mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">
                {channelLabel}
              </span>
            )}
          </div>

          {/* Basic Fields */}
          <Field label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">الهاتف</label>
            <PhoneDisplay phone={form.phone} countryCode={form.country} />
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">الدولة</label>
            <CountrySelect value={form.country || null} onChange={v => setForm({ ...form, country: v || '' })} />
          </div>

          {/* Tags — التاجات بتتحط من الأدمن بس في الإعدادات، هنا بس اختيار من الموجود */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted mb-1.5">
              <Tag size={12} /> التاجات
            </label>
            {contactTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {contactTags.map(tag => (
                  <button key={tag.id} onClick={() => toggleTag(tag)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: tag.color, color: '#fff' }}>
                    {tag.name} <X size={10} />
                  </button>
                ))}
              </div>
            )}
            {allTags.filter(t => !contactTags.some(ct => ct.id === t.id)).length > 0 && (
              <select value="" onChange={e => {
                const tag = allTags.find(t => t.id === e.target.value)
                if (tag) toggleTag(tag)
              }}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">— إضافة تاج —</option>
                {allTags.filter(t => !contactTags.some(ct => ct.id === t.id)).map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            )}
            {agent?.role !== 'admin' && (
              <button onClick={() => setRequestModalType('tag')}
                className="flex items-center gap-1.5 text-xs text-brand mt-1.5 hover:underline">
                <Send size={11} /> اطلب تاج جديد من الأدمن
              </button>
            )}
          </div>

          {/* Lifecycle */}
          <div>
            <label className="block text-xs text-fg-muted mb-1">مرحلة الـ Lifecycle</label>
            <select
              value={form.lifecycle_stage_id}
              onChange={e => setForm({ ...form, lifecycle_stage_id: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">— بدون —</option>
              {lifecycles.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {currentStage && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentStage.color }} />
                <span className="text-xs text-fg-muted">{currentStage.name}</span>
              </div>
            )}
            {agent?.role !== 'admin' && (
              <button onClick={() => setRequestModalType('lifecycle')}
                className="flex items-center gap-1.5 text-xs text-brand mt-1.5 hover:underline">
                <Send size={11} /> اطلب مرحلة جديدة من الأدمن
              </button>
            )}
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted mb-2 font-medium">حقول إضافية</p>
              <div className="space-y-3">
                {customFields.map(f => (
                  <div key={f.id}>
                    <label className="block text-xs text-fg-muted mb-1">{f.name}</label>
                    {f.field_type === 'select' ? (
                      <select
                        value={customValues[f.id] || ''}
                        onChange={e => setCustomValues({ ...customValues, [f.id]: e.target.value })}
                        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
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
                        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-fg-muted mb-1">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* منطقة خطرة — أدمن بس */}
          {agent?.role === 'admin' && (
            <div className="pt-2 border-t border-surface-3 space-y-2">
              <p className="text-xs text-fg-subtle font-medium">منطقة خطرة</p>
              <button onClick={toggleBlock} disabled={blocking}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                  contact?.is_blocked ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-warning/10 text-warning hover:bg-warning/20'
                }`}>
                {contact?.is_blocked ? <><ShieldCheck size={15} /> إلغاء حظر العميل</> : <><Ban size={15} /> حظر العميل</>}
              </button>
              <button onClick={deleteContact} disabled={deleting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50">
                {deleting ? <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin" /> : <><Trash2 size={15} /> حذف بيانات العميل نهائياً</>}
              </button>
            </div>
          )}
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

      {requestModalType && (
        <RequestAdminModal type={requestModalType} onClose={() => setRequestModalType(null)} />
      )}
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-fg-muted mb-1">{label}</label>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  )
}
