import { createContext, useContext, useEffect, useState, useRef } from 'react'
import i18n from '../i18n'
import { supabase, API_URL, apiFetch } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  // بنفرّق بين "مفيش صف للموظف ده فعلاً" (يعني مش مدعو) و"الاستعلام نفسه فشل" (شبكة/سيرفر) —
  // قبل كده الاتنين كانوا بيرجعوا null، فالموظف الشرعي كان ممكن يتقاله "غير مدعو" غلط لمجرد
  // إن الشبكة تعثرت لحظة
  async function loadAgent(authUser) {
    if (!authUser) return null
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('auth_id', authUser.id)
      .maybeSingle()
    if (error) throw error
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
      apiFetch(`${API_URL}/rebalance`, { method: 'POST' }).catch(() => {})
    }
  }

  // بيتنفذ بعد ما نتأكد إن authUser فعلاً اتحقق منه (باسورد صح أو جوجل) — الجلسة الحقيقية شغالة
  // من هنا، فكل الاستعلامات بتمشي بهوية الموظف الموثّقة (role: authenticated) مش anon
  async function finishLogin(authUser) {
    const ag = await loadAgent(authUser)
    if (!ag) {
      // اتسجل دخول بجوجل/باسورد صح بس مفيش دعوة له في النظام — نرفضه فوراً
      setUser(null)
      setAgent(null)
      setAuthError(i18n.t('auth.notInvited'))
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
    await finishLogin(session.user)
  }

  useEffect(() => {
    // أي فشل أو تعليق في تحميل الجلسة (شبكة وحشة، أو السيرفر متعّب لحظيًا) كان بيسيب التطبيق واقف
    // على "جارٍ التحميل..." للأبد، لأن setLoading(false) كانت بعد await من غير catch ولا مهلة —
    // يعني عطل لحظي واحد كان بيقفل التطبيق على الموظف لحد ما يمسح بيانات الموقع بإيده. دلوقتي
    // بنضمن إننا نطلع من شاشة التحميل مهما حصل (أسوأ حالة: شاشة تسجيل الدخول ويجرّب تاني)
    let settled = false
    const finish = () => { if (!settled) { settled = true; setLoading(false) } }
    const timeout = setTimeout(finish, 12000)

    supabase.auth.getSession()
      .then(({ data }) => handleSession(data?.session))
      .catch(err => console.error('Session load failed:', err?.message))
      .finally(() => { clearTimeout(timeout); finish() })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          await handleSession(session)
        } else {
          if (agentRef.current) setStatus(agentRef.current.id, 'offline')
          setUser(null)
          setAgent(null)
        }
      } catch (err) {
        console.error('Auth state change failed:', err?.message)
      } finally {
        finish()
      }
    })

    return () => {
      clearTimeout(timeout)
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
