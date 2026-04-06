import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/seeds/memory
 * 
 * MemFactory-inspired memory pipeline:
 * 1. Extract → structured memory items from user sessions
 * 2. Update → merge/conflict resolution
 * 3. Retrieve → adaptive layer-weighted context
 * 
 * Body: { query: string, user_id?: string, consolidate?: boolean, messages?: array }
 * Returns: { context: string, weights: object, pipeline_result?: object }
 */

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// ── In-memory store (per serverless instance) ──────────
// NOTE: Falls back to backend persistence for cross-instance continuity

interface MemoryItem {
  id: string
  key: string
  value: string
  memory_type: 'UserMemory' | 'LongTermMemory' | 'Episodic'
  tags: string[]
  stability_score: number
  access_count: number
  created: string
}

const sessionCache = new Map<string, { sessions: unknown[]; timestamp: number }>()

// ── Helpers ────────────────────────────────────────────

function similarity(query: string, text: string): number {
  const q = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const t = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  if (q.size === 0 || t.size === 0) return 0
  let overlap = 0
  for (const w of q) { if (t.has(w)) overlap++ }
  return overlap / (q.size + t.size - overlap)
}

function softmax(values: number[], beta: number): number[] {
  const exps = values.map(v => Math.exp(beta * v))
  const sum = exps.reduce((a, b) => a + b, 0)
  if (sum === 0) return values.map(() => 1 / values.length)
  return exps.map(e => e / sum)
}

function md5short(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36).slice(0, 10)
}

// ── Stage 1: Extract (heuristic) ──────────────────────

function extractMemories(text: string, source: string): MemoryItem[] {
  const sentences = text
    .replace(/\n/g, '. ')
    .split('.')
    .map(s => s.trim())
    .filter(s => s.length > 25)

  return sentences.slice(0, 8).map(sentence => {
    const key = sentence.slice(0, 60)
    const tags = sentence.split(/\s+/)
      .filter(w => w.length > 3 && /^[A-Z]/.test(w))
      .slice(0, 4)
      .map(w => w.toLowerCase())

    return {
      id: md5short(key + source),
      key,
      value: sentence,
      memory_type: 'UserMemory' as const,
      tags: tags.length > 0 ? tags : ['general'],
      stability_score: 1.0,
      access_count: 0,
      created: new Date().toISOString(),
    }
  })
}

// ── Fetch memories from backend ────────────────────────

async function fetchBackendMemories(token: string): Promise<MemoryItem[]> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/memory`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map((i: Record<string, unknown>, idx: number) => ({
      id: md5short(String(i.key || '') + String(idx)),
      key: String(i.key || ''),
      value: String(i.value || ''),
      memory_type: String(i.memory_type || 'UserMemory') as MemoryItem['memory_type'],
      tags: Array.isArray(i.tags) ? i.tags : [],
      stability_score: Number(i.stability_score) || 1.0,
      access_count: Number(i.access_count) || 0,
      created: String(i.created || new Date().toISOString()),
    }))
  } catch {
    return []
  }
}

async function storeBackendMemories(token: string, items: MemoryItem[]): Promise<void> {
  try {
    await fetch(`${BACKEND}/api/v1/memory/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        items: items.map(i => ({
          key: i.key,
          value: i.value,
          memory_type: i.memory_type,
          tags: i.tags,
          stability_score: i.stability_score,
        })),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {}
}

// ── Fetch sessions ─────────────────────────────────────

async function fetchSessions(userId: string, token: string): Promise<{ messages: unknown[]; summaries: string[] }> {
  const cacheKey = userId
  const cached = sessionCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < 30000) {
    return { messages: cached.sessions, summaries: [] }
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/sessions?limit=5`, {
      headers: { Authorization: `Bearer ${token || userId}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { messages: [], summaries: [] }

    const data = await res.json()
    const sessions = data.sessions || []
    sessionCache.set(cacheKey, { sessions, timestamp: Date.now() })

    const allMessages: unknown[] = []
    const summaries: string[] = []

    for (const session of sessions.slice(0, 3)) {
      try {
        const detailRes = await fetch(`${BACKEND}/api/v1/sessions/${session.id}`, {
          headers: { Authorization: `Bearer ${token || userId}` },
          signal: AbortSignal.timeout(3000),
        })
        if (!detailRes.ok) continue
        const detail = await detailRes.json()
        const msgs = detail.messages || []

        if (session === sessions[0]) {
          allMessages.push(...msgs.slice(-10))
        }

        const sessionText = msgs
          .map((m: Record<string, unknown>) => typeof m.content === 'string' ? m.content : '')
          .join(' ')
        const sentences = sessionText
          .split(/[.!?]+/)
          .filter((s: string) => s.trim().length > 20)
        summaries.push(sentences.slice(0, 3).join('. ').slice(0, 300))
      } catch {}
    }

    return { messages: allMessages, summaries }
  } catch {
    return { messages: [], summaries: [] }
  }
}

