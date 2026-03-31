import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Auth helpers ────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/setup`,
  })
}

export async function getSession() {
  return supabase.auth.getSession()
}

export async function getUser() {
  return supabase.auth.getUser()
}

// ── Seed helpers ────────────────────────────────────────────────────────────

export async function createSeed(title: string, content: string, tags: string[] = []) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  return supabase.from('seeds').insert({
    user_id: user.id,
    title,
    content,
    tags,
  }).select().single()
}

export async function getSeeds(limit = 20, domain?: string) {
  let query = supabase.from('seeds').select('*').order('created_at', { ascending: false }).limit(limit)
  if (domain) query = query.eq('domain', domain)
  return query
}

export async function getSeed(id: string) {
  return supabase.from('seeds').select('*, ratings(*)').eq('id', id).single()
}

export async function deleteSeed(id: string) {
  return supabase.from('seeds').delete().eq('id', id)
}

export async function updateSeed(id: string, updates: Partial<{ title: string; content: string; tags: string[]; domain: string; energy: string }>) {
  return supabase.from('seeds').update(updates).eq('id', id).select().single()
}

export async function rateSeed(seedId: string, score: number, feedback?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  return supabase.from('ratings').upsert({
    user_id: user.id,
    seed_id: seedId,
    score,
    feedback,
  }, { onConflict: 'user_id,seed_id' }).select().single()
}

// ── Storage helpers ─────────────────────────────────────────────────────────

export async function uploadVoiceMemo(file: Blob, filename: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const path = `${user.id}/${filename}`
  return supabase.storage.from('voice-memos').upload(path, file, {
    contentType: 'audio/ogg',
    upsert: false,
  })
}

export async function uploadAttachment(file: Blob, filename: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const path = `${user.id}/${filename}`
  return supabase.storage.from('attachments').upload(path, file, {
    upsert: false,
  })
}

export function getVoiceMemoUrl(path: string) {
  return supabase.storage.from('voice-memos').createSignedUrl(path, 3600)
}

// ── Chat session helpers ────────────────────────────────────────────────────

export async function createChatSession(prompt: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  return supabase.from('chat_sessions').insert({
    user_id: user.id,
    prompt,
    status: 'active',
  }).select().single()
}

export async function completeChatSession(sessionId: string, toolsUsed: string[]) {
  return supabase.from('chat_sessions').update({
    status: 'completed',
    tools_used: toolsUsed,
    completed_at: new Date().toISOString(),
  }).eq('id', sessionId)
}

export async function logChatEvent(sessionId: string, kind: string, name: string, data: string) {
  return supabase.from('chat_events').insert({
    session_id: sessionId,
    kind,
    name,
    data,
  })
}
