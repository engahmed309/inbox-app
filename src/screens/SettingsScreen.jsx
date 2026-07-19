import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL, FB_APP_ID, WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, INSTAGRAM_APP_ID, FACEBOOK_LOGIN_CONFIG_ID } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  ArrowRight, Users, Tag, List, Settings2, Plus, Trash2,
  Save, Edit2, Check, X, ToggleLeft, ToggleRight, LogOut,
  MessageSquareText, Search, Paperclip, Facebook, Instagram, AlertTriangle, KeyRound,
  Radio, Phone, UserCog, ChevronUp, ChevronDown, Bot, BookOpen, Link2, FileText, RefreshCw
} from 'lucide-react'

const TABS = [
  { key: 'agents', label: 'الموظفون', icon: Users },
  { key: 'channels', label: 'القنوات', icon: Radio },
  { key: 'lifecycle', label: 'Lifecycle', icon: Tag },
  { key: 'tags', label: 'التاجات', icon: Tag },
  { key: 'fields', label: 'الحقول', icon: List },
  { key: 'quickreplies', label: 'الردود السريعة', icon: MessageSquareText },
  { key: 'roundrobin', label: 'التوزيع', icon: Settings2 },
  { key: 'ai', label: 'AI Agent', icon: Bot },
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
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'lifecycle' && <LifecycleTab />}
        {tab === 'tags' && <TagsTab />}
        {tab === 'fields' && <FieldsTab />}
        {tab === 'quickreplies' && <QuickRepliesTab agent={agent} />}
        {tab === 'roundrobin' && <RoundRobinTab />}
        {tab === 'ai' && <AiAgentTab />}
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
  const [addMode, setAddMode] = useState('closed') // 'closed' | 'choice' | 'manual' | 'invite'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null) // { agent, convCount }
  const [reassignMode, setReassignMode] = useState('specific') // 'specific' | 'all' | 'online'
  const [reassignToId, setReassignToId] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [aiAgentRow, setAiAgentRow] = useState(null)
  const [aiCounts, setAiCounts] = useState({ open: 0, follow_up: 0, closed: 0 })
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiLifecycleBreakdown, setAiLifecycleBreakdown] = useState([]) // [{ stage, count }]

  useEffect(() => { loadAgents(); loadCounts(); loadAiExtra() }, [])

  const loadAgents = async () => {
    const { data } = await supabase.from('agents').select('*').order('created_at')
    setAgents((data || []).filter(a => a.role !== 'ai'))
    setAiAgentRow((data || []).find(a => a.role === 'ai') || null)
  }

  const loadCounts = async () => {
    const { data } = await supabase.from('conversations').select('assigned_agent_id, status, ai_active')
    const map = {}
    const t = { open: 0, follow_up: 0, closed: 0 }
    const ai = { open: 0, follow_up: 0, closed: 0 }
    data?.forEach(c => {
      if (c.ai_active && ai[c.status] !== undefined) ai[c.status]++
      if (!c.assigned_agent_id) return
      if (!map[c.assigned_agent_id]) map[c.assigned_agent_id] = { open: 0, follow_up: 0, closed: 0 }
      if (map[c.assigned_agent_id][c.status] !== undefined) map[c.assigned_agent_id][c.status]++
      if (t[c.status] !== undefined) t[c.status]++
    })
    setCounts(map)
    setTotals(t)
    setAiCounts(ai)
  }

  // حالة تفعيل الـ AI + توزيع lifecycle للعملاء اللي الـ AI شغال معاهم دلوقتي
  const loadAiExtra = async () => {
    const { data: settings } = await supabase.from('ai_settings').select('enabled').limit(1).maybeSingle()
    setAiEnabled(!!settings?.enabled)

    const { data: stages } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    const { data: aiConvs } = await supabase
      .from('conversations').select('contacts(lifecycle_stage_id)').eq('ai_active', true)
    const stageCounts = {}
    aiConvs?.forEach(c => {
      const sid = c.contacts?.lifecycle_stage_id
      if (!sid) return
      stageCounts[sid] = (stageCounts[sid] || 0) + 1
    })
    const breakdown = (stages || [])
      .map(s => ({ stage: s, count: stageCounts[s.id] || 0 }))
      .filter(row => row.count > 0)
    setAiLifecycleBreakdown(breakdown)
  }

  const addAgent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/create-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error(await res.text())
      setAddMode('closed')
      setForm({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
      loadAgents()
      toast.success('اتضاف الموظف بنجاح')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const inviteAgent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/invite-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm)
      })
      if (!res.ok) throw new Error(await res.text())
      setAddMode('closed')
      setInviteForm({ name: '', email: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
      loadAgents()
      toast.success('اتبعتت دعوة على إيميل الموظف')
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

  // بنحذف عن طريق السيرفر مش سوبابيز مباشرة، عشان يمسح حساب الأوث بتاع الموظف كمان (auth_id) —
  // لو مسحناه من جدول agents بس، إيميله فضل محجوز في نظام الدخول ولو حاولت تضيفه تاني (يدوي أو
  // بدعوة) هيرفض بـ "already been registered" حتى لو مش ظاهر في قايمة الموظفين خالص
  const deleteAgentFully = async (id) => {
    const res = await fetch(`${API_URL}/admin/agent/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'فشل حذف الموظف')
    }
  }

  const confirmDeleteAgent = async (ag) => {
    const { data: convs } = await supabase
      .from('conversations').select('id').eq('assigned_agent_id', ag.id).in('status', ['open', 'follow_up'])
    const convCount = convs?.length || 0
    if (convCount === 0) {
      if (!confirm('حذف الموظف؟')) return
      try {
        await deleteAgentFully(ag.id)
        loadAgents()
      } catch (err) {
        toast.error('خطأ: ' + err.message)
      }
      return
    }
    setDeleteTarget({ agent: ag, convCount })
    setReassignMode('specific')
    setReassignToId('')
  }

  const finalizeDeleteWithReassign = async () => {
    if (!deleteTarget) return
    setReassigning(true)
    try {
      const { data: convs } = await supabase
        .from('conversations').select('id').eq('assigned_agent_id', deleteTarget.agent.id).in('status', ['open', 'follow_up'])
      const convIds = (convs || []).map(c => c.id)

      let assignments = [] // [{ convId, agentId }]
      if (reassignMode === 'specific') {
        if (!reassignToId) { toast.error('اختار الموظف اللي هتحول له المحادثات'); setReassigning(false); return }
        assignments = convIds.map(id => ({ convId: id, agentId: reassignToId }))
      } else {
        const pool = agents.filter(a => a.id !== deleteTarget.agent.id && (reassignMode === 'all' || a.status === 'online'))
        if (pool.length === 0) { toast.error('مفيش موظفين تانيين متاحين للتوزيع'); setReassigning(false); return }
        assignments = convIds.map((id, i) => ({ convId: id, agentId: pool[i % pool.length].id }))
      }

      for (const a of assignments) {
        await supabase.from('conversations').update({ assigned_agent_id: a.agentId }).eq('id', a.convId)
        await supabase.from('conversation_assignment_log').insert({ conversation_id: a.convId, assigned_to: a.agentId, assigned_by: null })
      }

      await deleteAgentFully(deleteTarget.agent.id)
      toast.success(`اتحذف الموظف واتوزعت محادثاته على ${new Set(assignments.map(a => a.agentId)).size} موظف`)
      setDeleteTarget(null)
      loadAgents()
      loadCounts()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setReassigning(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">الموظفون</h2>
        <button onClick={() => setAddMode(addMode === 'closed' ? 'choice' : 'closed')}
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

      {addMode === 'choice' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-2 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg mb-1">إزاي عايز تضيف الموظف؟</h3>
          <button onClick={() => setAddMode('manual')}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-3 hover:bg-surface-3/70 text-right transition-colors">
            <UserCog size={18} className="text-brand flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">إضافة يدوي</p>
              <p className="text-xs text-fg-subtle">تحدد الاسم والإيميل والباسورد بنفسك</p>
            </div>
          </button>
          <button onClick={() => setAddMode('invite')}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-3 hover:bg-surface-3/70 text-right transition-colors">
            <MessageSquareText size={18} className="text-brand flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">دعوة عبر الإيميل</p>
              <p className="text-xs text-fg-subtle">هيوصله إيميل يحط منه الباسورد بنفسه</p>
            </div>
          </button>
          <button onClick={() => setAddMode('closed')} className="w-full py-2 text-xs text-fg-muted">إلغاء</button>
        </div>
      )}

      {addMode === 'manual' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg">إضافة موظف يدوي</h3>
          <p className="text-xs text-fg-subtle -mt-2">حدد إيميل وباسورد للموظف، وهيقدر يدخل بيهم على طول.</p>
          <InputField label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label="البريد الإلكتروني" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <InputField label="الباسورد" value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
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
              {loading ? 'جاري الإضافة...' : 'إضافة الموظف'}
            </button>
            <button onClick={() => setAddMode('closed')}
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {addMode === 'invite' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg">دعوة موظف عبر الإيميل</h3>
          <p className="text-xs text-fg-subtle -mt-2">هيوصله إيميل فيه رابط، يدخل عليه ويحط باسورد لنفسه.</p>
          <InputField label="الاسم" value={inviteForm.name} onChange={v => setInviteForm({ ...inviteForm, name: v })} />
          <InputField label="البريد الإلكتروني" value={inviteForm.email} onChange={v => setInviteForm({ ...inviteForm, email: v })} type="email" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">الدور</label>
            <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">موظف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <MaxConversationsField value={inviteForm.max_conversations} onChange={v => setInviteForm({ ...inviteForm, max_conversations: v })} />
          <Toggle
            label="يرى جميع المحادثات"
            value={inviteForm.can_see_all_conversations}
            onChange={v => setInviteForm({ ...inviteForm, can_see_all_conversations: v })}
          />
          <div className="flex gap-2 pt-1">
            <button onClick={inviteAgent} disabled={loading}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {loading ? 'جاري الإرسال...' : 'ابعت الدعوة'}
            </button>
            <button onClick={() => setAddMode('closed')}
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {aiAgentRow && (
        <div className="bg-surface-2 rounded-2xl p-4 border border-brand/30">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center">
                <Bot size={18} className="text-brand" />
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-2 ${aiEnabled ? 'bg-success' : 'bg-slate-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-fg">{aiAgentRow.name}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${aiEnabled ? 'bg-success/15 text-success' : 'bg-surface-3 text-fg-subtle'}`}>
                  {aiEnabled ? 'مفعّل' : 'متوقف'}
                </span>
              </div>
              <p className="text-xs text-fg-muted">بيرد تلقائي على المحادثات الجديدة — تحكّم فيه من تاب "AI Agent"</p>
            </div>
          </div>
          <div className="flex gap-3 mt-3 pt-3 border-t border-surface-3">
            <span className="text-[11px] text-success">مفتوحة: {aiCounts.open}</span>
            <span className="text-[11px] text-follow">متابعة: {aiCounts.follow_up}</span>
            <span className="text-[11px] text-fg-subtle">مغلقة: {aiCounts.closed}</span>
          </div>
          {aiLifecycleBreakdown.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-surface-3">
              {aiLifecycleBreakdown.map(({ stage, count }) => (
                <span key={stage.id} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-surface-3 text-fg-muted">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                  {stage.icon && `${stage.icon} `}{stage.name}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {agents.map(ag => (
        <AgentCard key={ag.id} agent={ag} counts={counts[ag.id]}
          onEdit={() => setEditId(ag.id)} onDelete={() => confirmDeleteAgent(ag)}
          onUpdate={updates => updateAgent(ag.id, updates)}
          editing={editId === ag.id} />
      ))}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !reassigning && setDeleteTarget(null)}>
          <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3.5 border-b border-surface-3">
              <span className="font-semibold text-fg text-sm">حذف {deleteTarget.agent.name}</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-fg-muted">
                الموظف ده معاه <b className="text-fg">{deleteTarget.convCount}</b> محادثة مفتوحة/متابعة. اختار هتروح فين قبل الحذف:
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'specific'} onChange={() => setReassignMode('specific')} />
                  <span className="text-sm text-fg">حولهم كلهم لموظف معين</span>
                </label>
                {reassignMode === 'specific' && (
                  <div className="pr-6">
                    <select value={reassignToId} onChange={e => setReassignToId(e.target.value)}
                      className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
                      <option value="">— اختار موظف —</option>
                      {agents.filter(a => a.id !== deleteTarget.agent.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'all'} onChange={() => setReassignMode('all')} />
                  <span className="text-sm text-fg">وزعهم بالتساوي على كل الموظفين (أونلاين أو أوفلاين)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'online'} onChange={() => setReassignMode('online')} />
                  <span className="text-sm text-fg">وزعهم على الموظفين الأونلاين بس</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setDeleteTarget(null)} disabled={reassigning}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={finalizeDeleteWithReassign} disabled={reassigning}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:brightness-110 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reassigning ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'وزّع واحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
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

function AgentCard({ agent, counts, onEdit, onDelete, onUpdate, editing }) {
  const [form, setForm] = useState({ name: agent.name, max_conversations: agent.max_conversations, role: agent.role, can_see_all_conversations: agent.can_see_all_conversations })
  const c = counts || { open: 0, follow_up: 0, closed: 0 }
  const toast = useToast()

  // مؤقتاً: بديل لجوجل — عشان مراجع ميتا يقدر يدخل بإيميل وباسورد عادي
  const resetPassword = async () => {
    const password = prompt(`باسورد جديد لـ ${agent.name} (٦ حروف على الأقل):`)
    if (!password) return
    try {
      const res = await fetch(`${API_URL}/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, password })
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('اتغير الباسورد بنجاح')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    }
  }

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
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-fg">{agent.name}</p>
                {!agent.last_seen_at && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-follow/15 text-follow">لسه ما دخلش</span>
                )}
              </div>
              <p className="text-xs text-fg-muted">{agent.email} · {agent.role === 'admin' ? 'مدير' : 'موظف'}</p>
              <p className="text-xs text-fg-subtle">الحد: {agent.max_conversations == null ? 'غير محدود' : `${agent.max_conversations} محادثة`}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={resetPassword} title="تحديد باسورد للدخول المؤقت" className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
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

// ─── Channels Tab ──────────────────────────────────────────
const PLATFORM_META = {
  facebook: { label: 'فيسبوك', icon: Facebook, color: 'text-blue-400' },
  instagram: { label: 'إنستجرام', icon: Instagram, color: 'text-pink-400' },
  whatsapp: { label: 'واتساب', icon: Phone, color: 'text-green-400' },
}

function ChannelsTab() {
  const [subTab, setSubTab] = useState('connected')

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-fg">القنوات</h2>

      <div className="flex gap-4 border-b border-surface-3">
        <button onClick={() => setSubTab('connected')}
          className={`px-1 pb-2.5 text-sm font-medium transition-colors ${subTab === 'connected' ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
          القنوات المرتبطة
        </button>
        <button onClick={() => setSubTab('connect')}
          className={`px-1 pb-2.5 text-sm font-medium transition-colors ${subTab === 'connect' ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
          ربط قناة جديدة
        </button>
      </div>

      {subTab === 'connected' ? <ConnectedChannelsList /> : <ConnectNewChannel />}
    </div>
  )
}

function ConnectedChannelsList() {
  const toast = useToast()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState(null)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/channels`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تحميل القنوات')
      setChannels(data.channels || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const disconnectChannel = async (ch) => {
    if (!confirm(`فصل ${ch.custom_name || ch.display_name || PLATFORM_META[ch.platform].label}؟ هتقدر تربطها تاني من تاب "ربط قناة جديدة".`)) return
    setDeletingId(ch.id)
    try {
      const res = await fetch(`${API_URL}/channels/${ch.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الفصل')
      toast.success('اتفصلت القناة')
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const startEdit = (ch) => {
    setEditingId(ch.id)
    setEditValue(ch.custom_name || '')
  }
  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  const saveEdit = async (ch) => {
    setSavingId(ch.id)
    try {
      const res = await fetch(`${API_URL}/channels/${ch.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_name: editValue.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التسمية')
      toast.success('اتسمّت القناة')
      setEditingId(null)
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error) return (
    <div className="pt-3 space-y-2">
      <p className="text-sm text-danger">{error}</p>
      <button onClick={load} className="text-xs text-brand">إعادة المحاولة</button>
    </div>
  )

  return (
    <div className="space-y-3 pt-1">
      {['facebook', 'instagram', 'whatsapp'].map(platform => {
        const meta = PLATFORM_META[platform]
        const Icon = meta.icon
        // فيسبوك وانستجرام لسه رقم واحد بس، بس الواتساب ممكن يكون فيه أكتر من رقم مربوط
        const rows = channels.filter(c => c.platform === platform)
        const list = rows.length > 0 ? rows : [null]
        return list.map((ch, i) => (
          <div key={ch?.id || `${platform}-${i}`} className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            <div className="flex items-center gap-3">
              {ch?.avatar_url ? (
                <img src={ch.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover bg-surface-3"
                  onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
                  <Icon size={18} className={meta.color} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {editingId === ch?.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(ch); if (e.key === 'Escape') cancelEdit() }}
                      placeholder={meta.label}
                      className="min-w-0 flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button onClick={() => saveEdit(ch)} disabled={savingId === ch.id}
                      className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-success hover:bg-success/10 rounded-lg disabled:opacity-50">
                      {savingId === ch.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-success border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check size={15} />
                      )}
                    </button>
                    <button onClick={cancelEdit}
                      className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-fg-subtle hover:bg-surface-3 rounded-lg">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-fg font-semibold flex items-center gap-1.5">
                    <Icon size={12} className={meta.color} /> {ch?.custom_name || meta.label}
                  </p>
                )}
                <p className="text-xs text-fg-muted truncate">{ch?.display_name || 'مش مربوطة'}</p>
                {ch?.waba_id && (
                  <p className="text-[11px] text-fg-subtle truncate mt-0.5">WABA ID: {ch.waba_id}</p>
                )}
              </div>
              {editingId !== ch?.id && (
                <>
                  {ch?.status === 'active' ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-success/15 text-success flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" /> نشطة
                    </span>
                  ) : ch?.status === 'disconnected' ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-surface-3 text-fg-subtle flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle" /> مفصولة
                    </span>
                  ) : ch ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-danger/15 text-danger flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger" /> محتاجة إعادة ربط
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">
                      مش مربوطة
                    </span>
                  )}
                  {ch?.id && (
                    <>
                      <button onClick={() => startEdit(ch)} title="سمّي القناة"
                        className="w-7 h-7 flex items-center justify-center text-fg-subtle hover:text-fg rounded-lg hover:bg-surface-3 flex-shrink-0">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => disconnectChannel(ch)} disabled={deletingId === ch.id}
                        title="فصل القناة"
                        className="w-7 h-7 flex items-center justify-center text-fg-subtle hover:text-danger rounded-lg hover:bg-danger/10 flex-shrink-0 disabled:opacity-50">
                        {deletingId === ch.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {ch?.status_reason && (
              <p className="text-xs text-danger mt-2 bg-danger/5 rounded-lg px-2.5 py-1.5">{ch.status_reason}</p>
            )}
          </div>
        ))
      })}
    </div>
  )
}

// بنحمّل الـ SDK بتاع فيسبوك مرة واحدة بس، أول ما حد يحتاجه فعلاً
let fbSdkPromise = null
function loadFacebookSDK() {
  if (fbSdkPromise) return fbSdkPromise
  fbSdkPromise = new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: FB_APP_ID, xfbml: false, version: 'v21.0' })
      resolve(window.FB)
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('فشل تحميل SDK بتاع فيسبوك'))
    document.body.appendChild(script)
  })
  return fbSdkPromise
}

function ConnectNewChannel() {
  const toast = useToast()
  const { agent } = useAuth()
  const [connecting, setConnecting] = useState(null)

  const connectWhatsApp = async () => {
    if (!WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) {
      toast.error('محتاجين نضيف WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID في إعدادات السيرفر الأول')
      return
    }
    setConnecting('whatsapp')

    let sessionInfo = null
    const handleMessage = (event) => {
      if (!event.origin?.includes('facebook.com')) return
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
          sessionInfo = data.data
        }
      } catch { /* رسايل تانية مش بتاعتنا */ }
    }
    window.addEventListener('message', handleMessage)

    try {
      const FB = await loadFacebookSDK()
      FB.login((response) => {
        window.removeEventListener('message', handleMessage)
        if (response.authResponse?.code && sessionInfo?.phone_number_id && sessionInfo?.waba_id) {
          finishWhatsAppConnect(response.authResponse.code, sessionInfo)
        } else {
          toast.error('اتلغى الربط أو حصل خطأ من فيسبوك')
          setConnecting(null)
        }
      }, {
        config_id: WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
      })
    } catch (err) {
      window.removeEventListener('message', handleMessage)
      toast.error(err.message)
      setConnecting(null)
    }
  }

  const connectFacebook = async () => {
    if (!FACEBOOK_LOGIN_CONFIG_ID) {
      toast.error('محتاجين نضيف FACEBOOK_LOGIN_CONFIG_ID الأول')
      return
    }
    setConnecting('facebook')
    try {
      const FB = await loadFacebookSDK()
      // بنسيب response_type الافتراضي (توكن مباشر) بدل ما نطلب code — تبديل الـ code بتوكن
      // سيرفر-سايد كان بيفشل باستمرار بسبب الـ redirect_uri الداخلي بتاع حوار فيسبوك JS SDK
      FB.login((response) => {
        if (response.authResponse?.accessToken) {
          finishFacebookConnect(response.authResponse.accessToken)
        } else {
          toast.error('اتلغى الربط أو حصل خطأ من فيسبوك')
          setConnecting(null)
        }
      }, { config_id: FACEBOOK_LOGIN_CONFIG_ID })
    } catch (err) {
      toast.error(err.message)
      setConnecting(null)
    }
  }

  const finishFacebookConnect = async (userAccessToken) => {
    try {
      const res = await fetch(`${API_URL}/channels/facebook/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_access_token: userAccessToken, agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل ربط الصفحة')
      toast.success(`اترابطت ${data.channels?.length || 1} صفحة فيسبوك بنجاح`)
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setConnecting(null)
    }
  }

  const connectInstagram = () => {
    if (!INSTAGRAM_APP_ID) {
      toast.error('محتاجين نضيف INSTAGRAM_APP_ID في إعدادات السيرفر الأول')
      return
    }
    // ده فلو full-page redirect (مش نافذة منبثقة زي الواتساب)، فبنسجّل علامة في sessionStorage
    // عشان لما نرجع من انستجرام نعرف نستنى ونعالج الـ code، ونحول المتصفح كامل
    sessionStorage.setItem('ig_connect_pending', '1')
    // لازم يطابق حرفيًا اللي مسجل في "Redirect URL" عند ميتا — وميتا بتحط "/" في الآخر أوتوماتيك
    // مهما كتبت، فبنضيفها إحنا كمان هنا عشان تفضل مطابقة لنفس القيمة اللي السيرفر هيبعتها
    const redirectUri = window.location.origin + '/'
    const scope = 'instagram_business_basic,instagram_business_manage_messages'
    window.location.href = `https://www.instagram.com/oauth/authorize?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`
  }

  const finishWhatsAppConnect = async (code, sessionInfo) => {
    try {
      const res = await fetch(`${API_URL}/channels/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, waba_id: sessionInfo.waba_id, phone_number_id: sessionInfo.phone_number_id,
          agent_id: agent?.id
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل ربط الرقم')
      toast.success('اترابط رقم الواتساب بنجاح')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs text-fg-subtle -mt-1">اختار القناة اللي عايز تربطها. هتتحول لصفحة ميتا تختار منها الصفحة أو الحساب وتوافق على الصلاحيات.</p>
      {['facebook', 'instagram', 'whatsapp'].map(platform => {
        const meta = PLATFORM_META[platform]
        const Icon = meta.icon
        const isReady = platform === 'whatsapp' || platform === 'instagram' || platform === 'facebook'
        const isConnecting = connecting === platform
        const handlers = { whatsapp: connectWhatsApp, instagram: connectInstagram, facebook: connectFacebook }
        return (
          <button key={platform}
            disabled={!isReady || isConnecting}
            onClick={isReady ? handlers[platform] : undefined}
            className={`w-full flex items-center gap-3 bg-surface-2 rounded-2xl p-4 border border-surface-3 transition-colors ${!isReady ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-3'}`}>
            <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
              <Icon size={16} className={meta.color} />
            </div>
            <span className="flex-1 text-right text-sm text-fg font-medium">ربط {meta.label}</span>
            {isReady ? (
              isConnecting && <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin flex-shrink-0" />
            ) : (
              <span className="text-[11px] text-fg-subtle flex-shrink-0">قريباً</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Lifecycle Tab ────────────────────────────────────────
function LifecycleTab() {
  const [stages, setStages] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#3B82F6', icon: '' })
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')

  useEffect(() => { loadStages() }, [])
  const loadStages = async () => {
    const { data } = await supabase.from('lifecycle_stages').select('*').order('stage_order')
    setStages(data || [])
  }

  const add = async () => {
    await supabase.from('lifecycle_stages').insert({ ...form, icon: form.icon.trim() || null, stage_order: stages.length })
    setForm({ name: '', color: '#3B82F6', icon: '' })
    setShowAdd(false)
    loadStages()
  }

  const remove = async (id) => {
    if (!confirm('حذف المرحلة؟')) return
    await supabase.from('lifecycle_stages').delete().eq('id', id)
    loadStages()
  }

  const startEdit = (s) => { setEditingId(s.id); setEditName(s.name); setEditIcon(s.icon || '') }
  const saveEdit = async () => {
    if (!editName.trim()) return
    await supabase.from('lifecycle_stages').update({ name: editName.trim(), icon: editIcon.trim() || null }).eq('id', editingId)
    setEditingId(null)
    loadStages()
  }

  // بيبدّل ترتيب مرحلتين جنب بعض — ده اللي بيحدد الترتيب اللي الموظفين بيشوفوا بيه المراحل في كل مكان
  const move = async (index, direction) => {
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= stages.length) return
    const a = stages[index], b = stages[otherIndex]
    const reordered = [...stages]
    reordered[index] = b; reordered[otherIndex] = a
    setStages(reordered)
    await Promise.all([
      supabase.from('lifecycle_stages').update({ stage_order: otherIndex }).eq('id', a.id),
      supabase.from('lifecycle_stages').update({ stage_order: index }).eq('id', b.id),
    ])
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
          <InputField label="إيموجي (اختياري)" value={form.icon} onChange={v => setForm({ ...form, icon: v })} placeholder="🔥" />
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
          <div className="flex flex-col flex-shrink-0 -my-1">
            <button onClick={() => move(i, -1)} disabled={i === 0}
              className="text-fg-muted hover:text-brand disabled:opacity-25 disabled:hover:text-fg-muted"><ChevronUp size={14} /></button>
            <button onClick={() => move(i, 1)} disabled={i === stages.length - 1}
              className="text-fg-muted hover:text-brand disabled:opacity-25 disabled:hover:text-fg-muted"><ChevronDown size={14} /></button>
          </div>
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
          {editingId === s.id ? (
            <>
              <input value={editIcon} onChange={e => setEditIcon(e.target.value)}
                placeholder="🔥" className="w-10 flex-shrink-0 bg-surface-3 rounded-lg px-2 py-1.5 text-sm text-fg text-center focus:outline-none focus:ring-1 focus:ring-brand" />
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveEdit} className="text-success hover:brightness-110"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-fg">{s.icon && `${s.icon} `}{s.name}</span>
              <span className="text-xs text-fg-subtle">#{i + 1}</span>
              <button onClick={() => startEdit(s)} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
              <button onClick={() => remove(s.id)} className="text-fg-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Tags Tab ────────────────────────────────────────────
// التاجات بتتحط من هنا بس (الأدمن)، وبتظهر بعد كده كقايمة اختيار جوا ملف العميل — الموظفين
// يقدروا يحطوا أي تاج موجود بس، مش يعملوا تاجات جديدة
function TagsTab() {
  const [tags, setTags] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#6366F1' })
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const toast = useToast()

  useEffect(() => { loadTags() }, [])
  const loadTags = async () => {
    const { data } = await supabase.from('tags').select('*').order('name')
    setTags(data || [])
  }

  const add = async () => {
    if (!form.name.trim()) return
    const { error } = await supabase.from('tags').insert({ name: form.name.trim(), color: form.color })
    if (error) { toast.error('التاج ده موجود بالفعل أو حصل خطأ'); return }
    setForm({ name: '', color: '#6366F1' })
    setShowAdd(false)
    loadTags()
  }

  const remove = async (id) => {
    if (!confirm('حذف التاج ده؟ هيتشال من كل العملاء اللي حاططينه.')) return
    await supabase.from('contact_tags').delete().eq('tag_id', id)
    await supabase.from('tags').delete().eq('id', id)
    loadTags()
  }

  const startEdit = (t) => { setEditingId(t.id); setEditName(t.name) }
  const saveEdit = async () => {
    if (!editName.trim()) return
    const { error } = await supabase.from('tags').update({ name: editName.trim() }).eq('id', editingId)
    if (error) { toast.error('التاج ده موجود بالفعل أو حصل خطأ'); return }
    setEditingId(null)
    loadTags()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">التاجات</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> إضافة
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label="اسم التاج" value={form.name} onChange={v => setForm({ ...form, name: v })} />
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

      {tags.map(t => (
        <div key={t.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
          {editingId === t.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveEdit} className="text-success hover:brightness-110"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-fg">{t.name}</span>
              <button onClick={() => startEdit(t)} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
              <button onClick={() => remove(t.id)} className="text-fg-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      ))}
      {tags.length === 0 && !showAdd && (
        <p className="text-center text-fg-subtle text-sm py-6">مفيش تاجات لسه، دوس "إضافة" عشان تعمل واحد</p>
      )}
    </div>
  )
}

// ─── Custom Fields Tab ────────────────────────────────────
function FieldsTab() {
  const [fields, setFields] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', field_type: 'text', options: '' })
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

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

  const startEdit = (f) => { setEditingId(f.id); setEditName(f.name) }
  const saveEdit = async () => {
    if (!editName.trim()) return
    await supabase.from('custom_field_definitions').update({ name: editName.trim() }).eq('id', editingId)
    setEditingId(null)
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
          {editingId === f.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveEdit} className="text-success hover:brightness-110"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </>
          ) : (
            <>
              <div className="flex-1">
                <p className="text-sm text-fg font-medium">{f.name}</p>
                <p className="text-xs text-fg-muted">{TYPES[f.field_type]}</p>
                {f.options?.choices && <p className="text-xs text-fg-subtle mt-0.5">{f.options.choices.join(' · ')}</p>}
              </div>
              <button onClick={() => startEdit(f)} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
              <button onClick={() => remove(f.id)} className="text-fg-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </>
          )}
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
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

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
        // أسماء الملفات اللي فيها مسافات أو حروف عربية أو رموز ممكن سوبابيز يرفض يستخدمها كمسار
        // تخزين صالح، فبنستبدل أي حرف مش إنجليزي/رقم/نقطة بشرطة تحتية عشان الرفع يفضل يشتغل دايمًا
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const path = `quick-replies/${Date.now()}_${safeName}`
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
    } catch (err) {
      console.error(err)
      toast.error('حصل خطأ أثناء الحفظ: ' + (err.message || 'غير معروف'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (qr) => {
    if (!confirm('حذف الرد السريع؟')) return
    // لازم نمسح الملف من التخزين بنفسنا — مسح صف الرد السريع من الداتابيز مش بيمسح الملف
    // المرفوع تلقائي، وكان بيفضل ملف يتيم محتل مساحة تخزين للأبد من غير ما حد يلاحظ
    if (qr.file_url) {
      const path = qr.file_url.split('/inbox-media/')[1]
      if (path) await supabase.storage.from('inbox-media').remove([path])
    }
    await supabase.from('quick_replies').delete().eq('id', qr.id)
    load()
  }

  const startEdit = (qr) => { setEditingId(qr.id); setEditName(qr.name) }
  const saveEdit = async () => {
    if (!editName.trim()) return
    const { error } = await supabase.from('quick_replies').update({ name: editName.trim() }).eq('id', editingId)
    if (error) { toast.error('الاسم ده مستخدم بالفعل أو حصل خطأ'); return }
    setEditingId(null)
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
          {editingId === qr.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveEdit} className="text-success hover:brightness-110 flex-shrink-0"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="text-fg-muted hover:text-fg flex-shrink-0"><X size={16} /></button>
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fg font-medium">/{qr.name}</p>
                {qr.text && <p className="text-xs text-fg-muted truncate">{qr.text}</p>}
              </div>
              <button onClick={() => startEdit(qr)} className="text-fg-muted hover:text-brand flex-shrink-0"><Edit2 size={14} /></button>
              <button onClick={() => remove(qr)} className="text-fg-muted hover:text-danger flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </>
          )}
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
  const [followupEnabled, setFollowupEnabled] = useState(false)
  const [followupMinutes, setFollowupMinutes] = useState(60)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('app_settings').select('distribution_mode, followup_reassign_enabled, followup_reassign_minutes').eq('id', true).maybeSingle()
    if (data) {
      setMode(data.distribution_mode)
      setFollowupEnabled(data.followup_reassign_enabled)
      setFollowupMinutes(data.followup_reassign_minutes || 60)
    }
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('app_settings').update({
      distribution_mode: mode,
      followup_reassign_enabled: followupEnabled,
      followup_reassign_minutes: followupMinutes
    }).eq('id', true)
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

      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <Toggle
          label="أقصى مدة انتظار رد بعد المتابعة"
          sublabel="لما محادثة 'متابعة' يرجع يبعت فيها العميل، تفضل مع نفس الموظف زي العادة. لو مفعّل، وموظف معدّش رد خلال المدة دي، المحادثة تتحول لموظف تاني أونلاين — أو تتشال منه لحد ما حد يدخل لو محدش أونلاين"
          value={followupEnabled}
          onChange={setFollowupEnabled}
        />
        {followupEnabled && (
          <div>
            <label className="block text-xs text-fg-muted mb-1">المدة بالدقايق</label>
            <input type="number" min={1} value={followupMinutes}
              onChange={e => setFollowupMinutes(parseInt(e.target.value) || 1)}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
            <p className="text-[11px] text-fg-subtle mt-1">مثلاً 60 = ساعة. الإعداد ده بيأثر بس على محادثات المتابعة اللي رجعت تتفتح، مش المحادثات المفتوحة العادية.</p>
          </div>
        )}
        <button onClick={save} disabled={saving}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
          {saved ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  )
}

// ─── AI Agent Tab ─────────────────────────────────────────
const AI_MODELS = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — سريع ورخيص (موصى به)' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 — أقوى وأغلى' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
]

function AiAgentTab() {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sources, setSources] = useState([])
  const [showAddSource, setShowAddSource] = useState(false)
  const [sourceForm, setSourceForm] = useState({ type: 'text', title: '', content: '', url: '' })
  const [usage, setUsage] = useState({ tokens: 0, cost: 0, agent: { tokens: 0, cost: 0 }, reports: { tokens: 0, cost: 0 } })
  const [testContact, setTestContact] = useState(null) // { id, name, phone, platform }
  const [testContactQuery, setTestContactQuery] = useState('')
  const [testContactResults, setTestContactResults] = useState([])
  const [searchingContact, setSearchingContact] = useState(false)
  const [channels, setChannels] = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: s }, { data: src }, { data: usageRows }, { data: chans }] = await Promise.all([
      supabase.from('ai_settings').select('*').limit(1).single(),
      supabase.from('ai_knowledge_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_usage_log').select('input_tokens, output_tokens, cost_usd, source')
        .gte('day', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
      supabase.from('channels').select('id, platform, display_name, custom_name, status').order('platform')
    ])
    setSettings(s)
    setSources(src || [])
    setChannels(chans || [])
    const tokens = (usageRows || []).reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)
    const cost = (usageRows || []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
    const bySource = (source) => {
      const rows = (usageRows || []).filter(r => (r.source || 'agent') === source)
      return {
        tokens: rows.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0),
        cost: rows.reduce((sum, r) => sum + Number(r.cost_usd), 0)
      }
    }
    setUsage({ tokens, cost, agent: bySource('agent'), reports: bySource('reports') })
    if (s?.test_contact_id) {
      const { data: c } = await supabase.from('contacts').select('id, name, phone, platform').eq('id', s.test_contact_id).maybeSingle()
      setTestContact(c || null)
    } else {
      setTestContact(null)
    }
    setLoading(false)
  }

  const searchTestContacts = async (q) => {
    setTestContactQuery(q)
    if (!q.trim()) { setTestContactResults([]); return }
    setSearchingContact(true)
    const { data } = await supabase.from('contacts').select('id, name, phone, platform')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8)
    setTestContactResults(data || [])
    setSearchingContact(false)
  }

  const pickTestContact = (c) => {
    setTestContact(c)
    setSettings(prev => ({ ...prev, test_contact_id: c.id }))
    setTestContactQuery('')
    setTestContactResults([])
  }

  const clearTestContact = () => {
    setTestContact(null)
    setSettings(prev => ({ ...prev, test_contact_id: null }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const { id, updated_at, ...updates } = settings
      const { error } = await supabase.from('ai_settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      toast.success('اتحفظت الإعدادات')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const [savingSource, setSavingSource] = useState(false)
  const [refreshingId, setRefreshingId] = useState(null)

  // مصادر النوع "رابط" بتتحمّل وتتحوّل لنص مرة واحدة هنا وقت الإضافة (على السيرفر)، وبعد كده
  // النص المخزّن ده هو اللي بيتحط في تعليمات الـ AI — مش بيعيد قراءة الصفحة في كل رسالة
  const addSource = async () => {
    if (!sourceForm.title.trim()) { toast.error('لازم عنوان للمصدر'); return }
    if (sourceForm.type === 'text' && !sourceForm.content.trim()) { toast.error('لازم تكتب المحتوى'); return }
    if (sourceForm.type === 'link' && !sourceForm.url.trim()) { toast.error('لازم تحط الرابط'); return }
    setSavingSource(true)
    try {
      const res = await fetch(`${API_URL}/ai/knowledge-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إضافة المصدر')
      setSourceForm({ type: 'text', title: '', content: '', url: '' })
      setShowAddSource(false)
      toast.success(sourceForm.type === 'link' ? 'اتحمّلت الصفحة واتحفظ محتواها' : 'اتضاف المصدر')
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setSavingSource(false)
    }
  }

  const refreshSource = async (id) => {
    setRefreshingId(id)
    try {
      const res = await fetch(`${API_URL}/ai/knowledge-sources/${id}/refresh`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تحديث المصدر')
      toast.success('اتحدّث محتوى الصفحة')
      load()
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setRefreshingId(null)
    }
  }

  const removeSource = async (id) => {
    if (!confirm('حذف المصدر ده؟')) return
    await supabase.from('ai_knowledge_sources').delete().eq('id', id)
    load()
  }

  if (loading || !settings) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg flex items-center gap-2"><Bot size={18} /> AI Agent</h2>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium disabled:opacity-60">
          <Save size={14} /> {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>

      {/* تفعيل + الموديل */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <Toggle
          label="تفعيل AI Agent"
          sublabel="لو مفعّل، هيقدر يرد على العملاء تلقائي حسب الصلاحيات تحت"
          value={settings.enabled}
          onChange={v => setSettings({ ...settings, enabled: v })}
        />
        <div>
          <label className="block text-xs text-fg-muted mb-1">الموديل</label>
          <select value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1">نطاق القنوات</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSettings({ ...settings, channel_scope: 'all' })}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm border transition-colors ${(settings.channel_scope || 'all') === 'all' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
              كل القنوات
            </button>
            <button
              onClick={() => setSettings({ ...settings, channel_scope: 'specific' })}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm border transition-colors ${settings.channel_scope === 'specific' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
              قنوات محددة
            </button>
          </div>
          {settings.channel_scope === 'specific' && (
            <div className="mt-2 space-y-1.5">
              {channels.length === 0 ? (
                <p className="text-[11px] text-fg-subtle">مفيش قنوات متصلة</p>
              ) : channels.map(c => {
                const checked = (settings.allowed_channel_ids || []).includes(c.id)
                const label = `${c.platform === 'whatsapp' ? 'واتساب' : c.platform === 'facebook' ? 'فيسبوك' : 'انستجرام'} — ${c.custom_name || c.display_name || c.id}`
                return (
                  <label key={c.id} className="flex items-center gap-2.5 bg-surface-3 rounded-xl px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={e => {
                      const ids = new Set(settings.allowed_channel_ids || [])
                      if (e.target.checked) ids.add(c.id); else ids.delete(c.id)
                      setSettings({ ...settings, allowed_channel_ids: Array.from(ids) })
                    }} className="w-4 h-4 accent-brand" />
                    <span className="text-sm text-fg flex-1">{label}</span>
                    {c.status !== 'active' && <span className="text-[10px] text-fg-subtle">({c.status})</span>}
                  </label>
                )
              })}
              <p className="text-[11px] text-fg-subtle">الـ AI هيرد بس على القنوات المحددة هنا — أي قناة تانية هتتعامل زي ما لو كان متوقف تمامًا.</p>
            </div>
          )}
        </div>
      </div>

      {/* وضع الاختبار */}
      <div className="bg-follow/5 rounded-2xl p-4 space-y-3 border border-follow/30">
        <Toggle
          label="وضع الاختبار"
          sublabel="لو مفعّل، الـ AI يرد بس على عميل الاختبار المحدد تحت — باقي العملاء يتعاملوا وكأن الـ AI متوقف تمامًا"
          value={settings.test_mode}
          onChange={v => setSettings({ ...settings, test_mode: v })}
        />
        {settings.test_mode && (
          <div className="space-y-2">
            {testContact ? (
              <div className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{testContact.name || 'بدون اسم'}</p>
                  <p className="text-[11px] text-fg-subtle truncate">{testContact.phone || testContact.platform}</p>
                </div>
                <button onClick={clearTestContact} className="text-fg-muted hover:text-danger flex-shrink-0"><X size={16} /></button>
              </div>
            ) : (
              <div className="relative">
                <input value={testContactQuery} onChange={e => searchTestContacts(e.target.value)}
                  placeholder="ابحث عن عميل بالاسم أو رقم الهاتف عشان تختاره للاختبار..."
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                {testContactQuery && (
                  <div className="absolute right-0 left-0 top-full mt-1 bg-surface border border-surface-3 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
                    {searchingContact ? (
                      <p className="text-xs text-fg-subtle text-center py-3">بيدور...</p>
                    ) : testContactResults.length === 0 ? (
                      <p className="text-xs text-fg-subtle text-center py-3">مفيش نتايج</p>
                    ) : testContactResults.map(c => (
                      <button key={c.id} onClick={() => pickTestContact(c)}
                        className="flex flex-col w-full px-3 py-2.5 hover:bg-surface-3 text-right border-t border-surface-3 first:border-t-0">
                        <span className="text-sm text-fg">{c.name || 'بدون اسم'}</span>
                        <span className="text-[11px] text-fg-subtle">{c.phone || c.platform}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              لو العميل ده معاه محادثة مفتوحة بالفعل، افتحها ودوس زرار "AI" في أعلى الشات عشان تبدأ الاختبار عليها فورًا — أي عميل جديد يبعت هيتفعل الاختبار تلقائي.
            </p>
          </div>
        )}
      </div>

      {/* التعليمات */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-2 border border-surface-3">
        <label className="block text-xs text-fg-muted">التعليمات (System Prompt)</label>
        <textarea
          value={settings.system_prompt || ''}
          onChange={e => setSettings({ ...settings, system_prompt: e.target.value })}
          rows={8}
          placeholder="اكتب هنا إزاي عايز الـ AI يتصرف، معلومات عن العيادة، الأسعار، السياسات، وأهم حاجة: يمنع تماماً إعطاء أي استشارة أو تشخيص طبي ويحوّل أي سؤال طبي لموظف بشري فوراً."
          className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-y leading-relaxed"
        />
      </div>

      {/* الصلاحيات */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <h3 className="text-sm font-semibold text-fg">الصلاحيات المسموحة للـ AI</h3>
        <Toggle label="تعيين المحادثات لموظف (assign)" value={settings.can_assign} onChange={v => setSettings({ ...settings, can_assign: v })} />
        <Toggle label="تعديل مرحلة الـ Lifecycle" value={settings.can_update_lifecycle} onChange={v => setSettings({ ...settings, can_update_lifecycle: v })} />
        <Toggle label="تعديل بيانات العميل (اسم، رقم تليفون، إلخ)" value={settings.can_update_contact} onChange={v => setSettings({ ...settings, can_update_contact: v })} />
        <Toggle label="إضافة/تعديل تاجات العميل" value={settings.can_update_tags} onChange={v => setSettings({ ...settings, can_update_tags: v })} />
      </div>

      {/* سقف الاستهلاك الشهري */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <MaxConversationsField
          value={settings.monthly_token_budget}
          onChange={v => setSettings({ ...settings, monthly_token_budget: v })}
        />
        <p className="text-[11px] text-fg-subtle -mt-2">لو حطيت سقف، الـ AI هيتوقف تلقائي لو الاستهلاك الشهري وصله (هتوصلك رسالة تنبيه).</p>
      </div>

      {/* سقف لكل محادثة */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs text-fg-muted">سقف لكل محادثة لوحدها</label>
          <button type="button" onClick={() => setSettings({ ...settings, conversation_limit_value: settings.conversation_limit_value == null ? 20000 : null })}
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${settings.conversation_limit_value == null ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
            {settings.conversation_limit_value == null ? 'غير محدود' : 'محدود'}
          </button>
        </div>
        {settings.conversation_limit_value != null && (
          <>
            <div className="flex gap-2">
              <button onClick={() => setSettings({ ...settings, conversation_limit_type: 'tokens' })}
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${(settings.conversation_limit_type || 'tokens') === 'tokens' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
                توكنز
              </button>
              <button onClick={() => setSettings({ ...settings, conversation_limit_type: 'cost' })}
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${settings.conversation_limit_type === 'cost' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
                دولار ($)
              </button>
            </div>
            <input type="number" step={settings.conversation_limit_type === 'cost' ? '0.01' : '1'} value={settings.conversation_limit_value ?? ''}
              onChange={e => setSettings({ ...settings, conversation_limit_value: parseFloat(e.target.value) || 0 })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </>
        )}
        <p className="text-[11px] text-fg-subtle">بمجرد ما محادثة واحدة توصل للسقف ده، الـ AI بيوقف عليها ويحوّلها لموظف بشري تلقائي — بغض النظر عن باقي المحادثات.</p>
      </div>

      {/* استهلاك الشهر الحالي */}
      <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
        <h3 className="text-sm font-semibold text-fg mb-2">استهلاك الشهر الحالي</h3>
        {usage.tokens === 0 ? (
          <p className="text-xs text-fg-subtle">لسه مفيش استهلاك مسجل — محرك الـ AI لسه في مرحلة الإعداد</p>
        ) : (
          <>
            <div className="flex gap-4">
              <div>
                <p className="text-lg font-bold text-fg">{usage.tokens.toLocaleString()}</p>
                <p className="text-[11px] text-fg-subtle">توكن</p>
              </div>
              <div>
                <p className="text-lg font-bold text-fg">${usage.cost.toFixed(2)}</p>
                <p className="text-[11px] text-fg-subtle">تكلفة تقريبية</p>
              </div>
              {settings.monthly_token_budget ? (
                <div>
                  <p className="text-lg font-bold text-fg">{Math.max(0, settings.monthly_token_budget - usage.tokens).toLocaleString()}</p>
                  <p className="text-[11px] text-fg-subtle">متبقي من السقف الشهري</p>
                </div>
              ) : null}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-3 flex gap-6">
              <div>
                <p className="text-[11px] text-fg-subtle mb-0.5">AI Agent (ردود العملاء)</p>
                <p className="text-sm font-semibold text-fg">{usage.agent.tokens.toLocaleString()} توكن — ${usage.agent.cost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-fg-subtle mb-0.5">تقارير AI</p>
                <p className="text-sm font-semibold text-fg">{usage.reports.tokens.toLocaleString()} توكن — ${usage.reports.cost.toFixed(2)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Knowledge Base */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2"><BookOpen size={15} /> مصادر المعرفة</h3>
          <button onClick={() => setShowAddSource(!showAddSource)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand rounded-lg text-[11px] text-white font-medium">
            <Plus size={12} /> إضافة
          </button>
        </div>
        <p className="text-[11px] text-fg-subtle -mt-2">نصوص أو روابط (زي landing page) هيتعلم منها الـ AI معلومات عن العيادة</p>

        {showAddSource && (
          <div className="bg-surface-3 rounded-xl p-3 space-y-2.5">
            <div className="flex gap-2">
              <button onClick={() => setSourceForm({ ...sourceForm, type: 'text' })}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium ${sourceForm.type === 'text' ? 'bg-brand text-white' : 'bg-surface text-fg-muted'}`}>
                <FileText size={13} /> نص
              </button>
              <button onClick={() => setSourceForm({ ...sourceForm, type: 'link' })}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium ${sourceForm.type === 'link' ? 'bg-brand text-white' : 'bg-surface text-fg-muted'}`}>
                <Link2 size={13} /> رابط
              </button>
            </div>
            <InputField label="العنوان" value={sourceForm.title} onChange={v => setSourceForm({ ...sourceForm, title: v })} placeholder="مثلاً: خدمات العيادة" />
            {sourceForm.type === 'text' ? (
              <div>
                <label className="block text-xs text-fg-muted mb-1">المحتوى</label>
                <textarea value={sourceForm.content} onChange={e => setSourceForm({ ...sourceForm, content: e.target.value })}
                  rows={5} className="w-full bg-surface rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-y" />
              </div>
            ) : (
              <InputField label="الرابط" value={sourceForm.url} onChange={v => setSourceForm({ ...sourceForm, url: v })} placeholder="https://..." />
            )}
            <div className="flex gap-2">
              <button onClick={addSource} disabled={savingSource}
                className="flex-1 py-2 bg-brand rounded-lg text-xs text-white font-medium disabled:opacity-60">
                {savingSource ? (sourceForm.type === 'link' ? 'بيحمّل الصفحة...' : 'جاري الإضافة...') : 'إضافة'}
              </button>
              <button onClick={() => setShowAddSource(false)} disabled={savingSource} className="px-3 py-2 bg-surface rounded-lg text-xs text-fg-muted">إلغاء</button>
            </div>
          </div>
        )}

        {sources.map(s => (
          <div key={s.id} className="flex items-center gap-2 bg-surface-3 rounded-lg px-3 py-2.5">
            {s.type === 'link' ? <Link2 size={13} className="text-fg-muted flex-shrink-0" /> : <FileText size={13} className="text-fg-muted flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-fg truncate">{s.title}</p>
              {s.url && <p className="text-[11px] text-fg-subtle truncate">{s.url}</p>}
            </div>
            {s.type === 'link' && (
              <button onClick={() => refreshSource(s.id)} disabled={refreshingId === s.id}
                title="أعد تحميل محتوى الصفحة" className="text-fg-muted hover:text-brand flex-shrink-0 disabled:opacity-50">
                <RefreshCw size={13} className={refreshingId === s.id ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={() => removeSource(s.id)} className="text-fg-muted hover:text-danger flex-shrink-0"><Trash2 size={13} /></button>
          </div>
        ))}
        {sources.length === 0 && !showAddSource && (
          <p className="text-center text-fg-subtle text-xs py-3">مفيش مصادر معرفة لسه</p>
        )}
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
