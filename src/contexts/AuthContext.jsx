import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase, API_URL } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  async function loadAgent(authUser) {
    if (!authUser) return null
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('auth_id', authUser.id)
      .single()
    return data
  }

  const agentRef = useRef(null)
  useEffect(() => { agentRef.current = agent }, [agent])

  async function setStatus(agentId, status) {
    if (!agentId) return
    const now = new Date().toISOString()
    await supabase.from('agents').update({ status, last_seen_at: now }).eq('id', agentId)
    // بنسجل كل تغيير حالة في لوج منفصل، عشان نقدر نبني تقرير حضور/غياب لاحقاً (من امتى لحد امتى كان أونلاين كل يوم)
    supabase.from('agent_status_log').insert({ agent_id: agentId, status, changed_at: now })
    setAgent(prev => prev && prev.id === agentId ? { ...prev, status, is_online: status === 'online', last_seen_at: now } : prev)
    // لما موظف يبقى متاح، حاول توزّع أي محادثات كانت مستنية موظف فاضي
    if (status === 'online') {
      fetch(`${API_URL}/rebalance`, { method: 'POST' }).catch(() => {})
    }
  }

  // بيتحسب مرة واحدة وبيتنادى من getSession الأول ومن onAuthStateChange بعد كده، عشان منكررش
  // نفس منطق "هل الموظف ده مدعو فعلاً؟" في مكانين
  async function handleSession(session) {
    if (!session?.user) {
      setUser(null)
      setAgent(null)
      return
    }
    const ag = await loadAgent(session.user)
    if (!ag) {
      // اتسجل دخول بجوجل بس مفيش دعوة ليه في النظام — نرفضه فوراً
      await supabase.auth.signOut()
      setUser(null)
      setAgent(null)
      setAuthError('الحساب ده مش مدعو لاستخدام النظام. تواصل مع الأدمن عشان يضيفك.')
      return
    }

    // بنزامن الاسم والصورة من حساب جوجل كل مرة يسجل دخول، عشان هويته في النظام تفضل مطابقة لحسابه الحقيقي
    const meta = session.user.user_metadata || {}
    const googleName = meta.full_name || meta.name
    const googleAvatar = meta.avatar_url || meta.picture
    const updates = {}
    if (googleName && googleName !== ag.name) updates.name = googleName
    if (googleAvatar && googleAvatar !== ag.avatar_url) updates.avatar_url = googleAvatar

    let finalAgent = ag
    if (Object.keys(updates).length) {
      const { data: updated } = await supabase.from('agents').update(updates).eq('id', ag.id).select().single()
      if (updated) finalAgent = updated
    }

    setAuthError('')
    setUser(session.user)
    setAgent(finalAgent)
    // حالة الموظف (متاح/مشغول/غير متاح) بتتغير بس لما هو يدوس زرار تغيير الحالة يدوياً — مش
    // بتتفعّل أونلاين تلقائي مع كل ريفريش أو تسجيل دخول جديد. أول مرة بس (status لسه null) بنحطها أونلاين افتراضياً
    if (!finalAgent.status) setStatus(finalAgent.id, 'online')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await handleSession(session)
      } else {
        if (agentRef.current) setStatus(agentRef.current.id, 'offline')
        setUser(null)
        setAgent(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) throw error
  }

  // مؤقتاً: دخول بإيميل وباسورد كمان، لحد ما مراجعة ميتا للتطبيق تخلص وقتها هنقفله ونسيب جوجل بس
  const signInWithPassword = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await handleSession(data.session)
  }

  const signOut = async () => {
    if (agent) await setStatus(agent.id, 'offline')
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, agent, loading, authError, signInWithGoogle, signInWithPassword, signOut, setStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
