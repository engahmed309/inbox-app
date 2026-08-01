import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase, API_URL } from '../lib/supabase'

const AuthContext = createContext(null)

// حل مؤقت لعطل عند Supabase: الجلسات (session tokens) اللي بيصدرها تسجيل الدخول حاليًا بترجع
// 401/406 في أي طلب بعدها، حتى لو الباسورد صح والبيانات والصلاحيات سليمة. الحل: نتحقق من الباسورد/جوجل
// عادي زي المعتاد (ده لسه شغال 100% عند Supabase)، وبمجرد ما ينجح، نمسح الجلسة المكسورة على طول
// ونكمل بمفتاح anon (اللي فتحنا له صلاحية مؤقتة في RLS) بدل الاعتماد على الجلسة نفسها. لازم نلغي
// الحيلة دي (هي وصلاحية RLS المصاحبة لها) أول ما عطل Supabase يتصلح رسميًا.
const ACTIVE_AGENT_KEY = 'active_agent_id'

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
    // لازم await هنا — كويري سوبابيز lazy، لو محدش عمل await/.then() ليها الطلب مبيتبعتش للسيرفر خالص
    await supabase.from('agent_status_log').insert({ agent_id: agentId, status, changed_at: now })
    setAgent(prev => prev && prev.id === agentId ? { ...prev, status, is_online: status === 'online', last_seen_at: now } : prev)
    // لما موظف يبقى متاح، حاول توزّع أي محادثات كانت مستنية موظف فاضي
    if (status === 'online') {
      fetch(`${API_URL}/rebalance`, { method: 'POST' }).catch(() => {})
    }
  }

  // بيتنفذ بعد ما نتأكد إن authUser فعلاً اتحقق منه (باسورد صح أو جوجل)، وبعد ما نكون مسحنا
  // الجلسة المكسورة بالفعل — فكل الاستعلامات هنا بتمشي بمفتاح anon
  async function finishLogin(authUser) {
    const ag = await loadAgent(authUser)
    if (!ag) {
      // اتسجل دخول بجوجل/باسورد صح بس مفيش دعوة له في النظام — نرفضه فوراً
      setUser(null)
      setAgent(null)
      setAuthError('الحساب ده مش مدعو لاستخدام النظام. تواصل مع الأدمن عشان يضيفك.')
      return
    }

    // بنزامن الاسم والصورة من حساب جوجل كل مرة يسجل دخول، عشان هويته في النظام تفضل مطابقة لحسابه الحقيقي
    const meta = authUser.user_metadata || {}
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

    localStorage.setItem(ACTIVE_AGENT_KEY, finalAgent.id)
    setAuthError('')
    setUser({ id: authUser.id, email: authUser.email })
    setAgent(finalAgent)
    // حالة الموظف (متاح/مشغول/غير متاح) بتتغير بس لما هو يدوس زرار تغيير الحالة يدوياً — مش
    // بتتفعّل أونلاين تلقائي مع كل ريفريش أو تسجيل دخول جديد. أول مرة بس (status لسه null) بنحطها أونلاين افتراضياً
    if (!finalAgent.status) setStatus(finalAgent.id, 'online')
  }

  // بيتحسب مرة واحدة وبيتنادى من getSession الأول ومن onAuthStateChange بعد كده، عشان منكررش
  // نفس منطق "هل الموظف ده مدعو فعلاً؟" في مكانين
  async function handleSession(session) {
    if (!session?.user) {
      setUser(null)
      setAgent(null)
      return
    }
    const authUser = session.user
    // نمسح الجلسة على طول — التحقق من الباسورد/جوجل نفسه اتأكد بنجاحه (وصلنا هنا أصلاً)، بس
    // الجلسة دي هترفض في أي طلب بعدها لو استخدمناها، فبنعتمد بدالها على مفتاح anon
    await supabase.auth.signOut()
    await finishLogin(authUser)
  }

  useEffect(() => {
    // لو عندنا موظف مسجل دخول محفوظ محليًا من قبل (بعد نجاح تحقق حقيقي)، رجّعه على طول من غير
    // ما نمر على نظام الجلسات المكسور خالص
    const savedAgentId = localStorage.getItem(ACTIVE_AGENT_KEY)
    if (savedAgentId) {
      supabase.from('agents').select('*').eq('id', savedAgentId).single().then(({ data, error }) => {
        if (error || !data) {
          localStorage.removeItem(ACTIVE_AGENT_KEY)
        } else {
          setUser({ id: data.auth_id || data.id, email: data.email })
          setAgent(data)
        }
        setLoading(false)
      })
      return
    }

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

  // نبضة حضور خفيفة (heartbeat) — بتسجل إن الموظف فعلاً فاتح التطبيق والتاب ظاهر قدامه، من غير
  // ما تلمس status خالص (الحالة يدوية بالكامل زي ما اتفقنا). التقارير بتستخدم النبضات دي عشان
  // تحسب "قعد شغال فعلياً من كام لحد كام" بدقة، حتى لو الموظف نسي يغيّر حالته بنفسه
  useEffect(() => {
    if (!agent?.id) return
    // لازم await/.then() هنا كمان لنفس السبب — من غيرها الـ insert مبيتنفذش خالص برغم إن الكود
    // شكله سليم، وده كان بيخلي جداول الحضور تفضل فاضية تمامًا
    const sendHeartbeat = async () => {
      if (document.visibilityState !== 'visible') return
      const { error } = await supabase.from('agent_heartbeats').insert({ agent_id: agent.id })
      if (error) console.error('heartbeat insert failed:', error.message)
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 90 * 1000)
    document.addEventListener('visibilitychange', sendHeartbeat)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', sendHeartbeat)
    }
  }, [agent?.id])

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
    localStorage.removeItem(ACTIVE_AGENT_KEY)
    setUser(null)
    setAgent(null)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, agent, loading, authError, signInWithGoogle, signInWithPassword, signOut, setStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
