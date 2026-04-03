import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080'

interface WeaviateSeed {
  title?: string | null
  domain?: string | null
  tags?: string | null
  summary?: string | null
  energy?: string | null
  text?: string | null
  _additional?: { score?: string | number | null }
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

// ── Intent classification ────────────────────────────────
// Determine if this message would benefit from garden enrichment.

type Intent = 'enrich' | 'skip'

function classifyIntent(text: string): Intent {
  const t = text.trim().toLowerCase()

  // Always skip: very short, greetings, commands, pure URLs
  if (t.length < 20) return 'skip'
  if (/^https?:\/\//.test(t)) return 'skip'
  if (/^\/\w+/.test(t)) return 'skip'
  if (/^(hi|hey|hello|yo|sup|ok|okay|yes|no|sure|thanks|ty|thx|got it|lol|haha|nice|cool|great)\b/.test(t)) return 'skip'

  // Skip: simple factual / operational questions
  if (/^(what('s| is) the (weather|time|date)|how('s| is) it going|what('?s| is) up|how are you)/.test(t)) return 'skip'
  if (/^(can you|could you|would you) (see|check|look at|open|go to|run|execute)/.test(t)) return 'skip'
  if (/^(remind me|set a (timer|reminder|alarm)|play |pause |stop )/.test(t)) return 'skip'

  // Skip: meta/app questions
  if (/^(who are you|what can you do|help|show me (the |your )?commands)/.test(t)) return 'skip'

  // Enrich: questions about concepts, ideas, strategies, architecture, learning
  const ENRICH_SIGNALS = [
    /\b(what|how|why|explain|describe|compare|contrast|difference|approach|strategy|pattern|architecture|design|structure|framework|concept|idea|opinion|thought|perspective|recommend|suggest|advice)\b/,
    /\b(build|create|implement|integrate|deploy|scale|optimize|improve|refactor|evaluate|assess|review)\b/,
    /\b(learn|understand|study|explore|research|investigate|analyze|break down|walk through)\b/,
    /\b(agentic|agent|rag|vector|embedding|llm|prompt|pipeline|workflow|automation|orchestrat|multi.agent)\b/,
    /\b(system|platform|tool|service|api|backend|frontend|database|infrastructure|architecture)\b/,
    /\b(knowledge|second.brain|pkm|garden|seed|enrich|connection|insight|pattern)\b/,
    /\b(career|interview|fde|enterprise|deployment|production)\b/,
  ]

  if (ENRICH_SIGNALS.some(p => p.test(t))) return 'enrich'

  // Default: if it's a multi-sentence question, enrich
  const sentences = t.split(/[.!?]+/).filter(s => s.trim().length > 5)
  if (sentences.length >= 2) return 'enrich'

  // Default skip for ambiguous short questions
  return 'skip'
}

// ── Weaviate search ──────────────────────────────────────

async function searchWeaviate(query: string, limit: number, token?: string): Promise<WeaviateSeed[]> {
  const gql = `{ Get { IdeaSeed(bm25: { query: ${JSON.stringify(query)}, properties: ["title", "summary", "tags", "domain", "text"] } limit: ${limit}) { title domain tags energy summary text _additional { score } } } }`

  // Try Weaviate directly (works on server, fails silently on Vercel)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${WEAVIATE_URL}/v1/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      const seeds = data?.data?.Get?.IdeaSeed
      if (seeds && seeds.length > 0) return seeds
    }
  } catch {}

  return []
}

// ── Build context block ──────────────────────────────────

function buildGardenContext(seeds: WeaviateSeed[]): string {
  if (seeds.length === 0) return ''

  const entries = seeds
    .filter(s => s.title || s.summary)
    .slice(0, 3)
    .map(s => {
      const title = safeStr(s.title, 'Untitled seed')
      const domain = safeStr(s.domain)
      const summary = safeStr(s.summary)
      const tags = safeStr(s.tags)

      let entry = `- **${title}**`
      if (domain) entry += ` [${domain}]`
      if (summary) entry += `: ${summary.slice(0, 200)}`
      else if (s.text) entry += `: ${safeStr(s.text).slice(0, 200)}`
      if (tags) entry += ` (${tags})`
      return entry
    })

  if (entries.length === 0) return ''

  return [
    '---',
    '🌱 **From your Garden** (relevant seeds from your knowledge base):',
    ...entries,
    'Use these insights from your garden to enrich your response. Reference them naturally.',
    '---',
  ].join('\n')
}

// ── Relevance gate ──────────────────────────────────────
// Trust vector search results — if backend returned seeds, they're semantically relevant.
// Only gate out when seeds have zero enrichment data AND low vector scores.

function isRelevantEnough(seeds: WeaviateSeed[], query: string): boolean {
  if (seeds.length === 0) return false

  // If the backend vector search returned results, trust them — they're ranked by similarity
  // Only reject if ALL results have very low scores (unlikely with vector search)
  const hasGoodScore = seeds.some(s =>
    s._additional?.score && Number(s._additional.score) > 1
  )

  // Always allow if we have results (vector search already filtered by relevance)
  return seeds.length > 0
}

// ── Route handler ────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 3 } = await req.json()
    const token = req.headers.get('authorization') || ''

    if (!query || typeof query !== 'string' || query.length < 5) {
      return NextResponse.json({ context: '', seeds: [], enriched: false, reason: 'too_short' })
    }

    // Step 1: Intent classification
    const intent = classifyIntent(query)
    if (intent === 'skip') {
      return NextResponse.json({ context: '', seeds: [], enriched: false, reason: 'intent_skip' })
    }

    // Step 2: Search garden — use backend fallback (has proper tenant filtering)
    let seeds: WeaviateSeed[] = []

    // Skip direct Weaviate on Vercel (can't reach localhost, and lacks tenant filter)
    // Use backend endpoint which properly filters by authenticated user's tenant
    try {
      const backendRes = await fetch(`${BACKEND}/api/v1/seeds/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ query, limit: Math.min(limit, 5) }),
        signal: AbortSignal.timeout(8000),
      })
      if (backendRes.ok) {
        const data = await backendRes.json()
        const backendSeeds = data.seeds || []
        // Convert backend format to WeaviateSeed format
        seeds = backendSeeds.map((s: { title: string; content?: string; metadata?: { summary?: string; tags?: string; domain?: string; energy?: string } }) => ({
          title: s.title,
          text: s.content || '',
          summary: s.metadata?.summary || '',
          tags: s.metadata?.tags || '',
          domain: s.metadata?.domain || '',
          energy: s.metadata?.energy || '',
        }))
      }
    } catch {}

    // Step 3: Relevance gate
    if (!isRelevantEnough(seeds, query)) {
      return NextResponse.json({ context: '', seeds: [], enriched: false, reason: 'no_relevant_seeds' })
    }

    const context = buildGardenContext(seeds)

    return NextResponse.json({
      context,
      seeds: seeds.map(s => ({
        title: safeStr(s.title),
        domain: safeStr(s.domain),
        summary: safeStr(s.summary, safeStr(s.text)).slice(0, 150),
      })).filter(s => s.title),
      enriched: true,
    })
  } catch (err) {
    return NextResponse.json({ context: '', seeds: [], enriched: false, error: String(err) }, { status: 500 })
  }
}
