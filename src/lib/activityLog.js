import { supabase } from './supabase'

export async function logActivity(conversationId, agentId, description) {
  if (!conversationId || !description) return
  await supabase.from('conversation_activity_log').insert({
    conversation_id: conversationId,
    agent_id: agentId || null,
    description
  })
}
