import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  ArrowRight, Users, Tag, List, Settings2, Plus, Trash2,
  Save, Edit2, Check, X, ToggleLeft, ToggleRight, LogOut,
  MessageSquareText, Search, Paperclip, Facebook, Instagram, KeyRound, AlertTriangle
} from 'lucide-react'

const TABS = [
  { key: 'agents', label: 'الموظفون', icon: Users },
  { key: 'accounts', label: 'الحسابات المربوطة', icon: Instagram },
  { key: 'lifecycle', label: 'Lifecycle', icon: Tag },
  { key: 'fields', label: 'الحقول', icon: List },
  { key: 'quickreplies', label: 'الردود السريعة', icon: MessageSquareText },
  { key: 'roundrobin', label: 'التوزيع', icon: Settings2 },
  { key: 'danger', label: 'منطقة خطرة', icon: AlertTriangle },
]

export default function SettingsScreen() {
  const [tab, setTab] = useState('agents')
  const { agent, signOut } = useAuth()
  const navigate = useNavigate()

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-fg-muted">
      <p>غير مصرح بالوصول</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate(-1)} className="text-fg-muted hover:text-fg">
          <ArrowRight size={20} />
        </button>
        <span className="font-bold text-fg">الإعدادات</span>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="text-fg-muted hover:text-danger transition-colors">
          <LogOut size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'agents' && <AgentsTab />}
        {tab === 'accounts' && <ConnectedAccountsTab />}
        {tab === 'lifecycle' && <LifecycleTab />}
        {tab === 'fields' && <FieldsTab />}
        {tab === 'quickreplies' && <QuickRepliesTab agent={agent} />}
        {tab === 'roundrobin' && <RoundRobinTab />}
        {tab === 'danger' && <DangerZoneTab />}
      </div>
    </div>
  )
}

