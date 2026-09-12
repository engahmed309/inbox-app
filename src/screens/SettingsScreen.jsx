import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL, apiFetch, FB_APP_ID, WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, INSTAGRAM_APP_ID, FACEBOOK_LOGIN_CONFIG_ID, TIKTOK_APP_ID, TIKTOK_SCOPES } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import i18n from '../i18n'
import BackArrow from '../components/BackArrow'
import { formatNumber } from '../lib/locale'
import SegmentBuilder from '../components/SegmentBuilder'
import TemplatePreview from '../components/TemplatePreview'
import {
  Users, Tag, List, Settings2, Plus, Trash2,
  Save, Edit2, Check, X, ToggleLeft, ToggleRight, LogOut,
  MessageSquareText, Search, Paperclip, Facebook, Instagram, AlertTriangle, KeyRound,
  Radio, Phone, UserCog, ChevronUp, ChevronDown, Bot, BookOpen, Link2, FileText, RefreshCw, Music2,
  QrCode, Filter
} from 'lucide-react'

const TABS = [
  { key: 'agents', labelKey: 'settings.tabs.agents', icon: Users },
  { key: 'channels', labelKey: 'settings.tabs.channels', icon: Radio },
  { key: 'lifecycle', labelKey: 'settings.tabs.lifecycle', icon: Tag },
  { key: 'tags', labelKey: 'settings.tabs.tags', icon: Tag },
  { key: 'fields', labelKey: 'settings.tabs.fields', icon: List },
  { key: 'quickreplies', labelKey: 'settings.tabs.quickReplies', icon: MessageSquareText },
  { key: 'roundrobin', labelKey: 'settings.tabs.roundRobin', icon: Settings2 },
  { key: 'ai', labelKey: 'settings.tabs.ai', icon: Bot },
  { key: 'segments', labelKey: 'settings.tabs.segments', icon: Filter },
  { key: 'danger', labelKey: 'settings.tabs.danger', icon: AlertTriangle },
]

export default function SettingsScreen() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('agents')
  const { agent, signOut } = useAuth()
  const navigate = useNavigate()

  if (agent?.role !== 'admin') return (
    <div className="h-full flex items-center justify-center text-fg-muted">
      <p>{t('settings.accessDenied')}</p>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-surface-2 border-b border-surface-3">
        <button onClick={() => navigate(-1)} className="text-fg-muted hover:text-fg">
          <BackArrow />
        </button>
        <span className="font-bold text-fg">{t('settings.header.title')}</span>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="text-fg-muted hover:text-danger transition-colors">
          <LogOut size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-2 overflow-x-auto">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${tab === tb.key ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
            <tb.icon size={14} />
            {t(tb.labelKey)}
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
        {tab === 'segments' && <SegmentsTab />}
        {tab === 'danger' && <DangerZoneTab />}
      </div>
    </div>
  )
}

