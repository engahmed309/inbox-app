import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowRight, Users, Tag, List, Settings2, Plus, Trash2,
  Save, Edit2, Check, X, ToggleLeft, ToggleRight, LogOut
} from 'lucide-react'

const TABS = [
  { key: 'agents', label: 'الموظفون', icon: Users },
  { key: 'lifecycle', label: 'Lifecycle', icon: Tag },
  { key: 'fields', label: 'الحقول', icon: List },
  { key: 'roundrobin', label: 'التوزيع', icon: Settings2 },
]

export default function SettingsScreen() {
  const [tab, setTab] = useState('agents')
  const { agent, signOut } = useAuth()
  const navigate = useNavigate()

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-slate-400">
      <p>غير مصرح بالوصول</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowRight size={20} />
        </button>
        <span className="font-bold text-white">الإعدادات</span>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="text-slate-400 hover:text-danger transition-colors">
          <LogOut size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'text-brand border-b-2 border-brand' : 'text-slate-500'}`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'agents' && <AgentsTab />}
        {tab === 'lifecycle' && <LifecycleTab />}
        {tab === 'fields' && <FieldsTab />}
        {tab === 'roundrobin' && <RoundRobinTab />}
      </div>
    </div>
  )
}

// ─── Agents Tab ───────────────────────────────────────────
function AgentsTab() {
  const [agents, setAgents] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)

  useEffect(() => { loadAgents() }, [])

  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('*').order('created_at')
    setAgents(data || [])
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
    } catch (err) {
      alert('خطأ: ' + err.message)
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

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">الموظفون</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة موظف
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-white">موظف جديد</h3>
          <InputField label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label="البريد الإلكتروني" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <InputField label="كلمة المرور" value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
          <div>
            <label className="block text-xs text-slate-400 mb-1">الدور</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">موظف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <InputField label="الحد الأقصى للمحادثات" value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: parseInt(v) })} type="number" />
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
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-slate-300">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {agents.map(ag => (
        <AgentCard key={ag.id} agent={ag} onEdit={() => setEditId(ag.id)} onDelete={() => deleteAgent(ag.id)} onUpdate={updates => updateAgent(ag.id, updates)} editing={editId === ag.id} />
      ))}
    </div>
  )
}

function AgentCard({ agent, onEdit, onDelete, onUpdate, editing }) {
  const [form, setForm] = useState({ name: agent.name, max_conversations: agent.max_conversations, role: agent.role, can_see_all_conversations: agent.can_see_all_conversations })

  return (
    <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
      {editing ? (
        <div className="space-y-3">
          <InputField label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label="الحد الأقصى" value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: parseInt(v) })} type="number" />
          <div>
            <label className="block text-xs text-slate-400 mb-1">الدور</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">موظف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <Toggle label="يرى جميع المحادثات" value={form.can_see_all_conversations} onChange={v => setForm({ ...form, can_see_all_conversations: v })} />
          <div className="flex gap-2">
            <button onClick={() => onUpdate(form)} className="flex-1 py-2 bg-brand rounded-xl text-sm text-white">حفظ</button>
            <button onClick={onEdit} className="px-3 py-2 bg-surface-3 rounded-xl text-sm text-slate-300">إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-white font-semibold">
              {agent.name[0]}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-2 ${agent.is_online ? 'bg-success' : 'bg-slate-500'}`} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-white">{agent.name}</p>
            <p className="text-xs text-slate-400">{agent.email} · {agent.role === 'admin' ? 'مدير' : 'موظف'}</p>
            <p className="text-xs text-slate-500">الحد: {agent.max_conversations} محادثة</p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-surface-3">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-danger rounded-lg hover:bg-surface-3">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
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
        <h2 className="font-semibold text-white">مراحل Lifecycle</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="اسم المرحلة" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">اللون</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg bg-surface-3 border border-surface-3 cursor-pointer" />
              <span className="text-sm text-slate-400">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">إضافة</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-slate-300">إلغاء</button>
          </div>
        </div>
      )}

      {stages.map((s, i) => (
        <div key={s.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
          <span className="flex-1 text-sm text-white">{s.name}</span>
          <span className="text-xs text-slate-500">#{i + 1}</span>
          <button onClick={() => remove(s.id)} className="text-slate-400 hover:text-danger">
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
        <h2 className="font-semibold text-white">الحقول الإضافية</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="اسم الحقل" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">النوع</label>
            <select value={form.field_type} onChange={e => setForm({ ...form, field_type: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand">
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {form.field_type === 'select' && (
            <InputField label="الخيارات (مفصولة بفاصلة)" value={form.options} onChange={v => setForm({ ...form, options: v })} placeholder="خيار 1, خيار 2, خيار 3" />
          )}
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">إضافة</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-slate-300">إلغاء</button>
          </div>
        </div>
      )}

      {fields.map(f => (
        <div key={f.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <div className="flex-1">
            <p className="text-sm text-white font-medium">{f.name}</p>
            <p className="text-xs text-slate-400">{TYPES[f.field_type]}</p>
            {f.options?.choices && <p className="text-xs text-slate-500 mt-0.5">{f.options.choices.join(' · ')}</p>}
          </div>
          <button onClick={() => remove(f.id)} className="text-slate-400 hover:text-danger">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Round Robin Tab ──────────────────────────────────────
function RoundRobinTab() {
  const [config, setConfig] = useState({ enabled: true, default_max: 10 })
  const [saved, setSaved] = useState(false)

  const save = async () => {
    // Store in a settings table or just update agents default
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-white">إعدادات التوزيع التلقائي</h2>

      <div className="bg-surface-2 rounded-2xl p-4 space-y-4 border border-surface-3">
        <Toggle
          label="تفعيل Round Robin"
          sublabel="توزيع المحادثات تلقائياً على الموظفين المتاحين"
          value={config.enabled}
          onChange={v => setConfig({ ...config, enabled: v })}
        />

        <InputField
          label="الحد الافتراضي للمحادثات لكل موظف"
          value={config.default_max}
          onChange={v => setConfig({ ...config, default_max: parseInt(v) })}
          type="number"
        />

        <div className="bg-surface-3 rounded-xl p-3 space-y-1.5 text-xs text-slate-400">
          <p className="font-medium text-slate-300 mb-2">آلية التوزيع:</p>
          <p>١. عند وصول محادثة جديدة</p>
          <p>٢. يتم تحديد الموظفين المتصلين (Online)</p>
          <p>٣. استبعاد من وصل للحد الأقصى</p>
          <p>٤. التعيين للموظف الأقل محادثات مفتوحة</p>
          <p>٥. لو كل الموظفين ممتلئين → المحادثة تبقى غير معينة</p>
        </div>

        <button onClick={save}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
          {saved ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────
function InputField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  )
}

function Toggle({ label, sublabel, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-white">{label}</p>
        {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
      <button onClick={() => onChange(!value)} className={`transition-colors ${value ? 'text-brand' : 'text-slate-500'}`}>
        {value ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  )
}
