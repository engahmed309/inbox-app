import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

  async function setOnline(agentId, status) {
    if (!agentId) return
    await supabase.from('agents').update({ is_online: status }).eq('id', agentId)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const ag = await loadAgent(session.user)
        setAgent(ag)
        if (ag) setOnline(ag.id, true)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const ag = await loadAgent(session.user)
        setAgent(ag)
        if (ag) setOnline(ag.id, true)
      } else {
        if (agent) setOnline(agent.id, false)
        setAgent(null)
      }
    })

    const handleVisibility = () => {
      if (agent) setOnline(agent.id, !document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', () => agent && setOnline(agent.id, false))

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
    if (agent) await setOnline(agent.id, false)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, agent, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
