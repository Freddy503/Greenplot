import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/seeds/memory
 * 
 * Multi-Layer Memory retrieval endpoint.
 * Enriches queries with the user's working/episodic/semantic memory layers.
 * 
 * Body: { query: string, user_id?: string }
 * Returns: { context: string, weights: object, retention: object }
 */

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Simple in-memory cache (per serverless instance)
const memoryCache = new Map<string, { context: string; weights: Record<string, string>; timestamp: number }>()
const CACHE_TTL = 30_000 // 30s

interface MemoryLayer {
  messages?: Array<{ role: string; content: string; timestamp: string }>
  summaries?: Array<{ summary: string; session_id: string; timestamp: string; weight: number }>
  entities?: Record<string, { name: string; entity_type: string; attributes: Record<string, unknown>; relations: string[]; stability_score: number }>
}

function similarity(query: string, text: string): number {
  const q = new Set(query.toLowerCase().split(/\s+/))
  const t = new Set(text.toLowerCase().split(/\s+/))
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

async function fetchUserMemory(userId: string): Promise<MemoryLayer> {
  // Fetch recent sessions from backend
  try {
    const res = await fetch(`${BACKEND}/api/v1/sessions?limit=5`, {
      headers: { Authorization: `Bearer ${userId}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return {}
    const data = await res.json()
    const sessions = data.sessions || []

    // Build memory layers from sessions
    const allMessages: MemoryLayer["messages"] = []
    const summaries: MemoryLayer["summaries"] = []

    for (const session of sessions.slice(0, 3)) {
      try {
        const detailRes = await fetch(`${BACKEND}/api/v1/sessions/${session.id}`, {
          headers: { Authorization: `Bearer ${userId}` },
          signal: AbortSignal.timeout(3000),
        })
        if (!detailRes.ok) continue
        const detail = await detailRes.json()
        const msgs = detail.messages || []

        // Working memory = last session's messages
        if (session === sessions[0]) {
          for (const m of msgs.slice(-10)) {
            allMessages.push({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              timestamp: m.timestamp || new Date().toISOString(),
            })
          }
        }

        // Episodic = session summaries
        const sessionText = msgs.map((m: any) => typeof m.content === 'string' ? m.content : '').join(" ")
        const sentences = sessionText.split(/[.!?]+/).filter((s: string) => s.trim().length > 20)
        summaries.push({
          summary: sentences.slice(0, 3).join(". ").slice(0, 300),
          session_id: session.id,
          timestamp: session.updated_at || session.created_at || new Date().toISOString(),
          weight: 1.0,
        })
      } catch {}
    }

    // Apply decay to summaries
    for (let i = 0; i < summaries.length; i++) {
      summaries[i].weight *= Math.pow(0.7, i)
    }

    return { messages: allMessages, summaries }
  } catch {
    return {}
  }
}

function buildMemoryContext(query: string, memory: MemoryLayer): { context: string; weights: Record<string, string> } {
  const beta = 2.0

  // Compute similarities
  const workingText = (memory.messages || []).map(m => m.content).join(" ")
  const episodicText = (memory.summaries || []).map(s => s.summary).join(" ")
  const semanticText = Object.values(memory.entities || {}).map(e => `${e.name} ${e.entity_type}`).join(" ")

  const sims = {
    working: similarity(query, workingText),
    episodic: similarity(query, episodicText),
    semantic: similarity(query, semanticText),
  }

  const weights = softmax([sims.working, sims.episodic, sims.semantic], beta)
  const weightMap = { working: weights[0], episodic: weights[1], semantic: weights[2] }
  const weightLabels: Record<string, string> = {
    working: `${(weights[0] * 100).toFixed(0)}%`,
    episodic: `${(weights[1] * 100).toFixed(0)}%`,
    semantic: `${(weights[2] * 100).toFixed(0)}%`,
  }

  // Build context from layers with meaningful weight
  const parts: string[] = []

  if (weights[0] > 0.15 && workingText.length > 0) {
    const lines = (memory.messages || []).slice(-5).map(m => `[${m.role}] ${m.content.slice(0, 150)}`)
    parts.push(`**Recent Conversation** (${weightLabels.working}):\n${lines.join("\n")}`)
  }

  if (weights[1] > 0.15 && episodicText.length > 0) {
    const sorted = [...(memory.summaries || [])].sort((a, b) => b.weight - a.weight).slice(0, 3)
    const lines = sorted.map(s => `- ${s.summary.slice(0, 150)}`)
    parts.push(`**Past Sessions** (${weightLabels.episodic}):\n${lines.join("\n")}`)
  }

  if (weights[2] > 0.15 && semanticText.length > 0) {
    const entities = Object.values(memory.entities || {}).slice(0, 5)
    const lines = entities.map(e => `- ${e.name} [${e.entity_type}]`)
    parts.push(`**Known Facts** (${weightLabels.semantic}):\n${lines.join("\n")}`)
  }

  if (parts.length === 0) return { context: "", weights: weightLabels }

  return {
    context: "---\n🧠 **From Your Memory**:\n" + parts.join("\n\n") + "\n---",
    weights: weightLabels,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, user_id } = await req.json()

    if (!query || typeof query !== "string" || query.length < 5) {
      return NextResponse.json({ context: "", weights: {}, reason: "too_short" })
    }

    // Check cache
    const cacheKey = `${user_id || "anon"}:${query.slice(0, 50)}`
    const cached = memoryCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ context: cached.context, weights: cached.weights, cached: true })
    }

    // Fetch memory layers
    const memory = await fetchUserMemory(user_id || "default")

    // Build adaptive context
    const { context, weights } = buildMemoryContext(query, memory)

    // Cache result
    if (context) {
      memoryCache.set(cacheKey, { context, weights, timestamp: Date.now() })
    }

    return NextResponse.json({ context, weights, cached: false })
  } catch (err) {
    return NextResponse.json({ context: "", weights: {}, error: String(err) }, { status: 500 })
  }
}