// ─── Agents Tab ───────────────────────────────────────────
function AgentsTab() {
  const toast = useToast()
  const [agents, setAgents] = useState([])
  const [counts, setCounts] = useState({}) // { agent_id: {open, follow_up, closed} }
  const [totals, setTotals] = useState({ open: 0, follow_up: 0, closed: 0 })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)

  useEffect(() => { loadAgents(); loadCounts() }, [])

  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('*').order('created_at')
    setAgents(data || [])
  }

  const loadCounts = async () => {
    const { data } = await supabase.from('conversations').select('assigned_agent_id, status')
    const map = {}
    const t = { open: 0, follow_up: 0, closed: 0 }
    data?.forEach(c => {
      if (!c.assigned_agent_id) return
      if (!map[c.assigned_agent_id]) map[c.assigned_agent_id] = { open: 0, follow_up: 0, closed: 0 }
      if (map[c.assigned_agent_id][c.status] !== undefined) map[c.assigned_agent_id][c.status]++
      if (t[c.status] !== undefined) t[c.status]++
    })
    setCounts(map)
    setTotals(t)
  }

  const addAgent = async () => {
    setLoading(true)
    try {
      // Create Supabase Auth user (requires service role - do via backend)
      const res = await fetch('https://inbox-api.sehawafeya.com/admin/create-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error(await res.text())
      setShowAdd(false)
      setForm({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
      loadAgents()
      toast.success('تم إضافة الموظف بنجاح')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const updateAgent = async (id, updates) => {
    await supabase.from('agents').update(updates).eq('id', id)
    loadAgents()
    setEditId(null)
  }

  const deleteAgent = async (id) => {
    if (!confirm('حذف الموظف؟')) return
    await supabase.from('agents').delete().eq('id', id)
    loadAgents()
  }

  const resetPassword = async (id) => {
    const pass = prompt('اكتب كلمة المرور الجديدة (٦ حروف على الأقل):')
    if (!pass) return
    if (pass.length < 6) { toast.error('لازم ٦ حروف على الأقل'); return }
    try {
      const res = await fetch('https://inbox-api.sehawafeya.com/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: id, new_password: pass })
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('تم تغيير كلمة المرور بنجاح')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">الموظفون</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة موظف
        </button>
      </div>

      {/* إجمالي المحادثات */}
      <div className="grid grid-cols-3 gap-2">
        <TotalStat label="مفتوحة" value={totals.open} color="text-success" />
        <TotalStat label="متابعة" value={totals.follow_up} color="text-follow" />
        <TotalStat label="مغلقة" value={totals.closed} color="text-fg-muted" />
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg">موظف جديد</h3>
          <InputField label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label="البريد الإلكتروني" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <InputField label="كلمة المرور" value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">الدور</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">موظف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <MaxConversationsField value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: v })} />
          <Toggle
            label="يرى جميع المحادثات"
            value={form.can_see_all_conversations}
            onChange={v => setForm({ ...form, can_see_all_conversations: v })}
          />
          <div className="flex gap-2 pt-1">
            <button onClick={addAgent} disabled={loading}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {loading ? 'جاري الإضافة...' : 'إضافة'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {agents.map(ag => (
        <AgentCard key={ag.id} agent={ag} counts={counts[ag.id]}
          onEdit={() => setEditId(ag.id)} onDelete={() => deleteAgent(ag.id)}
          onUpdate={updates => updateAgent(ag.id, updates)}
          onResetPassword={() => resetPassword(ag.id)}
          editing={editId === ag.id} />
      ))}
    </div>
  )
}

function TotalStat({ label, value, color }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3 border border-surface-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-fg-subtle mt-0.5">{label}</p>
    </div>
  )
}

function MaxConversationsField({ value, onChange }) {
  const unlimited = value == null
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-fg-muted">الحد الأقصى للمحادثات</label>
        <button type="button" onClick={() => onChange(unlimited ? 10 : null)}
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${unlimited ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
          {unlimited ? 'غير محدود' : 'محدود'}
        </button>
      </div>
      {!unlimited && (
        <input type="number" value={value ?? ''} onChange={e => onChange(parseInt(e.target.value) || 0)}
          className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
      )}
    </div>
  )
}

function AgentCard({ agent, counts, onEdit, onDelete, onUpdate, onResetPassword, editing }) {
  const [form, setForm] = useState({ name: agent.name, max_conversations: agent.max_conversations, role: agent.role, can_see_all_conversations: agent.can_see_all_conversations })
  const c = counts || { open: 0, follow_up: 0, closed: 0 }

  return (
    <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
      {editing ? (
        <div className="space-y-3">
          <InputField label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <MaxConversationsField value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">الدور</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">موظف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <Toggle label="يرى جميع المحادثات" value={form.can_see_all_conversations} onChange={v => setForm({ ...form, can_see_all_conversations: v })} />
          <div className="flex gap-2">
            <button onClick={() => onUpdate(form)} className="flex-1 py-2 bg-brand rounded-xl text-sm text-white">حفظ</button>
            <button onClick={onEdit} className="px-3 py-2 bg-surface-3 rounded-xl text-sm text-fg-muted">إلغاء</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-fg font-semibold">
                {agent.name[0]}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-2 ${agent.status === 'busy' ? 'bg-follow' : agent.is_online ? 'bg-success' : 'bg-fg-subtle'}`} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-fg">{agent.name}</p>
              <p className="text-xs text-fg-muted">{agent.email} · {agent.role === 'admin' ? 'مدير' : 'موظف'}</p>
              <p className="text-xs text-fg-subtle">الحد: {agent.max_conversations == null ? 'غير محدود' : `${agent.max_conversations} محادثة`}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={onResetPassword} title="تغيير كلمة المرور"
                className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-brand rounded-lg hover:bg-surface-3">
                <KeyRound size={14} />
              </button>
              <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
                <Edit2 size={14} />
              </button>
              <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-danger rounded-lg hover:bg-surface-3">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 mt-3 pt-3 border-t border-surface-3">
            <span className="text-[11px] text-success">مفتوحة: {c.open}</span>
            <span className="text-[11px] text-follow">متابعة: {c.follow_up}</span>
            <span className="text-[11px] text-fg-subtle">مغلقة: {c.closed}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Connected Accounts Tab ───────────────────────────────
function ConnectedAccountsTab() {
  const [ig, setIg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('https://inbox-api.sehawafeya.com/instagram/account')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الاتصال')
      setIg(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-fg">الحسابات المربوطة</h2>

      <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
        <p className="text-xs text-fg-muted mb-3 flex items-center gap-1.5">
          <Instagram size={13} className="text-pink-400" /> إنستجرام
        </p>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : ig ? (
          <div className="flex items-center gap-3">
            {ig.profile_picture_url ? (
              <img src={ig.profile_picture_url} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
                <Instagram size={18} className="text-fg-muted" />
              </div>
            )}
            <div>
              <p className="text-sm text-fg font-semibold">{ig.name}</p>
              <p className="text-xs text-fg-muted">@{ig.username}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
        <p className="text-xs text-fg-muted mb-3 flex items-center gap-1.5">
          <Facebook size={13} className="text-blue-400" /> فيسبوك
        </p>
        <p className="text-sm text-fg-muted">مربوطة عن طريق صفحة العيادة على فيسبوك (Mohamed Saieed).</p>
      </div>
    </div>
  )
}

// ─── Lifecycle Tab ────────────────────────────────────────
function LifecycleTab() {
  const [stages, setStages] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#3B82F6' })

  useEffect(() => { loadStages() }, [])
  const loadStages = async () => {
    const { data } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    setStages(data || [])
  }

  const add = async () => {
    await supabase.from('lifecycle_stages').insert({ ...form, stage_order: stages.length })
    setForm({ name: '', color: '#3B82F6' })
    setShowAdd(false)
    loadStages()
  }

  const remove = async (id) => {
    if (!confirm('حذف المرحلة؟')) return
    await supabase.from('lifecycle_stages').delete().eq('id', id)
    loadStages()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">مراحل Lifecycle</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="اسم المرحلة" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">اللون</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg bg-surface-3 border border-surface-3 cursor-pointer" />
              <span className="text-sm text-fg-muted">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">إضافة</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">إلغاء</button>
          </div>
        </div>
      )}

      {stages.map((s, i) => (
        <div key={s.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
          <span className="flex-1 text-sm text-fg">{s.name}</span>
          <span className="text-xs text-fg-subtle">#{i + 1}</span>
          <button onClick={() => remove(s.id)} className="text-fg-muted hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Custom Fields Tab ────────────────────────────────────
function FieldsTab() {
  const [fields, setFields] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', field_type: 'text', options: '' })

  useEffect(() => { loadFields() }, [])
  const loadFields = async () => {
    const { data } = await supabase.from('custom_field_definitions').select('*').order('field_order')
    setFields(data || [])
  }

  const add = async () => {
    const payload = {
      name: form.name,
      field_type: form.field_type,
      field_order: fields.length,
      options: form.field_type === 'select' && form.options
        ? { choices: form.options.split(',').map(s => s.trim()) }
        : null
    }
    await supabase.from('custom_field_definitions').insert(payload)
    setForm({ name: '', field_type: 'text', options: '' })
    setShowAdd(false)
    loadFields()
  }

  const remove = async (id) => {
    if (!confirm('حذف الحقل؟')) return
    await supabase.from('custom_field_definitions').delete().eq('id', id)
    loadFields()
  }

  const TYPES = { text: 'نص', select: 'قائمة', date: 'تاريخ', number: 'رقم' }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">الحقول الإضافية</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="اسم الحقل" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">النوع</label>
            <select value={form.field_type} onChange={e => setForm({ ...form, field_type: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {form.field_type === 'select' && (
            <InputField label="الخيارات (مفصولة بفاصلة)" value={form.options} onChange={v => setForm({ ...form, options: v })} placeholder="خيار 1, خيار 2, خيار 3" />
          )}
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">إضافة</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">إلغاء</button>
          </div>
        </div>
      )}

      {fields.map(f => (
        <div key={f.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <div className="flex-1">
            <p className="text-sm text-fg font-medium">{f.name}</p>
            <p className="text-xs text-fg-muted">{TYPES[f.field_type]}</p>
            {f.options?.choices && <p className="text-xs text-fg-subtle mt-0.5">{f.options.choices.join(' · ')}</p>}
          </div>
          <button onClick={() => remove(f.id)} className="text-fg-muted hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Quick Replies Tab ────────────────────────────────────
function QuickRepliesTab({ agent }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', text: '' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('quick_replies').select('*').order('name')
    setItems(data || [])
  }

  const fileType = (f) => f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'file'

  const add = async () => {
    if (!form.name.trim() || (!form.text.trim() && !file)) {
      toast.error('لازم اسم + نص أو ملف على الأقل')
      return
    }
    setSaving(true)
    try {
      let file_url = null, file_type = null
      if (file) {
        const path = `quick-replies/${Date.now()}_${file.name}`
        const { error } = await supabase.storage.from('inbox-media').upload(path, file)
        if (error) throw error
        const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
        file_url = urlData.publicUrl
        file_type = fileType(file)
      }
      await supabase.from('quick_replies').insert({
        name: form.name.trim(), text: form.text.trim() || null,
        file_url, file_type, created_by: agent?.id
      })
      setForm({ name: '', text: '' })
      setFile(null)
      setShowAdd(false)
      load()
    } catch {
      toast.error('حصل خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('حذف الرد السريع؟')) return
    await supabase.from('quick_replies').delete().eq('id', id)
    load()
  }

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">الردود السريعة</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المكتبة..."
          className="w-full bg-surface-3 rounded-xl py-2 px-4 pr-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="الاسم (يستخدم بعد / في المحادثة)" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="مثال: ترحيب" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">النص (اختياري لو فيه ملف)</label>
            <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} rows={3}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">ملف مرفق (اختياري: صورة / فيديو / صوت / PDF)</label>
            <label className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg-muted cursor-pointer hover:text-fg">
              <Paperclip size={14} />
              {file ? file.name : 'اختر ملف...'}
              <input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={e => setFile(e.target.files[0] || null)} />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={add} disabled={saving}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">إلغاء</button>
          </div>
        </div>
      )}

      {filtered.map(qr => (
        <div key={qr.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0 text-sm">
            {qr.file_type === 'image' ? '🖼️' : qr.file_type === 'video' ? '🎥' : qr.file_type === 'audio' ? '🎵' : qr.file_url ? '📎' : '💬'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-fg font-medium">/{qr.name}</p>
            {qr.text && <p className="text-xs text-fg-muted truncate">{qr.text}</p>}
          </div>
          <button onClick={() => remove(qr.id)} className="text-fg-muted hover:text-danger flex-shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {filtered.length === 0 && (
        <p className="text-center text-fg-subtle text-sm py-8">لا توجد ردود سريعة بعد</p>
      )}
    </div>
  )
}

// ─── Round Robin Tab ──────────────────────────────────────
const DISTRIBUTION_MODES = [
  { key: 'least_busy', label: 'الأقل محادثات', desc: 'كل محادثة جديدة تروح للموظف اللي عنده أقل عدد محادثات مفتوحة حالياً.' },
  { key: 'round_robin', label: 'بالتبادل (دوري)', desc: 'المحادثات بتتوزع بالدور على الموظفين المتاحين واحد واحد، وبعد ما يوصل لآخر واحد يرجع من الأول.' },
]

function RoundRobinTab() {
  const [mode, setMode] = useState('least_busy')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('app_settings').select('distribution_mode').eq('id', true).maybeSingle()
    if (data) setMode(data.distribution_mode)
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('app_settings').update({ distribution_mode: mode }).eq('id', true)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">إعدادات التوزيع التلقائي</h2>

      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <label className="block text-xs text-fg-muted mb-1">طريقة التوزيع</label>
        {DISTRIBUTION_MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`w-full text-right p-3 rounded-xl border transition-colors ${mode === m.key ? 'border-brand bg-brand/10' : 'border-surface-3 bg-surface-3'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${mode === m.key ? 'border-brand bg-brand' : 'border-fg-subtle'}`} />
              <span className="text-sm text-fg font-medium">{m.label}</span>
            </div>
            <p className="text-xs text-fg-subtle mt-1 mr-5.5">{m.desc}</p>
          </button>
        ))}

        <div className="bg-surface-3 rounded-xl p-3 space-y-1.5 text-xs text-fg-muted">
          <p className="font-medium text-fg-muted mb-2">آلية التوزيع الكاملة:</p>
          <p>١. عند وصول محادثة جديدة، يتم تحديد الموظفين المتصلين (Online) اللي حالتهم مش "مشغول".</p>
          <p>٢. استبعاد اللي وصلوا للحد الأقصى (لو عندهم حد محدد).</p>
          <p>٣. التعيين حسب الطريقة المختارة فوق.</p>
          <p>٤. لو كل الموظفين ممتلئين، المحادثة تفضل غير معينة مؤقتاً.</p>
          <p>٥. أول ما موظف يتاح (يفتح شات أو يرجع Online)، المحادثات المستنية بتتوزع عليه تلقائياً.</p>
        </div>

        <button onClick={save} disabled={saving}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
          {saved ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  )
}

// ─── Danger Zone ────────────────────────────────────────────
const WIPE_CONFIRM_PHRASE = 'امسح كل شيء'

function DangerZoneTab() {
  const toast = useToast()
  const [confirmText, setConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [done, setDone] = useState(false)

  const wipeAllData = async () => {
    if (confirmText !== WIPE_CONFIRM_PHRASE) return
    setWiping(true)
    try {
      // بالترتيب الصح عشان مانصطدمش بقيود الـ foreign key
      await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('conversation_reads').delete().neq('conversation_id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('conversation_assignment_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('conversation_activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('contact_tags').delete().neq('contact_id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('contact_custom_fields').delete().neq('contact_id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      setDone(true)
      setConfirmText('')
      toast.success('اتمسحت كل بيانات المحادثات والعملاء')
    } catch (err) {
      toast.error('حصل خطأ أثناء المسح: ' + err.message)
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">منطقة خطرة</h2>

      <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">مسح كل بيانات المحادثات والعملاء</p>
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">
              الإجراء ده هيمسح نهائياً كل المحادثات والرسايل والعملاء والتاجات المرتبطة بيهم — من غير رجوع.
              الموظفين وإعدادات النظام (التوزيع، الـ Lifecycle، الحقول، الردود السريعة) مش هتتأثر.
              استخدمه بس لو عايز تبدأ تتبّع المحادثات من الصفر.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-muted mb-1">
            اكتب "<b>{WIPE_CONFIRM_PHRASE}</b>" عشان تفعّل الزرار
          </label>
          <input value={confirmText} onChange={e => { setConfirmText(e.target.value); setDone(false) }}
            placeholder={WIPE_CONFIRM_PHRASE}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-danger" />
        </div>

        <button onClick={wipeAllData} disabled={confirmText !== WIPE_CONFIRM_PHRASE || wiping}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {wiping ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : done ? '✓ اتمسحت البيانات' : (
            <><Trash2 size={15} /> امسح كل بيانات المحادثات والعملاء نهائياً</>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────
function InputField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs text-fg-muted mb-1">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  )
}

function Toggle({ label, sublabel, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-fg">{label}</p>
        {sublabel && <p className="text-xs text-fg-muted mt-0.5">{sublabel}</p>}
      </div>
      <button onClick={() => onChange(!value)} className={`transition-colors ${value ? 'text-brand' : 'text-fg-subtle'}`}>
        {value ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  )
}
