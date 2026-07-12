import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase, API_URL } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)

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
    await supabase.from('agents').update({ status }).eq('id', agentId)
    setAgent(prev => prev && prev.id === agentId ? { ...prev, status, is_online: status === 'online' } : prev)
    // لما موظف يبقى متاح، حاول توزّع أي محادثات كانت مستنية موظف فاضي
    if (status === 'online') {
      fetch(`${API_URL}/rebalance`, { method: 'POST' }).catch(() => {})
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const ag = await loadAgent(session.user)
        setAgent(ag)
        if (ag) setStatus(ag.id, 'online')
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const ag = await loadAgent(session.user)
        setAgent(ag)
        if (ag) setStatus(ag.id, 'online')
      } else {
        if (agentRef.current) setStatus(agentRef.current.id, 'offline')
        setAgent(null)
      }
    })

    const handleVisibility = () => {
      const ag = agentRef.current
      if (!ag || ag.status === 'busy') return
      setStatus(ag.id, document.hidden ? 'offline' : 'online')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', () => agentRef.current && setStatus(agentRef.current.id, 'offline'))

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    if (agent) await setStatus(agent.id, 'offline')
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, agent, loading, signIn, signOut, setStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
