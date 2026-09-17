import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { logActivity } from '../lib/activityLog'
import { formatDate } from '../lib/locale'
import CountrySelect from './CountrySelect'
import RequestAdminModal from './RequestAdminModal'
import { COUNTRY_MAP } from '../lib/countries'
import { X, Save, User, Globe, Package, Tag, Ban, ShieldCheck, Trash2, Send, Copy, Check, Radio, Calendar, Edit2 } from 'lucide-react'

const FIELD_LABEL_KEYS = { name: 'settings.common.name', phone: 'contactSidebar.fields.phone', country: 'contactSidebar.fields.country', notes: 'contactSidebar.fields.notes' }

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
  const { t } = useTranslation()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const split = splitPhone(phone, countryCode)
  if (!split) return (
    <div className="bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg-subtle">{t('contactSidebar.phone.empty')}</div>
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`+${split.dial || ''}${split.local}`.replace(/\s/g, ''))
      setCopied(true)
      toast.success(t('contactSidebar.phone.copied'))
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('chat.toast.copyFailed'))
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
      <button onClick={copy} title={t('contactSidebar.phone.copyTitle')} className="text-fg-muted hover:text-brand flex-shrink-0">
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

export default function ContactSidebar({ contact, conv, channelLabel, onClose, onUpdate, onDeleted }) {
  const { t } = useTranslation()
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
    package_id: contact?.package_id || '',
    package_expires_at: contact?.package_expires_at || null,
  })
  const [connectedChannels, setConnectedChannels] = useState([])

  // القنوات المتصلة — لواتساب بس، بيعرض كل رقم بتاعنا كلّم بيه العميل ده وامتى آخر مرة، عشان
  // يبقى واضح إن المحادثة الواحدة دي بتجمّع كل الأرقام مع بعض بدل ما تتقسم لمحادثات منفصلة
  useEffect(() => {
    if (conv?.platform !== 'whatsapp' || !conv?.id) { setConnectedChannels([]); return }
    apiFetch(`${API_URL}/conversations/${conv.id}/channels`)
      .then(r => r.json())
      .then(data => setConnectedChannels(data.channels || []))
      .catch(() => setConnectedChannels([]))
  }, [conv?.id, conv?.platform])

  const [lifecycles, setLifecycles] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [customValues, setCustomValues] = useState({})
  const [originalCustomValues, setOriginalCustomValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [allTags, setAllTags] = useState([])
  const [contactTags, setContactTags] = useState([])
  const [requestModalType, setRequestModalType] = useState(null) // 'tag' | 'lifecycle' | null
  const [packages, setPackages] = useState([])
  const [packageModal, setPackageModal] = useState(null) // { packageId, expiresAt } | null
  const [savingPackage, setSavingPackage] = useState(false)

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

    const { data: pkgs } = await supabase.from('contact_packages').select('*').order('sort_order')
    setPackages(pkgs || [])

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
    const has = contactTags.some(tg => tg.id === tag.id)
    if (has) {
      const { error } = await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tag.id)
      if (error) { toast.error(t('chat.toast.genericErrorPrefix', { message: error.message })); return }
      setContactTags(prev => prev.filter(tg => tg.id !== tag.id))
      logActivity(conv?.id, agent?.id, t('contactSidebar.tags.removedActivity', { name: tag.name }))
    } else {
      const { error } = await supabase.from('contact_tags').insert({ contact_id: contact.id, tag_id: tag.id })
      if (error) { toast.error(t('chat.toast.genericErrorPrefix', { message: error.message })); return }
      setContactTags(prev => [...prev, tag])
      logActivity(conv?.id, agent?.id, t('contactSidebar.tags.addedActivity', { name: tag.name }))
    }
  }

  const todayPlusDays = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + (days || 0))
    return d.toISOString().slice(0, 10)
  }

  // اختيار باقة جديدة بيفتح دياولوج يسأل عن معاد التجديد/الانتهاء — بيتحفظ فورًا (مش مستني
  // زرار "حفظ" العام) عشان الموظف ميقفلش السايدبار وينسى. package_reminder_sent_at بيترجع
  // null عشان لو كان فيه تذكير اتبعت قبل كده على معاد قديم، الدورة تبدأ تاني على المعاد الجديد
  const onPackageSelect = (packageId) => {
    if (!packageId) { clearPackage(); return }
    const pkg = packages.find(p => p.id === packageId)
    setPackageModal({ packageId, expiresAt: pkg?.default_duration_days ? todayPlusDays(pkg.default_duration_days) : '' })
  }

  const openEditPackageDate = () => {
    setPackageModal({ packageId: form.package_id, expiresAt: form.package_expires_at ? form.package_expires_at.slice(0, 10) : '' })
  }

  const clearPackage = async () => {
    const { data: updated, error } = await supabase.from('contacts')
      .update({ package_id: null, package_expires_at: null, package_reminder_sent_at: null })
      .eq('id', contact.id).select().single()
    if (error) { toast.error(t('contactSidebar.package.saveError')); return }
    setForm(f => ({ ...f, package_id: '', package_expires_at: null }))
    onUpdate(updated)
    logActivity(conv?.id, agent?.id, t('contactSidebar.package.activityCleared'))
  }

  const confirmPackage = async () => {
    setSavingPackage(true)
    const expiresAtIso = packageModal.expiresAt ? new Date(`${packageModal.expiresAt}T00:00:00`).toISOString() : null
    const { data: updated, error } = await supabase.from('contacts')
      .update({ package_id: packageModal.packageId, package_expires_at: expiresAtIso, package_reminder_sent_at: null })
      .eq('id', contact.id).select().single()
    setSavingPackage(false)
    if (error) { toast.error(t('contactSidebar.package.saveError')); return }
    setForm(f => ({ ...f, package_id: packageModal.packageId, package_expires_at: expiresAtIso }))
    onUpdate(updated)
    const pkgName = packages.find(p => p.id === packageModal.packageId)?.name || ''
    logActivity(conv?.id, agent?.id, expiresAtIso
      ? t('contactSidebar.package.activitySetWithDate', { package: pkgName, date: formatDate(expiresAtIso) })
      : t('contactSidebar.package.activitySet', { package: pkgName }))

    // الخط اللي فات في الأكتيفيتي مختصر — هنا بنشرح بوضوح في الشات نفسه إيه اللي حصل وإيه اللي
    // هيحصل بعدين، عشان أي موظف يفتح المحادثة يفهم الموضوع من غير ما يرجع لملف العميل
    if (conv?.id) {
      const noteText = expiresAtIso
        ? t('contactSidebar.package.noteWithDate', { package: pkgName, date: formatDate(expiresAtIso) })
        : t('contactSidebar.package.noteWithoutDate', { package: pkgName })
      apiFetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conv.id, content: noteText })
      }).catch(() => {})
    }

    setPackageModal(null)
    toast.success(t('contactSidebar.package.saved'))
  }

  const save = async () => {
    setSaving(true)

    // قارن القيم القديمة بالجديدة قبل الحفظ عشان نسجل التغييرات في نشاط المحادثة
    const changes = []
    for (const key of ['name', 'phone', 'country', 'notes']) {
      const oldVal = contact?.[key] || ''
      const newVal = form[key] || ''
      if (oldVal !== newVal) {
        changes.push(t('contactSidebar.activityLog.fieldChanged', { field: t(FIELD_LABEL_KEYS[key]), oldVal: oldVal || '—', newVal: newVal || '—' }))
      }
    }
    if ((contact?.lifecycle_stage_id || '') !== (form.lifecycle_stage_id || '')) {
      const oldName = lifecycles.find(l => l.id === contact?.lifecycle_stage_id)?.name || t('chat.common.noStage')
      const newName = lifecycles.find(l => l.id === form.lifecycle_stage_id)?.name || t('chat.common.noStage')
      changes.push(t('chat.activity.lifecycleChanged', { from: oldName, to: newName }))
    }
    for (const f of customFields) {
      const oldVal = originalCustomValues[f.id] || ''
      const newVal = customValues[f.id] || ''
      if (oldVal !== newVal) {
        changes.push(t('contactSidebar.activityLog.fieldChanged', { field: f.name, oldVal: oldVal || '—', newVal: newVal || '—' }))
      }
    }

    // lifecycle_stage_id و package_id أعمدة uuid — سترنج فاضي '' (قيمة "بدون") بيرفضه بوستجرس
    // بـ"invalid input syntax for type uuid" لأي عمود من النوع ده، وده كان بيفشّل تحديث الصف
    // كله بصمت (الكود مكنش بيتاكد من error) يعني حتى الاسم والدولة والملاحظات مكنوش بيتسجلوا لو
    // كان فيه أي عمود uuid فاضي معاهم في نفس الحفظة — ده أصل مشكلة "الدولة بتختفي بعد الحفظ"
    const payload = { ...form, lifecycle_stage_id: form.lifecycle_stage_id || null, package_id: form.package_id || null }

    const { data: updated, error: saveErr } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', contact.id)
      .select()
      .single()
    if (saveErr) {
      toast.error(t('contactSidebar.saveError'))
      setSaving(false)
      return
    }
    if (updated) onUpdate(updated)

    // Save custom fields
    let customFieldErr = null
    for (const [fieldId, value] of Object.entries(customValues)) {
      const { error } = await supabase.from('contact_custom_fields').upsert({
        contact_id: contact.id,
        field_definition_id: fieldId,
        value
      }, { onConflict: 'contact_id,field_definition_id' })
      if (error) customFieldErr = error
    }
    if (customFieldErr) toast.error(t('contactSidebar.saveError'))
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
    if (error) { toast.error(t('contactSidebar.dangerZone.blockError')); return }
    onUpdate({ ...contact, is_blocked: newVal })
    logActivity(conv?.id, agent?.id, newVal ? t('contactSidebar.dangerZone.blockActivityBlocked') : t('contactSidebar.dangerZone.blockActivityUnblocked'))
    toast.success(newVal ? t('contactSidebar.dangerZone.blockToastBlocked') : t('contactSidebar.dangerZone.blockToastUnblocked'))
  }

  // بيمسح كل أثر العميل نهائيًا — لازم يتم من السيرفر مش من هنا مباشرة: عميل حقيقي بيكون ليه
  // آلاف الرسايل، ومتصفحنا بيشتغل بصلاحية ليها statement_timeout قصير (٨ ثواني) بيتضرب أحيانًا
  // على جدول كبير مشغول ويطلع خطأ غامض. السيرفر بيمسح contacts بس وباقي الجداول بتتشال
  // تلقائي بالـ cascade، بصلاحية من غير أي مهلة زمنية
  const deleteContact = async () => {
    if (!confirm(t('contactSidebar.dangerZone.deleteConfirm1', { name: contact?.name || t('contactSidebar.dangerZone.deleteConfirmFallbackName') }))) return
    if (!confirm(t('contactSidebar.dangerZone.deleteConfirm2'))) return

    setDeleting(true)
    try {
      const res = await apiFetch(`${API_URL}/contacts/${contact.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('contactSidebar.dangerZone.deleteError'))
      toast.success(t('contactSidebar.dangerZone.deleteSuccess'))
      onDeleted?.()
    } catch (err) {
      toast.error(t('chat.toast.genericErrorPrefix', { message: err.message }))
    } finally {
      setDeleting(false)
    }
  }

  const currentStage = lifecycles.find(l => l.id === form.lifecycle_stage_id)

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-80 h-full bg-surface-2 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-3">
          <span className="font-semibold text-fg">{t('contactSidebar.title')}</span>
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

          {/* القنوات المتصلة — لو العميل كلّم من أكتر من رقم واتساب، بتتجمّع كلها هنا */}
          {connectedChannels.length > 1 && (
            <div className="bg-surface-3 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-fg-muted flex items-center gap-1.5"><Radio size={12} /> {t('contactSidebar.connectedChannels.title')}</p>
              {connectedChannels.map(c => (
                <div key={c.channel_id} className="flex items-center justify-between text-xs">
                  <span className="text-fg truncate">{c.channels?.custom_name || c.channels?.display_name || t('contactSidebar.connectedChannels.numberFallback', { platform: t('chat.platformLabels.whatsapp') })}</span>
                  <span className="text-fg-subtle flex-shrink-0">{formatDate(c.last_inbound_at, { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}

          {/* Basic Fields */}
          <Field label={t('settings.common.name')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('contactSidebar.fields.phone')}</label>
            <PhoneDisplay phone={form.phone} countryCode={form.country} />
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('contactSidebar.fields.country')}</label>
            <CountrySelect value={form.country || null} onChange={v => setForm({ ...form, country: v || '' })} />
          </div>

          {/* Tags — التاجات بتتحط من الأدمن بس في الإعدادات، هنا بس اختيار من الموجود */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted mb-1.5">
              <Tag size={12} /> {t('contactSidebar.tags.label')}
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
            {allTags.filter(tg => !contactTags.some(ct => ct.id === tg.id)).length > 0 && (
              <select value="" onChange={e => {
                const tag = allTags.find(tg => tg.id === e.target.value)
                if (tag) toggleTag(tag)
              }}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">{t('contactSidebar.tags.addPlaceholder')}</option>
                {allTags.filter(tg => !contactTags.some(ct => ct.id === tg.id)).map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            )}
            {agent?.role !== 'admin' && (
              <button onClick={() => setRequestModalType('tag')}
                className="flex items-center gap-1.5 text-xs text-brand mt-1.5 hover:underline">
                <Send size={11} /> {t('contactSidebar.tags.requestNew')}
              </button>
            )}
          </div>

          {/* Lifecycle */}
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('contactSidebar.lifecycle.label')}</label>
            <select
              value={form.lifecycle_stage_id}
              onChange={e => setForm({ ...form, lifecycle_stage_id: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">{t('contactSidebar.lifecycle.none')}</option>
              {lifecycles.map(l => (
                <option key={l.id} value={l.id}>{l.icon ? `${l.icon} ` : ''}{l.name}</option>
              ))}
            </select>
            {currentStage && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: currentStage.color }} />
                <span className="text-xs text-fg-muted">{currentStage.icon && `${currentStage.icon} `}{currentStage.name}</span>
              </div>
            )}
            {agent?.role !== 'admin' && (
              <button onClick={() => setRequestModalType('lifecycle')}
                className="flex items-center gap-1.5 text-xs text-brand mt-1.5 hover:underline">
                <Send size={11} /> {t('contactSidebar.lifecycle.requestNew')}
              </button>
            )}
          </div>

          {/* الباقة — اختيار باقة بيفتح دياولوج معاد التجديد/الانتهاء فورًا */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted mb-1">
              <Package size={12} /> {t('contactSidebar.package.label')}
            </label>
            {packages.length > 0 ? (
              <>
                <select
                  value={form.package_id}
                  onChange={e => onPackageSelect(e.target.value)}
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">{t('contactSidebar.package.none')}</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {form.package_id && (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs text-fg-muted">
                      <Calendar size={11} />
                      {form.package_expires_at
                        ? t('contactSidebar.package.expiresOn', { date: formatDate(form.package_expires_at) })
                        : t('contactSidebar.package.noExpiry')}
                    </span>
                    <button onClick={openEditPackageDate} className="flex items-center gap-1 text-xs text-brand hover:underline flex-shrink-0">
                      <Edit2 size={10} /> {t('contactSidebar.package.editDate')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-surface-3 rounded-xl px-3 py-2.5 text-xs text-fg-subtle">{t('contactSidebar.package.noneDefined')}</div>
            )}
            {agent?.role !== 'admin' && (
              <button onClick={() => setRequestModalType('package')}
                className="flex items-center gap-1.5 text-xs text-brand mt-1.5 hover:underline">
                <Send size={11} /> {t('contactSidebar.package.requestNew')}
              </button>
            )}
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted mb-2 font-medium">{t('contactSidebar.customFields.title')}</p>
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
                        <option value="">{t('contactSidebar.customFields.selectPlaceholder')}</option>
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
            <label className="block text-xs text-fg-muted mb-1">{t('contactSidebar.fields.notes')}</label>
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
              <p className="text-xs text-fg-subtle font-medium">{t('contactSidebar.dangerZone.title')}</p>
              <button onClick={toggleBlock} disabled={blocking}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                  contact?.is_blocked ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-warning/10 text-warning hover:bg-warning/20'
                }`}>
                {contact?.is_blocked ? <><ShieldCheck size={15} /> {t('contactSidebar.dangerZone.unblock')}</> : <><Ban size={15} /> {t('contactSidebar.dangerZone.block')}</>}
              </button>
              <button onClick={deleteContact} disabled={deleting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50">
                {deleting ? <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin" /> : <><Trash2 size={15} /> {t('contactSidebar.dangerZone.deleteButton')}</>}
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
            ) : saved ? t('settings.common.savedCheck') : (
              <><Save size={14} /> {t('contactSidebar.saveButton')}</>
            )}
          </button>
        </div>
      </div>

      {requestModalType && (
        <RequestAdminModal type={requestModalType} onClose={() => setRequestModalType(null)} />
      )}

      {packageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={() => !savingPackage && setPackageModal(null)}>
          <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-surface-3">
              <Package size={16} className="text-brand" />
              <span className="font-semibold text-fg text-sm">{t('contactSidebar.package.modalTitle')}</span>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <label className="block text-xs text-fg-muted mb-1">{t('contactSidebar.package.expiryLabel')}</label>
                <input type="date" value={packageModal.expiresAt}
                  onChange={e => setPackageModal(m => ({ ...m, expiresAt: e.target.value }))}
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
                <p className="text-[10px] text-fg-subtle mt-1">{t('contactSidebar.package.expiryHint')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setPackageModal(null)} disabled={savingPackage}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                {t('chat.common.cancel')}
              </button>
              <button onClick={confirmPackage} disabled={savingPackage}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingPackage ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('contactSidebar.package.confirm')}
              </button>
            </div>
          </div>
        </div>
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