// ── Retrieve with adaptive weights ────────────────────

function retrieveWithWeights(
  query: string,
  store: MemoryItem[],
  workingMessages: string[],
  episodicSummaries: string[]
): { context: string; weights: Record<string, string> } {
  const beta = 2.0

  // Layer similarities
  const workingText = workingMessages.join(' ')
  const episodicText = episodicSummaries.join(' ')
  const semanticText = store
    .filter(i => i.memory_type === 'LongTermMemory')
    .map(i => `${i.key} ${i.value}`)
    .join(' ')

  const sims = {
    working: similarity(query, workingText),
    episodic: similarity(query, episodicText),
    semantic: similarity(query, semanticText || store.map(i => i.key).join(' ')),
  }

  const weights = softmax([sims.working, sims.episodic, sims.semantic], beta)
  const weightLabels: Record<string, string> = {
    working: `${(weights[0] * 100).toFixed(0)}%`,
    episodic: `${(weights[1] * 100).toFixed(0)}%`,
    semantic: `${(weights[2] * 100).toFixed(0)}%`,
  }

  const parts: string[] = []

  // Working layer
  if (weights[0] > 0.15 && workingText.length > 0) {
    const lines = workingMessages.slice(-5).map(m => m.slice(0, 150))
    parts.push(`**Recent** (${weightLabels.working}):\n${lines.join('\n')}`)
  }

  // Episodic layer
  if (weights[1] > 0.15 && episodicText.length > 0) {
    const lines = episodicSummaries.slice(0, 3).map(s => `- ${s.slice(0, 150)}`)
    parts.push(`**Past Sessions** (${weightLabels.episodic}):\n${lines.join('\n')}`)
  }

  // Semantic layer — structured memory items
  const relevantItems = store
    .filter(i => {
      const itemText = `${i.key} ${i.value} ${i.tags.join(' ')}`
      return similarity(query, itemText) > 0.05
    })
    .sort((a, b) => b.stability_score - a.stability_score)
    .slice(0, 5)

  if (relevantItems.length > 0) {
    const lines = relevantItems.map(i => {
      i.access_count++
      return `- **${i.key}**: ${i.value.slice(0, 120)}`
    })
    parts.push(`**Known Facts** (${weightLabels.semantic}):\n${lines.join('\n')}`)
  }

  if (parts.length === 0) return { context: '', weights: weightLabels }

  return {
    context: '---\n🧠 **Your Memory**:\n' + parts.join('\n\n') + '\n---',
    weights: weightLabels,
  }
}

// ── Route handler ──────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query, user_id, consolidate, messages } = body
    const token = req.headers.get('authorization') || ''
    const userId = user_id || 'default'

    // Consolidation mode: run full pipeline
    if (consolidate && messages && Array.isArray(messages)) {
      const conversationText = messages
        .map((m: Record<string, unknown>) => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : ''}`)
        .join('\n')
      const candidates = extractMemories(conversationText, `session_${Date.now()}`)

      // Store to backend (persistent)
      await storeBackendMemories(token, candidates)

      return NextResponse.json({
        pipeline_result: {
          extracted: candidates.length,
          stored: candidates.length,
        },
      })
    }

    // Retrieval mode
    if (!query || typeof query !== 'string' || query.length < 5) {
      return NextResponse.json({ context: '', weights: {}, reason: 'too_short' })
    }

    // Fetch from both in-memory and backend in parallel
    const [sessionData, backendMemories] = await Promise.all([
      fetchSessions(userId, token),
      fetchBackendMemories(token),
    ])

    // Build enriched context
    const workingTexts = (sessionData.messages as Array<Record<string, unknown>>)
      .map(m => typeof m.content === 'string' ? m.content : '')

    const { context, weights } = retrieveWithWeights(query, backendMemories, workingTexts, sessionData.summaries)

    return NextResponse.json({ context, weights, memory_items: backendMemories.length })
  } catch (err) {
    return NextResponse.json({ context: '', weights: {}, error: String(err) }, { status: 500 })
  }
}