// ─── Agents Tab ───────────────────────────────────────────
function AgentsTab() {
  const { t } = useTranslation()
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
      const res = await apiFetch(`${API_URL}/admin/create-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error(await res.text())
      setAddMode('closed')
      setForm({ name: '', email: '', password: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
      loadAgents()
      toast.success(t('settings.agents.addedSuccess'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setLoading(false)
    }
  }

  const inviteAgent = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/admin/invite-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm)
      })
      if (!res.ok) throw new Error(await res.text())
      setAddMode('closed')
      setInviteForm({ name: '', email: '', role: 'agent', max_conversations: 10, can_see_all_conversations: false })
      loadAgents()
      toast.success(t('settings.agents.inviteSentSuccess'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
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
    const res = await apiFetch(`${API_URL}/admin/agent/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || t('settings.agents.deleteAgentFailed'))
    }
  }

  const confirmDeleteAgent = async (ag) => {
    const { data: convs } = await supabase
      .from('conversations').select('id').eq('assigned_agent_id', ag.id).in('status', ['open', 'follow_up'])
    const convCount = convs?.length || 0
    if (convCount === 0) {
      if (!confirm(t('settings.agents.deleteConfirm'))) return
      try {
        await deleteAgentFully(ag.id)
        loadAgents()
      } catch (err) {
        toast.error(t('settings.common.errorWithMessage', { message: err.message }))
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
        if (!reassignToId) { toast.error(t('settings.agents.selectReassignAgent')); setReassigning(false); return }
        assignments = convIds.map(id => ({ convId: id, agentId: reassignToId }))
      } else {
        const pool = agents.filter(a => a.id !== deleteTarget.agent.id && (reassignMode === 'all' || a.status === 'online'))
        if (pool.length === 0) { toast.error(t('settings.agents.noOtherAgentsAvailable')); setReassigning(false); return }
        assignments = convIds.map((id, i) => ({ convId: id, agentId: pool[i % pool.length].id }))
      }

      for (const a of assignments) {
        await supabase.from('conversations').update({ assigned_agent_id: a.agentId }).eq('id', a.convId)
        await supabase.from('conversation_assignment_log').insert({ conversation_id: a.convId, assigned_to: a.agentId, assigned_by: null })
      }

      await deleteAgentFully(deleteTarget.agent.id)
      toast.success(t('settings.agents.deletedAndReassigned', { count: new Set(assignments.map(a => a.agentId)).size }))
      setDeleteTarget(null)
      loadAgents()
      loadCounts()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setReassigning(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.tabs.agents')}</h2>
        <button onClick={() => setAddMode(addMode === 'closed' ? 'choice' : 'closed')}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.agents.addAgent')}
        </button>
      </div>

      {/* إجمالي المحادثات */}
      <div className="grid grid-cols-3 gap-2">
        <TotalStat label={t('settings.common.status.open')} value={totals.open} color="text-success" />
        <TotalStat label={t('settings.common.status.followUp')} value={totals.follow_up} color="text-follow" />
        <TotalStat label={t('settings.common.status.closed')} value={totals.closed} color="text-fg-muted" />
      </div>

      {addMode === 'choice' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-2 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg mb-1">{t('settings.agents.howToAdd')}</h3>
          <button onClick={() => setAddMode('manual')}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-3 hover:bg-surface-3/70 text-start transition-colors">
            <UserCog size={18} className="text-brand flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">{t('settings.agents.manualAdd')}</p>
              <p className="text-xs text-fg-subtle">{t('settings.agents.manualAddDesc')}</p>
            </div>
          </button>
          <button onClick={() => setAddMode('invite')}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-3 hover:bg-surface-3/70 text-start transition-colors">
            <MessageSquareText size={18} className="text-brand flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">{t('settings.agents.emailInvite')}</p>
              <p className="text-xs text-fg-subtle">{t('settings.agents.emailInviteDesc')}</p>
            </div>
          </button>
          <button onClick={() => setAddMode('closed')} className="w-full py-2 text-xs text-fg-muted">{t('settings.common.cancel')}</button>
        </div>
      )}

      {addMode === 'manual' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg">{t('settings.agents.manualAddTitle')}</h3>
          <p className="text-xs text-fg-subtle -mt-2">{t('settings.agents.manualAddIntro')}</p>
          <InputField label={t('settings.common.name')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label={t('settings.common.email')} value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <InputField label={t('settings.common.password')} value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.common.role')}</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">{t('settings.common.roleAgent')}</option>
              <option value="admin">{t('settings.common.roleAdmin')}</option>
            </select>
          </div>
          <MaxConversationsField value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: v })} />
          <Toggle
            label={t('settings.agents.seeAllConversations')}
            value={form.can_see_all_conversations}
            onChange={v => setForm({ ...form, can_see_all_conversations: v })}
          />
          <div className="flex gap-2 pt-1">
            <button onClick={addAgent} disabled={loading}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {loading ? t('settings.common.addingEllipsis') : t('settings.agents.addAgent')}
            </button>
            <button onClick={() => setAddMode('closed')}
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">
              {t('settings.common.cancel')}
            </button>
          </div>
        </div>
      )}

      {addMode === 'invite' && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <h3 className="text-sm font-semibold text-fg">{t('settings.agents.inviteTitle')}</h3>
          <p className="text-xs text-fg-subtle -mt-2">{t('settings.agents.inviteDesc')}</p>
          <InputField label={t('settings.common.name')} value={inviteForm.name} onChange={v => setInviteForm({ ...inviteForm, name: v })} />
          <InputField label={t('settings.common.email')} value={inviteForm.email} onChange={v => setInviteForm({ ...inviteForm, email: v })} type="email" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.common.role')}</label>
            <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">{t('settings.common.roleAgent')}</option>
              <option value="admin">{t('settings.common.roleAdmin')}</option>
            </select>
          </div>
          <MaxConversationsField value={inviteForm.max_conversations} onChange={v => setInviteForm({ ...inviteForm, max_conversations: v })} />
          <Toggle
            label={t('settings.agents.seeAllConversations')}
            value={inviteForm.can_see_all_conversations}
            onChange={v => setInviteForm({ ...inviteForm, can_see_all_conversations: v })}
          />
          <div className="flex gap-2 pt-1">
            <button onClick={inviteAgent} disabled={loading}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {loading ? t('settings.agents.sendingEllipsis') : t('settings.agents.sendInvite')}
            </button>
            <button onClick={() => setAddMode('closed')}
              className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">
              {t('settings.common.cancel')}
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
              <span className={`absolute -bottom-0.5 -start-0.5 w-3 h-3 rounded-full border-2 border-surface-2 ${aiEnabled ? 'bg-success' : 'bg-slate-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-fg">{aiAgentRow.name}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${aiEnabled ? 'bg-success/15 text-success' : 'bg-surface-3 text-fg-subtle'}`}>
                  {aiEnabled ? t('settings.common.enabled') : t('settings.common.disabled')}
                </span>
              </div>
              <p className="text-xs text-fg-muted">{t('settings.agents.aiAgentDesc')}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-3 pt-3 border-t border-surface-3">
            <span className="text-[11px] text-success">{t('settings.common.status.open')}: {aiCounts.open}</span>
            <span className="text-[11px] text-follow">{t('settings.common.status.followUp')}: {aiCounts.follow_up}</span>
            <span className="text-[11px] text-fg-subtle">{t('settings.common.status.closed')}: {aiCounts.closed}</span>
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
              <span className="font-semibold text-fg text-sm">{t('settings.agents.deleteModal.title', { name: deleteTarget.agent.name })}</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-fg-muted">
                {t('settings.agents.deleteModal.beforeCount')} <b className="text-fg">{deleteTarget.convCount}</b> {t('settings.agents.deleteModal.afterCount')}
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'specific'} onChange={() => setReassignMode('specific')} />
                  <span className="text-sm text-fg">{t('settings.agents.deleteModal.reassignSpecific')}</span>
                </label>
                {reassignMode === 'specific' && (
                  <div className="ps-6">
                    <select value={reassignToId} onChange={e => setReassignToId(e.target.value)}
                      className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
                      <option value="">{t('settings.agents.deleteModal.selectAgentPlaceholder')}</option>
                      {agents.filter(a => a.id !== deleteTarget.agent.id).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'all'} onChange={() => setReassignMode('all')} />
                  <span className="text-sm text-fg">{t('settings.agents.deleteModal.reassignAll')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={reassignMode === 'online'} onChange={() => setReassignMode('online')} />
                  <span className="text-sm text-fg">{t('settings.agents.deleteModal.reassignOnline')}</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-surface-3">
              <button onClick={() => setDeleteTarget(null)} disabled={reassigning}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                {t('settings.common.cancel')}
              </button>
              <button onClick={finalizeDeleteWithReassign} disabled={reassigning}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:brightness-110 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reassigning ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('settings.agents.deleteModal.confirmButton')}
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
  const { t } = useTranslation()
  const unlimited = value == null
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-fg-muted">{t('settings.common.maxConversationsLabel')}</label>
        <button type="button" onClick={() => onChange(unlimited ? 10 : null)}
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${unlimited ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
          {unlimited ? t('settings.common.unlimited') : t('settings.common.limited')}
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
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: agent.name, max_conversations: agent.max_conversations, role: agent.role, can_see_all_conversations: agent.can_see_all_conversations })
  const c = counts || { open: 0, follow_up: 0, closed: 0 }
  const toast = useToast()

  // مؤقتاً: بديل لجوجل — عشان مراجع ميتا يقدر يدخل بإيميل وباسورد عادي
  const resetPassword = async () => {
    const password = prompt(t('settings.agents.resetPasswordPrompt', { name: agent.name }))
    if (!password) return
    try {
      const res = await apiFetch(`${API_URL}/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, password })
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(t('settings.agents.passwordChanged'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    }
  }

  return (
    <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
      {editing ? (
        <div className="space-y-3">
          <InputField label={t('settings.common.name')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <MaxConversationsField value={form.max_conversations} onChange={v => setForm({ ...form, max_conversations: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.common.role')}</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="agent">{t('settings.common.roleAgent')}</option>
              <option value="admin">{t('settings.common.roleAdmin')}</option>
            </select>
          </div>
          <Toggle label={t('settings.agents.seeAllConversations')} value={form.can_see_all_conversations} onChange={v => setForm({ ...form, can_see_all_conversations: v })} />
          <div className="flex gap-2">
            <button onClick={() => onUpdate(form)} className="flex-1 py-2 bg-brand rounded-xl text-sm text-white">{t('settings.common.save')}</button>
            <button onClick={onEdit} className="px-3 py-2 bg-surface-3 rounded-xl text-sm text-fg-muted">{t('settings.common.cancel')}</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-fg font-semibold">
                {agent.name[0]}
              </div>
              <span className={`absolute -bottom-0.5 -start-0.5 w-3 h-3 rounded-full border-2 border-surface-2 ${agent.status === 'busy' ? 'bg-follow' : agent.is_online ? 'bg-success' : 'bg-fg-subtle'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-fg">{agent.name}</p>
                {!agent.last_seen_at && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-follow/15 text-follow">{t('settings.agents.neverLoggedIn')}</span>
                )}
              </div>
              <p className="text-xs text-fg-muted">{agent.email} · {agent.role === 'admin' ? t('settings.common.roleAdmin') : t('settings.common.roleAgent')}</p>
              <p className="text-xs text-fg-subtle">{t('settings.agents.limitPrefix')} {agent.max_conversations == null ? t('settings.common.unlimited') : t('settings.common.conversationsCount', { count: agent.max_conversations })}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={resetPassword} title={t('settings.agents.resetPasswordTitle')} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
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
            <span className="text-[11px] text-success">{t('settings.common.status.open')}: {c.open}</span>
            <span className="text-[11px] text-follow">{t('settings.common.status.followUp')}: {c.follow_up}</span>
            <span className="text-[11px] text-fg-subtle">{t('settings.common.status.closed')}: {c.closed}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Channels Tab ──────────────────────────────────────────
// حد الرسايل = كام عميل جديد نقدر نبدأ معاه محادثة في ٢٤ ساعة. بيزيد لوحده من ميتا مع الاستخدام
// الكويس، وبيقل لو الجودة وقعت — عشان كده بنعرضه جنب تقييم الجودة
const MESSAGING_TIER_KEYS = {
  TIER_50: 'settings.channels.messagingTier.tier50',
  TIER_250: 'settings.channels.messagingTier.tier250',
  TIER_1K: 'settings.channels.messagingTier.tier1k',
  TIER_10K: 'settings.channels.messagingTier.tier10k',
  TIER_100K: 'settings.channels.messagingTier.tier100k',
  TIER_UNLIMITED: 'settings.channels.messagingTier.unlimited',
}

const QUALITY_RATING = {
  GREEN: { labelKey: 'settings.channels.quality.high', cls: 'bg-success/15 text-success' },
  YELLOW: { labelKey: 'settings.channels.quality.medium', cls: 'bg-follow/15 text-follow' },
  RED: { labelKey: 'settings.channels.quality.low', cls: 'bg-danger/15 text-danger' },
}

const PLATFORM_META = {
  facebook: { labelKey: 'settings.channels.platforms.facebook', icon: Facebook, color: 'text-blue-400' },
  instagram: { labelKey: 'settings.channels.platforms.instagram', icon: Instagram, color: 'text-pink-400' },
  whatsapp: { labelKey: 'settings.channels.platforms.whatsapp', icon: Phone, color: 'text-green-400' },
  tiktok: { labelKey: 'settings.channels.platforms.tiktok', icon: Music2, color: 'text-fg' },
  whatsapp_qr: { labelKey: 'settings.channels.platforms.whatsapp_qr', icon: QrCode, color: 'text-emerald-400' },
}

function ChannelsTab() {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState('connected')

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-fg">{t('settings.tabs.channels')}</h2>

      <div className="flex gap-4 border-b border-surface-3">
        <button onClick={() => setSubTab('connected')}
          className={`px-1 pb-2.5 text-sm font-medium transition-colors ${subTab === 'connected' ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
          {t('settings.channels.connectedTab')}
        </button>
        <button onClick={() => setSubTab('connect')}
          className={`px-1 pb-2.5 text-sm font-medium transition-colors ${subTab === 'connect' ? 'text-brand border-b-2 border-brand' : 'text-fg-subtle'}`}>
          {t('settings.channels.connectTab')}
        </button>
      </div>

      {subTab === 'connected' ? <ConnectedChannelsList /> : <ConnectNewChannel />}
    </div>
  )
}

function ConnectedChannelsList() {
  const { t } = useTranslation()
  const toast = useToast()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [settingsChannel, setSettingsChannel] = useState(null)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`${API_URL}/channels`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.loadFailed'))
      setChannels(data.channels || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const disconnectChannel = async (ch) => {
    if (!confirm(t('settings.channels.disconnectConfirm', { name: ch.custom_name || ch.display_name || t(PLATFORM_META[ch.platform].labelKey) }))) return
    setDeletingId(ch.id)
    try {
      const res = await apiFetch(`${API_URL}/channels/${ch.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.disconnectFailed'))
      toast.success(t('settings.channels.disconnected'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
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
      const res = await apiFetch(`${API_URL}/channels/${ch.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_name: editValue.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.renameFailed'))
      toast.success(t('settings.channels.renamed'))
      setEditingId(null)
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
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
      <button onClick={load} className="text-xs text-brand">{t('settings.common.retry')}</button>
    </div>
  )

  return (
    <div className="space-y-3 pt-1">
      {['facebook', 'instagram', 'whatsapp', 'tiktok', 'whatsapp_qr'].map(platform => {
        const meta = PLATFORM_META[platform]
        const metaLabel = t(meta.labelKey)
        const Icon = meta.icon
        // فيسبوك وانستجرام لسه رقم واحد بس، بس الواتساب ممكن يكون فيه أكتر من رقم مربوط
        const rows = channels.filter(c => c.platform === platform)
        const list = rows.length > 0 ? rows : [null]
        return list.map((ch, i) => (
          <div key={ch?.id || `${platform}-${i}`} className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
            <div className="flex items-center gap-3">
              {ch?.avatar_url ? (
                <img src={ch.avatar_url} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover bg-surface-3"
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
                      placeholder={metaLabel}
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
                    <Icon size={12} className={meta.color} /> {ch?.custom_name || metaLabel}
                  </p>
                )}
                <p className="text-xs text-fg-muted truncate">{ch?.display_name || t('settings.channels.notLinked')}</p>
                {ch?.platform === 'whatsapp' && ch?.metadata?.messaging_limit_tier && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-fg-muted">
                      {MESSAGING_TIER_KEYS[ch.metadata.messaging_limit_tier] ? t(MESSAGING_TIER_KEYS[ch.metadata.messaging_limit_tier]) : ch.metadata.messaging_limit_tier}
                    </span>
                    {ch.metadata.quality_rating && QUALITY_RATING[ch.metadata.quality_rating] && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${QUALITY_RATING[ch.metadata.quality_rating].cls}`}>
                        {t('settings.channels.qualityPrefix')} {t(QUALITY_RATING[ch.metadata.quality_rating].labelKey)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {editingId !== ch?.id && (
                <>
                  {ch?.status === 'active' ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-success/15 text-success flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" /> {t('settings.channels.status.active')}
                    </span>
                  ) : ch?.status === 'disconnected' ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-surface-3 text-fg-subtle flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle" /> {t('settings.channels.status.disconnected')}
                    </span>
                  ) : ch ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-danger/15 text-danger flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger" /> {t('settings.channels.status.needsReconnect')}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-surface-3 text-fg-subtle flex-shrink-0">
                      {t('settings.channels.notLinked')}
                    </span>
                  )}
                  {ch?.id && (
                    <button onClick={() => setSettingsChannel(ch)} title={t('settings.channels.settingsTitle')}
                      className="w-8 h-8 flex items-center justify-center text-fg-subtle hover:text-fg rounded-lg hover:bg-surface-3 flex-shrink-0">
                      <Settings2 size={15} />
                    </button>
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

      {settingsChannel && (
        <ChannelSettingsPanel
          channel={settingsChannel}
          onClose={() => setSettingsChannel(null)}
          onChanged={() => { load(); setSettingsChannel(null) }}
        />
      )}
    </div>
  )
}

// لوحة إعدادات قناة واحدة — كل العمليات الخاصة بيها في مكان واحد بدل ما تكون أزرار متفرقة
// على الكارت. بتتفتح من الترس، وبتتقفل بالضغط بره أو على X
function ChannelSettingsPanel({ channel, onClose, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(channel.custom_name || '')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [deletingForever, setDeletingForever] = useState(false)

  const meta = PLATFORM_META[channel.platform] || { labelKey: null, icon: Radio, color: 'text-fg' }
  const metaLabel = meta.labelKey ? t(meta.labelKey) : channel.platform
  const Icon = meta.icon

  const saveName = async () => {
    setSaving(true)
    try {
      const res = await apiFetch(`${API_URL}/channels/${channel.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_name: name.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.saveFailed'))
      toast.success(t('settings.channels.nameSaved'))
      onChanged()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    if (!confirm(t('settings.channels.disconnectConfirm', { name: channel.custom_name || channel.display_name || metaLabel }))) return
    setDisconnecting(true)
    try {
      const res = await apiFetch(`${API_URL}/channels/${channel.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.disconnectFailed'))
      toast.success(t('settings.channels.disconnected'))
      onChanged()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
      setDisconnecting(false)
    }
  }

  // بعكس "فصل" اللي بيسيب الصف موجود عشان يرجع يشتغل تلقائي لو اترّبط تاني — ده بيمسح الصف
  // خالص من السجل. المحادثات والرسايل القديمة مش بتتمسح (بيفضل تاريخها محفوظ)، بس هتبقى
  // "من غير قناة" لحد ما رقم جديد يترّبط
  const deleteForever = async () => {
    if (!confirm(t('settings.channels.deleteForeverConfirm', { name: channel.custom_name || channel.display_name || metaLabel }))) return
    if (!confirm(t('settings.channels.deleteForeverConfirm2'))) return
    setDeletingForever(true)
    try {
      const res = await apiFetch(`${API_URL}/channels/${channel.id}/permanent`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.common.deleteFailed'))
      toast.success(t('settings.channels.deletedForever'))
      onChanged()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
      setDeletingForever(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[440px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-2 z-10">
          <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
            <Icon size={15} className={meta.color} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg truncate">{channel.custom_name || metaLabel}</p>
            <p className="text-xs text-fg-muted truncate">{channel.display_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('settings.channels.shortNameLabel')}</label>
            <div className="flex items-center gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder={metaLabel}
                className="flex-1 min-w-0 bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveName} disabled={saving}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-brand text-white disabled:opacity-50 flex-shrink-0">
                {saving ? t('settings.common.ellipsis') : t('settings.common.save')}
              </button>
            </div>
            <p className="text-[11px] text-fg-subtle mt-1">{t('settings.channels.shortNameHint')}</p>
          </div>

          {channel.platform === 'whatsapp' && channel.status === 'active' && (
            <ChannelTemplates channel={channel} />
          )}

          <div className="pt-1 space-y-1.5">
            {channel.waba_id && (
              <p className="text-[11px] text-fg-subtle">WABA ID: {channel.waba_id}</p>
            )}
            <p className="text-[11px] text-fg-subtle">{t('settings.channels.channelIdLabel')} {channel.external_id}</p>
          </div>

          <div className="pt-3 border-t border-surface-3 space-y-2">
            <button onClick={disconnect} disabled={disconnecting || deletingForever}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50">
              {disconnecting ? (
                <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Trash2 size={14} /> {t('settings.channels.disconnectButton')}</>
              )}
            </button>
            <button onClick={deleteForever} disabled={disconnecting || deletingForever}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:brightness-110 transition-colors disabled:opacity-50">
              {deletingForever ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Trash2 size={14} /> {t('settings.channels.deleteForeverButton')}</>
              )}
            </button>
            <p className="text-[11px] text-fg-subtle text-center">
              {t('settings.channels.disconnectVsDeleteHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// حالة القالب عند ميتا — بتتغير لوحدها بعد المراجعة، فبنقراها منهم مباشرة كل مرة
const TEMPLATE_STATUS = {
  APPROVED: { labelKey: 'settings.templates.status.approved', cls: 'bg-success/15 text-success' },
  PENDING: { labelKey: 'settings.templates.status.pending', cls: 'bg-follow/15 text-follow' },
  IN_APPEAL: { labelKey: 'settings.templates.status.inAppeal', cls: 'bg-follow/15 text-follow' },
  REJECTED: { labelKey: 'settings.templates.status.rejected', cls: 'bg-danger/15 text-danger' },
  PAUSED: { labelKey: 'settings.templates.status.paused', cls: 'bg-surface-3 text-fg-muted' },
  DISABLED: { labelKey: 'settings.templates.status.disabled', cls: 'bg-surface-3 text-fg-muted' },
}

const TEMPLATE_CATEGORY = { MARKETING: 'settings.templates.category.marketing', UTILITY: 'settings.templates.category.utility', AUTHENTICATION: 'settings.templates.category.authentication' }

// قوالب واتساب المعتمدة — الطريقة الوحيدة للرد بعد ما تعدي نافذة الـ٢٤ ساعة.
// بنحمّلها بس لما المستخدم يفتح القسم، عشان منضربش Graph API لكل رقم مع كل فتح للإعدادات
function ChannelTemplates({ channel }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [templates, setTemplates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`${API_URL}/channels/${channel.id}/templates`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.templates.loadFailed'))
      setTemplates(data.templates || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const removeTemplate = async (tpl) => {
    if (!confirm(t('settings.templates.deleteConfirm', { name: tpl.name }))) return
    setDeleting(tpl.name)
    try {
      const res = await apiFetch(`${API_URL}/channels/${channel.id}/templates/${encodeURIComponent(tpl.name)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.common.deleteFailed'))
      toast.success(t('settings.templates.deleted'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setDeleting(null)
    }
  }

  // نص القالب نفسه موجود في مكوّن BODY — بنعرضه كمعاينة عشان الموظف يفرق بين القوالب من غير ما يفتحها
  const bodyOf = (tpl) => tpl.components?.find(c => c.type === 'BODY')?.text || ''

  return (
    <div className="pt-4 border-t border-surface-3">
      <div className="flex items-center gap-2 mb-2.5">
        <FileText size={13} className="text-fg-muted" />
        <span className="text-xs font-semibold text-fg flex-1">{t('settings.templates.title')}</span>
        {templates && <span className="text-[10px] text-fg-subtle">{templates.length}</span>}
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-brand hover:underline">
          <Plus size={12} /> {t('settings.templates.newTemplate')}
        </button>
      </div>

      <p className="text-[11px] text-fg-subtle mb-2.5 leading-relaxed">
        {t('settings.templates.description')}
      </p>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-3">
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="space-y-1.5">
            <p className="text-xs text-danger bg-danger/5 rounded-lg px-2.5 py-1.5">{error}</p>
            <button onClick={load} className="text-[11px] text-brand">{t('settings.common.retry')}</button>
          </div>
        ) : templates?.length === 0 ? (
          <p className="text-[11px] text-fg-subtle bg-surface-3/50 rounded-lg px-2.5 py-2">
            {t('settings.templates.empty')}
          </p>
        ) : (
          templates?.map(tpl => {
            const st = TEMPLATE_STATUS[tpl.status]
            const stLabel = st ? t(st.labelKey) : tpl.status
            const stCls = st ? st.cls : 'bg-surface-3 text-fg-muted'
            return (
              <div key={tpl.id || tpl.name} className="bg-surface-3/50 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg font-medium truncate flex-1">{tpl.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${stCls}`}>{stLabel}</span>
                  {/* ميتا بتسمح بالتعديل للمرفوض والمعتمد والموقوف بس — اللي تحت المراجعة مقفول */}
                  {['REJECTED', 'APPROVED', 'PAUSED'].includes(tpl.status) && (
                    <button onClick={() => setEditing(tpl)} title={t('settings.templates.editTitle')}
                      className="w-6 h-6 flex items-center justify-center text-fg-subtle hover:text-brand rounded-lg hover:bg-brand/10 flex-shrink-0">
                      <Edit2 size={12} />
                    </button>
                  )}
                  <button onClick={() => removeTemplate(tpl)} disabled={deleting === tpl.name}
                    title={t('settings.templates.deleteTitle')}
                    className="w-6 h-6 flex items-center justify-center text-fg-subtle hover:text-danger rounded-lg hover:bg-danger/10 flex-shrink-0 disabled:opacity-50">
                    {deleting === tpl.name ? (
                      <div className="w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-fg-subtle">
                  <span>{TEMPLATE_CATEGORY[tpl.category] ? t(TEMPLATE_CATEGORY[tpl.category]) : tpl.category}</span>
                  <span>·</span>
                  <span>{tpl.language}</span>
                </div>
                {bodyOf(tpl) && (
                  <p className="text-[11px] text-fg-muted mt-1.5 leading-relaxed">{bodyOf(tpl)}</p>
                )}
                {tpl.status === 'REJECTED' && tpl.rejected_reason && (
                  <p className="text-[10px] text-danger mt-1">{t('settings.templates.rejectedReasonPrefix')} {tpl.rejected_reason}</p>
                )}
              </div>
            )
          })
        )}
      </div>

      {showCreate && (
        <CreateTemplateModal channel={channel}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }} />
      )}

      {editing && (
        <CreateTemplateModal channel={channel} existing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

const TEMPLATE_LANGS = [
  { code: 'ar', labelKey: 'settings.templates.langs.ar' },
  { code: 'en', labelKey: 'settings.templates.langs.en' },
  { code: 'en_US', labelKey: 'settings.templates.langs.enUs' },
]

// نفس النموذج بيستخدم للإنشاء وللتعديل — لو اتبعتله قالب موجود بيشتغل في وضع التعديل
// (الاسم واللغة بيتقفلوا لأن ميتا مابتسمحش بتغييرهم بعد الإنشاء)
function CreateTemplateModal({ channel, existing, onClose, onCreated }) {
  const { t } = useTranslation()
  const toast = useToast()
  const isEdit = Boolean(existing)
  const bodyOf = (tpl) => tpl?.components?.find(c => c.type === 'BODY')?.text || ''
  const footerOf = (tpl) => tpl?.components?.find(c => c.type === 'FOOTER')?.text || ''

  const [form, setForm] = useState({
    name: existing?.name || '',
    language: existing?.language || 'ar',
    category: existing?.category || 'UTILITY',
    body: bodyOf(existing),
    footer: footerOf(existing)
  })
  const [examples, setExamples] = useState(
    existing?.components?.find(c => c.type === 'BODY')?.example?.body_text?.[0] || []
  )
  const existingHeader = existing?.components?.find(c => c.type === 'HEADER')
  const [header, setHeader] = useState({
    enabled: Boolean(existingHeader),
    format: existingHeader?.format || 'TEXT',
    text: existingHeader?.text || '',
    example: existingHeader?.example?.header_text?.[0] || '',
    handle: existingHeader?.example?.header_handle?.[0] || '',
    fileName: ''
  })
  const [uploadingSample, setUploadingSample] = useState(false)
  const sampleInputRef = useRef(null)

  // عيّنة الميديا بترفع على التخزين بتاعنا الأول، وبعدين السيرفر بيرفعها لميتا ويرجّع الـ handle.
  // ميتا محتاجة العيّنة عشان تراجع شكل القالب — مش هي دي الصورة اللي هتتبعت للعملاء بعدين
  const pickSample = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingSample(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `template-samples/${channel.id}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('inbox-media').upload(path, file)
      if (upErr) throw new Error(t('settings.templates.uploadFileFailed'))
      const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)

      const res = await apiFetch(`${API_URL}/channels/${channel.id}/templates/sample-handle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_url: urlData.publicUrl, mime_type: file.type, format: header.format })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.templates.uploadSampleFailed'))
      setHeader(h => ({ ...h, handle: data.handle, fileName: file.name }))
      toast.success(t('settings.templates.sampleUploaded'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setUploadingSample(false)
    }
  }
  const [buttons, setButtons] = useState(
    existing?.components?.find(c => c.type === 'BUTTONS')?.buttons?.map(b => ({
      type: b.type, text: b.text, url: b.url || '', phone_number: b.phone_number || ''
    })) || []
  )
  const [saving, setSaving] = useState(false)

  // ميتا مابتقبلش خلط الرد السريع مع أزرار الرابط/الاتصال في نفس القالب
  const buttonKind = buttons[0]?.type === 'QUICK_REPLY' ? 'QUICK_REPLY' : buttons.length ? 'CTA' : null
  const addButton = (type) => {
    if (buttons.length >= 3) return
    setButtons([...buttons, { type, text: '', url: '', phone_number: '' }])
  }
  const updateButton = (i, patch) => setButtons(buttons.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  const removeButton = (i) => setButtons(buttons.filter((_, idx) => idx !== i))

  // عدد المتغيرات {{1}} {{2}} في النص — ميتا بترفض القالب لو فيه متغيرات من غير أمثلة ليها
  const varCount = (form.body.match(/\{\{\d+\}\}/g) || []).length

  const addVariable = () => {
    setForm(f => ({ ...f, body: `${f.body}{{${varCount + 1}}}` }))
  }

  const submit = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error(t('settings.templates.nameAndBodyRequired'))
      return
    }
    setSaving(true)
    try {
      const url = isEdit
        ? `${API_URL}/channels/${channel.id}/templates/${existing.id}`
        : `${API_URL}/channels/${channel.id}/templates`
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, name: form.name.trim(), examples,
          header: header.enabled
            ? { format: header.format, text: header.text, example: header.example, handle: header.handle }
            : null,
          buttons
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (isEdit ? t('settings.templates.editFailed') : t('settings.templates.createFailed')))
      toast.success(isEdit ? t('settings.templates.editSubmitted') : t('settings.templates.createSubmitted'))
      onCreated()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[440px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-2">
          <p className="text-sm font-semibold text-fg">{isEdit ? t('settings.templates.editTitleModal') : t('settings.templates.newTemplate')}</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isEdit && existing.status === 'REJECTED' && existing.rejected_reason && (
            <div className="bg-danger/10 rounded-xl px-3 py-2.5">
              <p className="text-[11px] font-semibold text-danger mb-0.5">{t('settings.templates.rejectedByMeta')}</p>
              <p className="text-[11px] text-danger leading-relaxed">{existing.rejected_reason}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">{t('settings.templates.nameLabel')}</label>
            <input value={form.name} disabled={isEdit}
              onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="booking_reminder"
              className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60" />
            <p className="text-[11px] text-fg-subtle mt-1">
              {isEdit ? t('settings.templates.nameHintEdit') : t('settings.templates.nameHintNew')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-fg mb-1.5">{t('settings.templates.languageLabel')}</label>
              <select value={form.language} disabled={isEdit} onChange={e => setForm({ ...form, language: e.target.value })}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none disabled:opacity-60">
                {TEMPLATE_LANGS.map(l => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-fg mb-1.5">{t('settings.templates.categoryLabel')}</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none">
                <option value="UTILITY">{t('settings.templates.category.utility')}</option>
                <option value="MARKETING">{t('settings.templates.category.marketing')}</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-fg-subtle -mt-2">
            {t('settings.templates.categoryHint')}
          </p>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-fg">{t('settings.templates.bodyLabel')}</label>
              <button onClick={addVariable} className="text-[11px] text-brand hover:underline">{t('settings.templates.addVariable')}</button>
            </div>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
              rows={4} placeholder={t('settings.templates.bodyPlaceholder', { interpolation: { prefix: '[[', suffix: ']]' } })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
            <p className="text-[11px] text-fg-subtle mt-1">
              {t('settings.templates.variableUsageHint', { interpolation: { prefix: '[[', suffix: ']]' } })}
            </p>
          </div>

          {varCount > 0 && (
            <div className="space-y-2 bg-surface-3/50 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-fg">{t('settings.templates.examplesHeading')}</p>
              <p className="text-[11px] text-fg-subtle -mt-1">{t('settings.templates.examplesHint')}</p>
              {Array.from({ length: varCount }, (_, i) => (
                <input key={i} value={examples[i] || ''}
                  onChange={e => { const next = [...examples]; next[i] = e.target.value; setExamples(next) }}
                  placeholder={t('settings.templates.exampleForVariable', { n: i + 1, interpolation: { prefix: '[[', suffix: ']]' } })}
                  className="w-full bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              ))}
            </div>
          )}

          <div className="pt-1 border-t border-surface-3">
            <p className="text-xs font-semibold text-fg pt-3 mb-2.5">{t('settings.templates.optionalComponents')}</p>

            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={header.enabled}
                onChange={e => setHeader({ ...header, enabled: e.target.checked })}
                className="accent-brand w-3.5 h-3.5" />
              <span className="text-xs text-fg">{t('settings.templates.headerLabel')}</span>
            </label>
            {header.enabled && (
              <div className="ms-5 mb-3 space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {[['TEXT', t('settings.templates.mediaType.text')], ['IMAGE', t('settings.templates.mediaType.image')], ['VIDEO', t('settings.templates.mediaType.video')], ['DOCUMENT', t('settings.templates.mediaType.document')], ['LOCATION', t('settings.templates.mediaType.location')]].map(([val, label]) => (
                    <button key={val} onClick={() => setHeader({ ...header, format: val, handle: '', fileName: '' })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${header.format === val ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format) && (
                  <div className="space-y-1.5">
                    <input type="file" ref={sampleInputRef} onChange={pickSample} className="hidden"
                      accept={header.format === 'IMAGE' ? 'image/*' : header.format === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'} />
                    <button onClick={() => sampleInputRef.current?.click()} disabled={uploadingSample}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
                      {uploadingSample ? (
                        <><div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" /> {t('settings.templates.uploading')}</>
                      ) : header.handle ? (
                        <><Check size={13} className="text-success" /> {header.fileName || t('settings.templates.sampleUploaded')} {t('settings.templates.changeSampleSuffix')}</>
                      ) : (
                        <><Paperclip size={13} /> {t('settings.templates.uploadSampleButton')}</>
                      )}
                    </button>
                    <p className="text-[11px] text-fg-subtle leading-relaxed">
                      {t('settings.templates.sampleHint')}
                    </p>
                  </div>
                )}

                {header.format === 'TEXT' && (
                  <>
                    <input value={header.text} onChange={e => setHeader({ ...header, text: e.target.value })}
                      placeholder={t('settings.templates.headerTextPlaceholder')}
                      className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                    {/\{\{1\}\}/.test(header.text) && (
                      <input value={header.example} onChange={e => setHeader({ ...header, example: e.target.value })}
                        placeholder={t('settings.templates.headerExamplePlaceholder')}
                        className="w-full bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mb-2">
              <label className="block text-xs text-fg mb-1.5">{t('settings.templates.footerLabel')}</label>
              <input value={form.footer} onChange={e => setForm({ ...form, footer: e.target.value })}
                placeholder={t('login.brand')}
                className="w-full bg-surface-3 rounded-xl px-3 py-2 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-fg">{t('settings.templates.buttonsLabel')}</span>
                {buttons.length < 3 && (
                  <div className="flex gap-1.5">
                    {(!buttonKind || buttonKind === 'QUICK_REPLY') && (
                      <button onClick={() => addButton('QUICK_REPLY')} className="text-[11px] text-brand hover:underline">{t('settings.templates.addQuickReply')}</button>
                    )}
                    {(!buttonKind || buttonKind === 'CTA') && (
                      <>
                        <button onClick={() => addButton('URL')} className="text-[11px] text-brand hover:underline">{t('settings.templates.addUrlButton')}</button>
                        <button onClick={() => addButton('PHONE_NUMBER')} className="text-[11px] text-brand hover:underline">{t('settings.templates.addPhoneButton')}</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {buttonKind && (
                <p className="text-[11px] text-fg-subtle mb-1.5">
                  {buttonKind === 'QUICK_REPLY'
                    ? t('settings.templates.quickReplyHint')
                    : t('settings.templates.buttonMixHint')}
                </p>
              )}
              <div className="space-y-1.5">
                {buttons.map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={b.text} onChange={e => updateButton(i, { text: e.target.value })}
                      placeholder={b.type === 'URL' ? t('settings.templates.buttonTextPlaceholder') : b.type === 'PHONE_NUMBER' ? t('settings.templates.buttonTextPlaceholder') : t('settings.templates.replyTextPlaceholder')}
                      className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                    {b.type === 'URL' && (
                      <input value={b.url} onChange={e => updateButton(i, { url: e.target.value })}
                        placeholder="https://..." dir="ltr"
                        className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                    )}
                    {b.type === 'PHONE_NUMBER' && (
                      <input value={b.phone_number} onChange={e => updateButton(i, { phone_number: e.target.value })}
                        placeholder="+9715..." dir="ltr"
                        className="flex-1 min-w-0 bg-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
                    )}
                    <button onClick={() => removeButton(i)}
                      className="w-6 h-6 flex items-center justify-center text-fg-subtle hover:text-danger rounded-lg flex-shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-1 border-t border-surface-3">
            <p className="text-xs font-semibold text-fg pt-3 mb-2">{t('settings.templates.previewHeading')}</p>
            <TemplatePreview header={header} body={form.body} footer={form.footer} buttons={buttons} />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-50">
              {t('settings.common.cancel')}
            </button>
            <button onClick={submit} disabled={saving || !form.name.trim() || !form.body.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white disabled:opacity-40 flex items-center justify-center gap-2">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : isEdit ? t('settings.templates.submitEdit') : t('settings.templates.submitNew')}
            </button>
          </div>
        </div>
      </div>
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
    script.onerror = () => reject(new Error(i18n.t('settings.channels.fbSdkLoadFailed')))
    document.body.appendChild(script)
  })
  return fbSdkPromise
}

function ConnectNewChannel() {
  const { t } = useTranslation()
  const toast = useToast()
  const { agent } = useAuth()
  const [connecting, setConnecting] = useState(null)
  const [qrModal, setQrModal] = useState(null) // { channelId, qr, status }

  const connectWhatsApp = async () => {
    if (!WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) {
      toast.error(t('settings.channels.missingWaConfig'))
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
          toast.error(t('settings.channels.linkCancelledOrError'))
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
      toast.error(t('settings.channels.missingFbConfig'))
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
          toast.error(t('settings.channels.linkCancelledOrError'))
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
      const res = await apiFetch(`${API_URL}/channels/facebook/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_access_token: userAccessToken, agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.linkPageFailed'))
      toast.success(t('settings.channels.fbPagesLinked', { count: data.channels?.length || 1 }))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setConnecting(null)
    }
  }

  const connectInstagram = () => {
    if (!INSTAGRAM_APP_ID) {
      toast.error(t('settings.channels.missingIgConfig'))
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

  // فلو تيك توك أبسط من الباقي — التحويل بيروح للباك إند مباشرة (مش للفرونت إند) اللي بيبدّل
  // الكود بتوكن ويحفظ القناة لوحده، فمش محتاجين أي معالجة رجوع هنا خالص.
  // مهم: ده رابط "TikTok account holder" (tiktok.com/v2/auth) مش رابط المعلنين (business-api.tiktok.com/portal/auth)
  // — ده الوحيد اللي بيطلب صلاحيات الرسايل (message.list.*)، والتاني بيرفض الربط أصلاً
  const connectTiktok = () => {
    if (!TIKTOK_APP_ID) {
      toast.error(t('settings.channels.missingTiktokConfig'))
      return
    }
    const redirectUri = `${API_URL}/tiktok/callback`
    const params = new URLSearchParams({
      client_key: TIKTOK_APP_ID,
      scope: TIKTOK_SCOPES,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: agent?.id || ''
    })
    window.location.href = `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`
  }

  // ربط رقم واتساب غير رسمي عن طريق QR (زي واتساب ويب) — نعمل صف "pending" فورًا في السيرفر،
  // ونفتح مودال بيعمل poll على /qr كل ٣ ثواني لحد ما الكود يظهر ويتمسح
  const connectWhatsappQr = async () => {
    setConnecting('whatsapp_qr')
    try {
      const res = await apiFetch(`${API_URL}/channels/whatsapp-qr/connect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.startLinkFailed'))
      setQrModal({ channelId: data.channel_id, qr: null, status: 'pending' })
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setConnecting(null)
    }
  }

  useEffect(() => {
    if (!qrModal?.channelId || qrModal.status !== 'pending') return
    let cancelled = false
    const poll = setInterval(async () => {
      try {
        const res = await apiFetch(`${API_URL}/channels/${qrModal.channelId}/qr`)
        const data = await res.json()
        if (cancelled) return
        if (data.status === 'active') {
          setQrModal(null)
          toast.success(t('settings.channels.waNumberLinked'))
        } else {
          setQrModal(prev => prev && { ...prev, qr: data.qr, status: data.status })
        }
      } catch { /* هيعاود المحاولة في التيك الجاي */ }
    }, 3000)
    return () => { cancelled = true; clearInterval(poll) }
  }, [qrModal?.channelId, qrModal?.status])

  const finishWhatsAppConnect = async (code, sessionInfo) => {
    try {
      const res = await apiFetch(`${API_URL}/channels/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, waba_id: sessionInfo.waba_id, phone_number_id: sessionInfo.phone_number_id,
          agent_id: agent?.id
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.channels.linkNumberFailed'))
      toast.success(t('settings.channels.waNumberLinked'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setConnecting(null)
    }
  }

  return (
    <>
    <div className="space-y-3 pt-1">
      <p className="text-xs text-fg-subtle -mt-1">{t('settings.channels.connectDesc')}</p>
      {['facebook', 'instagram', 'whatsapp', 'tiktok', 'whatsapp_qr'].map(platform => {
        const meta = PLATFORM_META[platform]
        const Icon = meta.icon
        const isReady = platform === 'whatsapp' || platform === 'instagram' || platform === 'facebook' || platform === 'tiktok' || platform === 'whatsapp_qr'
        const isConnecting = connecting === platform
        const handlers = { whatsapp: connectWhatsApp, instagram: connectInstagram, facebook: connectFacebook, tiktok: connectTiktok, whatsapp_qr: connectWhatsappQr }
        return (
          <button key={platform}
            disabled={!isReady || isConnecting}
            onClick={isReady ? handlers[platform] : undefined}
            className={`w-full flex items-center gap-3 bg-surface-2 rounded-2xl p-4 border border-surface-3 transition-colors ${!isReady ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-3'}`}>
            <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
              <Icon size={16} className={meta.color} />
            </div>
            <span className="flex-1 text-start text-sm text-fg font-medium">{t('settings.channels.connectButton', { platform: t(meta.labelKey) })}</span>
            {isReady ? (
              isConnecting && <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin flex-shrink-0" />
            ) : (
              <span className="text-[11px] text-fg-subtle flex-shrink-0">{t('settings.common.comingSoon')}</span>
            )}
          </button>
        )
      })}
    </div>

    {qrModal && (
      <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60" onClick={() => setQrModal(null)}>
        <div onClick={e => e.stopPropagation()}
          className="bg-surface-2 rounded-t-2xl lg:rounded-2xl w-full lg:w-[440px] max-h-[85vh] overflow-y-auto">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-2 z-10">
            <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
              <QrCode size={15} className="text-emerald-400" />
            </div>
            <p className="flex-1 text-sm font-semibold text-fg">{t('settings.channels.qrModalTitle')}</p>
            <button onClick={() => setQrModal(null)} className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex flex-col items-center gap-3">
            {qrModal.qr ? (
              <img src={qrModal.qr} alt="QR" className="w-56 h-56 rounded-xl bg-white p-2" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <p className="text-xs text-fg-subtle text-center">
              {t('settings.channels.qrInstructions1')}
              <br />{t('settings.channels.qrInstructions2')}
            </p>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Lifecycle Tab ────────────────────────────────────────
function LifecycleTab() {
  const { t } = useTranslation()
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
    if (!confirm(t('settings.lifecycle.deleteConfirm'))) return
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
        <h2 className="font-semibold text-fg">{t('settings.lifecycle.title')}</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.common.add')}
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label={t('settings.lifecycle.nameLabel')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <InputField label={t('settings.lifecycle.emojiLabel')} value={form.icon} onChange={v => setForm({ ...form, icon: v })} placeholder="🔥" />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.common.colorLabel')}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg bg-surface-3 border border-surface-3 cursor-pointer" />
              <span className="text-sm text-fg-muted">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">{t('settings.common.add')}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">{t('settings.common.cancel')}</button>
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
// ─── الشرائح (Segments) ────────────────────────────────────
// إدارة الشرائح فقط: إنشاء/تعديل/حذف تعريف الفلتر — من غير عرض أي قائمة محادثات أو عملاء خلفها.
// الشريحة نفسها بتُستخدم كهدف (target) في شاشة الإرسال الجماعي (Broadcast)
function SegmentsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [segments, setSegments] = useState([])
  const [lifecycles, setLifecycles] = useState([])
  const [tagsList, setTagsList] = useState([])
  const [allChannels, setAllChannels] = useState([])
  const [countryOptions, setCountryOptions] = useState([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingSegment, setEditingSegment] = useState(null)

  const loadSegments = async () => {
    try {
      const res = await apiFetch(`${API_URL}/segments`)
      const data = await res.json()
      if (res.ok) setSegments(data.segments || [])
    } catch { /* هتفضل القايمة زي ما هي */ }
  }

  useEffect(() => {
    loadSegments()
    supabase.from('lifecycle_stages').select('*').order('stage_order').then(({ data }) => setLifecycles(data || []))
    supabase.from('tags').select('id, name, color').order('name').then(({ data }) => setTagsList(data || []))
    apiFetch(`${API_URL}/channels`).then(r => r.json()).then(d => setAllChannels((d.channels || []).filter(c => c.id && c.status === 'active'))).catch(() => {})
    apiFetch(`${API_URL}/reports/countries`).then(r => r.json()).then(d => setCountryOptions((d.rows || []).filter(r => r.country))).catch(() => {})
  }, [])

  const remove = async (seg) => {
    if (!confirm(t('settings.segments.deleteConfirm', { name: seg.name }))) return
    try {
      const res = await apiFetch(`${API_URL}/segments/${seg.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSegments(prev => prev.filter(s => s.id !== seg.id))
    } catch {
      toast.error(t('settings.segments.deleteError'))
    }
  }

  // شاشة ثابتة داخل نفس التاب (مش ديالوج عائم) — لما تبني/تعدّل شريحة، القايمة بتتخبى ومكانها
  // بياخده الباني بعرض كامل، وترجع القايمة تاني لما تقفل أو تحفظ
  if (showBuilder) {
    return (
      <div className="p-4">
        <SegmentBuilder
          segment={editingSegment}
          lifecycles={lifecycles}
          tagsList={tagsList}
          allChannels={allChannels}
          countryOptions={countryOptions}
          onClose={() => setShowBuilder(false)}
          onSaved={(saved) => {
            setShowBuilder(false)
            setSegments(prev => {
              const exists = prev.some(s => s.id === saved.id)
              return exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
            })
          }}
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.tabs.segments')}</h2>
        <button onClick={() => { setEditingSegment(null); setShowBuilder(true) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.segments.newSegment')}
        </button>
      </div>

      {segments.map(seg => (
        <div key={seg.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <Filter size={16} className="text-fg-subtle flex-shrink-0" />
          <span className="flex-1 text-sm text-fg truncate">{seg.name}</span>
          <button onClick={() => { setEditingSegment(seg); setShowBuilder(true) }} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
          <button onClick={() => remove(seg)} className="text-fg-muted hover:text-danger"><Trash2 size={14} /></button>
        </div>
      ))}
      {segments.length === 0 && (
        <p className="text-center text-fg-subtle text-sm py-6">{t('settings.segments.empty')}</p>
      )}
    </div>
  )
}

function TagsTab() {
  const { t } = useTranslation()
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
    if (error) { toast.error(t('settings.tags.duplicateOrError')); return }
    setForm({ name: '', color: '#6366F1' })
    setShowAdd(false)
    loadTags()
  }

  const remove = async (id) => {
    if (!confirm(t('settings.tags.deleteConfirm'))) return
    await supabase.from('contact_tags').delete().eq('tag_id', id)
    await supabase.from('tags').delete().eq('id', id)
    loadTags()
  }

  const startEdit = (tg) => { setEditingId(tg.id); setEditName(tg.name) }
  const saveEdit = async () => {
    if (!editName.trim()) return
    const { error } = await supabase.from('tags').update({ name: editName.trim() }).eq('id', editingId)
    if (error) { toast.error(t('settings.tags.duplicateOrError')); return }
    setEditingId(null)
    loadTags()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.tabs.tags')}</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.common.add')}
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label={t('settings.tags.nameLabel')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.common.colorLabel')}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg bg-surface-3 border border-surface-3 cursor-pointer" />
              <span className="text-sm text-fg-muted">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">{t('settings.common.add')}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">{t('settings.common.cancel')}</button>
          </div>
        </div>
      )}

      {tags.map(tg => (
        <div key={tg.id} className="bg-surface-2 rounded-2xl p-4 flex items-center gap-3 border border-surface-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tg.color }} />
          {editingId === tg.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
              <button onClick={saveEdit} className="text-success hover:brightness-110"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="text-fg-muted hover:text-fg"><X size={16} /></button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-fg">{tg.name}</span>
              <button onClick={() => startEdit(tg)} className="text-fg-muted hover:text-brand"><Edit2 size={14} /></button>
              <button onClick={() => remove(tg.id)} className="text-fg-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      ))}
      {tags.length === 0 && !showAdd && (
        <p className="text-center text-fg-subtle text-sm py-6">{t('settings.tags.empty')}</p>
      )}
    </div>
  )
}

// ─── Custom Fields Tab ────────────────────────────────────
function FieldsTab() {
  const { t } = useTranslation()
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
    if (!confirm(t('settings.fields.deleteConfirm'))) return
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

  const TYPES = {
    text: t('settings.fields.types.text'),
    select: t('settings.fields.types.select'),
    date: t('settings.fields.types.date'),
    number: t('settings.fields.types.number')
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.fields.title')}</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.common.add')}
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label={t('settings.fields.nameLabel')} value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.fields.typeLabel')}</label>
            <select value={form.field_type} onChange={e => setForm({ ...form, field_type: e.target.value })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {form.field_type === 'select' && (
            <InputField label={t('settings.fields.optionsLabel')} value={form.options} onChange={v => setForm({ ...form, options: v })} placeholder={t('settings.fields.optionsPlaceholder')} />
          )}
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium">{t('settings.common.add')}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">{t('settings.common.cancel')}</button>
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
  const { t } = useTranslation()
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
      toast.error(t('settings.quickReplies.nameAndContentRequired'))
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
      toast.error(t('settings.quickReplies.saveErrorPrefix', { message: err.message || t('settings.quickReplies.unknownError') }))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (qr) => {
    if (!confirm(t('settings.quickReplies.deleteConfirm'))) return
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
    if (error) { toast.error(t('settings.quickReplies.nameTakenOrError')); return }
    setEditingId(null)
    load()
  }

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">{t('settings.tabs.quickReplies')}</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium">
          <Plus size={14} /> {t('settings.common.add')}
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('settings.quickReplies.searchPlaceholder')}
          className="w-full bg-surface-3 rounded-xl py-2 px-4 ps-9 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>

      {showAdd && (
        <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
          <InputField label={t('settings.quickReplies.nameFieldLabel')} value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder={t('settings.quickReplies.namePlaceholder')} />
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.quickReplies.textLabel')}</label>
            <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} rows={3}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.quickReplies.fileLabel')}</label>
            <label className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg-muted cursor-pointer hover:text-fg">
              <Paperclip size={14} />
              {file ? file.name : t('settings.quickReplies.chooseFile')}
              <input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={e => setFile(e.target.files[0] || null)} />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={add} disabled={saving}
              className="flex-1 py-2.5 bg-brand rounded-xl text-sm text-white font-medium disabled:opacity-60">
              {saving ? t('settings.common.savingEllipsis') : t('settings.common.save')}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-3 rounded-xl text-sm text-fg-muted">{t('settings.common.cancel')}</button>
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
        <p className="text-center text-fg-subtle text-sm py-8">{t('settings.quickReplies.empty')}</p>
      )}
    </div>
  )
}

// ─── Round Robin Tab ──────────────────────────────────────
const DISTRIBUTION_MODES = [
  { key: 'least_busy', labelKey: 'settings.roundRobin.modes.leastBusy.label', descKey: 'settings.roundRobin.modes.leastBusy.desc' },
  { key: 'round_robin', labelKey: 'settings.roundRobin.modes.roundRobin.label', descKey: 'settings.roundRobin.modes.roundRobin.desc' },
]

function RoundRobinTab() {
  const { t } = useTranslation()
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
      <h2 className="font-semibold text-fg">{t('settings.roundRobin.title')}</h2>

      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <label className="block text-xs text-fg-muted mb-1">{t('settings.roundRobin.modeLabel')}</label>
        {DISTRIBUTION_MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`w-full text-start p-3 rounded-xl border transition-colors ${mode === m.key ? 'border-brand bg-brand/10' : 'border-surface-3 bg-surface-3'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${mode === m.key ? 'border-brand bg-brand' : 'border-fg-subtle'}`} />
              <span className="text-sm text-fg font-medium">{t(m.labelKey)}</span>
            </div>
            <p className="text-xs text-fg-subtle mt-1 ms-5.5">{t(m.descKey)}</p>
          </button>
        ))}

        <div className="bg-surface-3 rounded-xl p-3 space-y-1.5 text-xs text-fg-muted">
          <p className="font-medium text-fg-muted mb-2">{t('settings.roundRobin.mechanismHeading')}</p>
          <p>{t('settings.roundRobin.step1')}</p>
          <p>{t('settings.roundRobin.step2')}</p>
          <p>{t('settings.roundRobin.step3')}</p>
          <p>{t('settings.roundRobin.step4')}</p>
          <p>{t('settings.roundRobin.step5')}</p>
        </div>

        <button onClick={save} disabled={saving}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
          {saved ? t('settings.common.savedCheck') : t('settings.common.saveSettings')}
        </button>
      </div>

      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <Toggle
          label={t('settings.roundRobin.followupToggleLabel')}
          sublabel={t('settings.roundRobin.followupToggleSublabel')}
          value={followupEnabled}
          onChange={setFollowupEnabled}
        />
        {followupEnabled && (
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t('settings.roundRobin.minutesLabel')}</label>
            <input type="number" min={1} value={followupMinutes}
              onChange={e => setFollowupMinutes(parseInt(e.target.value) || 1)}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
            <p className="text-[11px] text-fg-subtle mt-1">{t('settings.roundRobin.minutesHint')}</p>
          </div>
        )}
        <button onClick={save} disabled={saving}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${saved ? 'bg-success text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
          {saved ? t('settings.common.savedCheck') : t('settings.common.saveSettings')}
        </button>
      </div>
    </div>
  )
}

// ─── AI Agent Tab ─────────────────────────────────────────
const AI_MODELS = [
  { value: 'claude-haiku-4-5', labelKey: 'settings.ai.models.claudeHaiku' },
  { value: 'claude-sonnet-4-5', labelKey: 'settings.ai.models.claudeSonnet' },
  { value: 'gpt-4o-mini', labelKey: 'settings.ai.models.gptMini' },
]

function AiAgentTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sources, setSources] = useState([])
  const [showAddSource, setShowAddSource] = useState(false)
  const [sourceForm, setSourceForm] = useState({ type: 'text', title: '', content: '', url: '' })
  const [usage, setUsage] = useState({ tokens: 0, cost: 0, agent: { tokens: 0, cost: 0 }, reports: { tokens: 0, cost: 0 } })
  const [testContacts, setTestContacts] = useState([]) // [{ id, name, phone, platform }]
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
    if (s?.test_contact_ids?.length) {
      const { data: c } = await supabase.from('contacts').select('id, name, phone, platform').in('id', s.test_contact_ids)
      setTestContacts(c || [])
    } else {
      setTestContacts([])
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
    if (testContacts.some(t => t.id === c.id)) { setTestContactQuery(''); setTestContactResults([]); return }
    const next = [...testContacts, c]
    setTestContacts(next)
    setSettings(prev => ({ ...prev, test_contact_ids: next.map(t => t.id) }))
    setTestContactQuery('')
    setTestContactResults([])
  }

  const removeTestContact = (id) => {
    const next = testContacts.filter(t => t.id !== id)
    setTestContacts(next)
    setSettings(prev => ({ ...prev, test_contact_ids: next.map(t => t.id) }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const { id, updated_at, ...updates } = settings
      const { error } = await supabase.from('ai_settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      toast.success(t('settings.ai.settingsSaved'))
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  const [savingSource, setSavingSource] = useState(false)
  const [refreshingId, setRefreshingId] = useState(null)

  // مصادر النوع "رابط" بتتحمّل وتتحوّل لنص مرة واحدة هنا وقت الإضافة (على السيرفر)، وبعد كده
  // النص المخزّن ده هو اللي بيتحط في تعليمات الـ AI — مش بيعيد قراءة الصفحة في كل رسالة
  const addSource = async () => {
    if (!sourceForm.title.trim()) { toast.error(t('settings.ai.sourceTitleRequired')); return }
    if (sourceForm.type === 'text' && !sourceForm.content.trim()) { toast.error(t('settings.ai.contentRequired')); return }
    if (sourceForm.type === 'link' && !sourceForm.url.trim()) { toast.error(t('settings.ai.urlRequired')); return }
    setSavingSource(true)
    try {
      const res = await apiFetch(`${API_URL}/ai/knowledge-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.ai.addSourceFailed'))
      setSourceForm({ type: 'text', title: '', content: '', url: '' })
      setShowAddSource(false)
      toast.success(sourceForm.type === 'link' ? t('settings.ai.pageLoadedAndSaved') : t('settings.ai.sourceAdded'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setSavingSource(false)
    }
  }

  const refreshSource = async (id) => {
    setRefreshingId(id)
    try {
      const res = await apiFetch(`${API_URL}/ai/knowledge-sources/${id}/refresh`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.ai.refreshSourceFailed'))
      toast.success(t('settings.ai.pageRefreshed'))
      load()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setRefreshingId(null)
    }
  }

  const removeSource = async (id) => {
    if (!confirm(t('settings.ai.deleteSourceConfirm'))) return
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
        <h2 className="font-semibold text-fg flex items-center gap-2"><Bot size={18} /> {t('settings.tabs.ai')}</h2>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand rounded-xl text-xs text-white font-medium disabled:opacity-60">
          <Save size={14} /> {saving ? t('settings.common.savingEllipsis') : t('settings.common.save')}
        </button>
      </div>

      {/* تفعيل + الموديل */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <Toggle
          label={t('settings.ai.enableToggleLabel')}
          sublabel={t('settings.ai.enableToggleSublabel')}
          value={settings.enabled}
          onChange={v => setSettings({ ...settings, enabled: v })}
        />
        <div>
          <label className="block text-xs text-fg-muted mb-1">{t('settings.ai.modelLabel')}</label>
          <select value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand">
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1">{t('settings.ai.channelScopeLabel')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSettings({ ...settings, channel_scope: 'all' })}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm border transition-colors ${(settings.channel_scope || 'all') === 'all' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
              {t('settings.ai.allChannels')}
            </button>
            <button
              onClick={() => setSettings({ ...settings, channel_scope: 'specific' })}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm border transition-colors ${settings.channel_scope === 'specific' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
              {t('settings.ai.specificChannels')}
            </button>
          </div>
          {settings.channel_scope === 'specific' && (
            <div className="mt-2 space-y-1.5">
              {channels.length === 0 ? (
                <p className="text-[11px] text-fg-subtle">{t('settings.ai.noChannelsConnected')}</p>
              ) : channels.map(c => {
                const checked = (settings.allowed_channel_ids || []).includes(c.id)
                const label = `${PLATFORM_META[c.platform]?.labelKey ? t(PLATFORM_META[c.platform].labelKey) : c.platform} — ${c.custom_name || c.display_name || c.id}`
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
              <p className="text-[11px] text-fg-subtle">{t('settings.ai.specificChannelsHint')}</p>
            </div>
          )}
        </div>
      </div>

      {/* وضع الاختبار */}
      <div className="bg-follow/5 rounded-2xl p-4 space-y-3 border border-follow/30">
        <Toggle
          label={t('settings.ai.testModeLabel')}
          sublabel={t('settings.ai.testModeSublabel')}
          value={settings.test_mode}
          onChange={v => setSettings({ ...settings, test_mode: v })}
        />
        {settings.test_mode && (
          <div className="space-y-2">
            {testContacts.map(tc => (
              <div key={tc.id} className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{tc.name || t('settings.common.noName')}</p>
                  <p className="text-[11px] text-fg-subtle truncate">{tc.phone || tc.platform}</p>
                </div>
                <button onClick={() => removeTestContact(tc.id)} className="text-fg-muted hover:text-danger flex-shrink-0"><X size={16} /></button>
              </div>
            ))}
            <div className="relative">
              <input value={testContactQuery} onChange={e => searchTestContacts(e.target.value)}
                placeholder={t('settings.ai.testContactSearchPlaceholder')}
                className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand" />
              {testContactQuery && (
                <div className="absolute inset-x-0 top-full mt-1 bg-surface border border-surface-3 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
                  {searchingContact ? (
                    <p className="text-xs text-fg-subtle text-center py-3">{t('settings.ai.searching')}</p>
                  ) : testContactResults.length === 0 ? (
                    <p className="text-xs text-fg-subtle text-center py-3">{t('settings.common.noResults')}</p>
                  ) : testContactResults.map(c => (
                    <button key={c.id} onClick={() => pickTestContact(c)}
                      className="flex flex-col w-full px-3 py-2.5 hover:bg-surface-3 text-start border-t border-surface-3 first:border-t-0">
                      <span className="text-sm text-fg">{c.name || t('settings.common.noName')}</span>
                      <span className="text-[11px] text-fg-subtle">{c.phone || c.platform}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              {t('settings.ai.testContactsHint')}
            </p>
          </div>
        )}
      </div>

      {/* التعليمات */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-2 border border-surface-3">
        <label className="block text-xs text-fg-muted">{t('settings.ai.systemPromptLabel')}</label>
        <textarea
          value={settings.system_prompt || ''}
          onChange={e => setSettings({ ...settings, system_prompt: e.target.value })}
          rows={8}
          placeholder={t('settings.ai.systemPromptPlaceholder')}
          className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-y leading-relaxed"
        />
      </div>

      {/* الصلاحيات */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <h3 className="text-sm font-semibold text-fg">{t('settings.ai.permissionsHeading')}</h3>
        <Toggle label={t('settings.ai.permAssign')} value={settings.can_assign} onChange={v => setSettings({ ...settings, can_assign: v })} />
        <Toggle label={t('settings.ai.permLifecycle')} value={settings.can_update_lifecycle} onChange={v => setSettings({ ...settings, can_update_lifecycle: v })} />
        <Toggle label={t('settings.ai.permContact')} value={settings.can_update_contact} onChange={v => setSettings({ ...settings, can_update_contact: v })} />
        <Toggle label={t('settings.ai.permTags')} value={settings.can_update_tags} onChange={v => setSettings({ ...settings, can_update_tags: v })} />
      </div>

      {/* سقف الاستهلاك الشهري */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <MaxConversationsField
          value={settings.monthly_token_budget}
          onChange={v => setSettings({ ...settings, monthly_token_budget: v })}
        />
        <p className="text-[11px] text-fg-subtle -mt-2">{t('settings.ai.budgetHint')}</p>
      </div>

      {/* سقف لكل محادثة */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs text-fg-muted">{t('settings.ai.perConversationCapLabel')}</label>
          <button type="button" onClick={() => setSettings({ ...settings, conversation_limit_value: settings.conversation_limit_value == null ? 20000 : null })}
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${settings.conversation_limit_value == null ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
            {settings.conversation_limit_value == null ? t('settings.common.unlimited') : t('settings.common.limited')}
          </button>
        </div>
        {settings.conversation_limit_value != null && (
          <>
            <div className="flex gap-2">
              <button onClick={() => setSettings({ ...settings, conversation_limit_type: 'tokens' })}
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${(settings.conversation_limit_type || 'tokens') === 'tokens' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
                {t('settings.ai.tokenUnit')}
              </button>
              <button onClick={() => setSettings({ ...settings, conversation_limit_type: 'cost' })}
                className={`flex-1 rounded-xl px-3 py-2 text-sm border transition-colors ${settings.conversation_limit_type === 'cost' ? 'bg-brand/15 border-brand text-brand' : 'bg-surface-3 border-transparent text-fg-muted'}`}>
                {t('settings.ai.unitDollar')}
              </button>
            </div>
            <input type="number" step={settings.conversation_limit_type === 'cost' ? '0.01' : '1'} value={settings.conversation_limit_value ?? ''}
              onChange={e => setSettings({ ...settings, conversation_limit_value: parseFloat(e.target.value) || 0 })}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </>
        )}
        <p className="text-[11px] text-fg-subtle">{t('settings.ai.perConversationCapHint')}</p>
      </div>

      {/* استهلاك الشهر الحالي */}
      <div className="bg-surface-2 rounded-2xl p-4 border border-surface-3">
        <h3 className="text-sm font-semibold text-fg mb-2">{t('settings.ai.usageHeading')}</h3>
        {usage.tokens === 0 ? (
          <p className="text-xs text-fg-subtle">{t('settings.ai.noUsageYet')}</p>
        ) : (
          <>
            <div className="flex gap-4">
              <div>
                <p className="text-lg font-bold text-fg">{formatNumber(usage.tokens)}</p>
                <p className="text-[11px] text-fg-subtle">{t('settings.ai.tokenUnit')}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-fg">${usage.cost.toFixed(2)}</p>
                <p className="text-[11px] text-fg-subtle">{t('settings.ai.approxCost')}</p>
              </div>
              {settings.monthly_token_budget ? (
                <div>
                  <p className="text-lg font-bold text-fg">{formatNumber(Math.max(0, settings.monthly_token_budget - usage.tokens))}</p>
                  <p className="text-[11px] text-fg-subtle">{t('settings.ai.remainingBudget')}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-3 flex gap-6">
              <div>
                <p className="text-[11px] text-fg-subtle mb-0.5">{t('settings.ai.usageAgentLabel')}</p>
                <p className="text-sm font-semibold text-fg">{formatNumber(usage.agent.tokens)} {t('settings.ai.tokenUnit')} — ${usage.agent.cost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-fg-subtle mb-0.5">{t('settings.ai.usageReportsLabel')}</p>
                <p className="text-sm font-semibold text-fg">{formatNumber(usage.reports.tokens)} {t('settings.ai.tokenUnit')} — ${usage.reports.cost.toFixed(2)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Knowledge Base */}
      <div className="bg-surface-2 rounded-2xl p-4 space-y-3 border border-surface-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2"><BookOpen size={15} /> {t('settings.ai.knowledgeSourcesHeading')}</h3>
          <button onClick={() => setShowAddSource(!showAddSource)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand rounded-lg text-[11px] text-white font-medium">
            <Plus size={12} /> {t('settings.common.add')}
          </button>
        </div>
        <p className="text-[11px] text-fg-subtle -mt-2">{t('settings.ai.knowledgeSourcesHint')}</p>

        {showAddSource && (
          <div className="bg-surface-3 rounded-xl p-3 space-y-2.5">
            <div className="flex gap-2">
              <button onClick={() => setSourceForm({ ...sourceForm, type: 'text' })}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium ${sourceForm.type === 'text' ? 'bg-brand text-white' : 'bg-surface text-fg-muted'}`}>
                <FileText size={13} /> {t('settings.ai.sourceType.text')}
              </button>
              <button onClick={() => setSourceForm({ ...sourceForm, type: 'link' })}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium ${sourceForm.type === 'link' ? 'bg-brand text-white' : 'bg-surface text-fg-muted'}`}>
                <Link2 size={13} /> {t('settings.ai.sourceType.link')}
              </button>
            </div>
            <InputField label={t('settings.ai.sourceTitleLabel')} value={sourceForm.title} onChange={v => setSourceForm({ ...sourceForm, title: v })} placeholder={t('settings.ai.sourceTitlePlaceholder')} />
            {sourceForm.type === 'text' ? (
              <div>
                <label className="block text-xs text-fg-muted mb-1">{t('settings.ai.contentLabel')}</label>
                <textarea value={sourceForm.content} onChange={e => setSourceForm({ ...sourceForm, content: e.target.value })}
                  rows={5} className="w-full bg-surface rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-y" />
              </div>
            ) : (
              <InputField label={t('settings.ai.urlLabel')} value={sourceForm.url} onChange={v => setSourceForm({ ...sourceForm, url: v })} placeholder="https://..." />
            )}
            <div className="flex gap-2">
              <button onClick={addSource} disabled={savingSource}
                className="flex-1 py-2 bg-brand rounded-lg text-xs text-white font-medium disabled:opacity-60">
                {savingSource ? (sourceForm.type === 'link' ? t('settings.ai.loadingPage') : t('settings.common.addingEllipsis')) : t('settings.common.add')}
              </button>
              <button onClick={() => setShowAddSource(false)} disabled={savingSource} className="px-3 py-2 bg-surface rounded-lg text-xs text-fg-muted">{t('settings.common.cancel')}</button>
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
                title={t('settings.ai.refreshPageTitle')} className="text-fg-muted hover:text-brand flex-shrink-0 disabled:opacity-50">
                <RefreshCw size={13} className={refreshingId === s.id ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={() => removeSource(s.id)} className="text-fg-muted hover:text-danger flex-shrink-0"><Trash2 size={13} /></button>
          </div>
        ))}
        {sources.length === 0 && !showAddSource && (
          <p className="text-center text-fg-subtle text-xs py-3">{t('settings.ai.noSourcesYet')}</p>
        )}
      </div>
    </div>
  )
}

// ─── Danger Zone ────────────────────────────────────────────
function DangerZoneTab() {
  const { t } = useTranslation()
  const WIPE_CONFIRM_PHRASE = t('settings.danger.wipeConfirmPhrase')
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
      toast.success(t('settings.danger.wiped'))
    } catch (err) {
      toast.error(t('settings.danger.wipeErrorPrefix', { message: err.message }))
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-fg">{t('settings.tabs.danger')}</h2>

      <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">{t('settings.danger.wipeTitle')}</p>
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">
              {t('settings.danger.wipeDescription')}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-muted mb-1">
            {t('settings.danger.typeToEnablePrefix')} "<b>{WIPE_CONFIRM_PHRASE}</b>" {t('settings.danger.typeToEnableSuffix')}
          </label>
          <input value={confirmText} onChange={e => { setConfirmText(e.target.value); setDone(false) }}
            placeholder={WIPE_CONFIRM_PHRASE}
            className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-danger" />
        </div>

        <button onClick={wipeAllData} disabled={confirmText !== WIPE_CONFIRM_PHRASE || wiping}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {wiping ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : done ? t('settings.danger.wipedButton') : (
            <><Trash2 size={15} /> {t('settings.danger.wipeButton')}</>
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
