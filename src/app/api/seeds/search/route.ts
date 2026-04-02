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

async function searchWeaviate(query: string, limit: number): Promise<WeaviateSeed[]> {
  const gql = `{ Get { IdeaSeed(bm25: { query: ${JSON.stringify(query)}, properties: ["title", "summary", "tags", "domain", "text"] } limit: ${limit}) { title domain tags energy summary text _additional { score } } } }`

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
    if (!res.ok) throw new Error(`Weaviate ${res.status}`)
    const data = await res.json()
    return data?.data?.Get?.IdeaSeed || []
  } catch {
    try {
      const res = await fetch(
        `${BACKEND}/api/v1/seeds?query=${encodeURIComponent(query)}&limit=${limit}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!res.ok) return []
      const data = await res.json()
      const seeds = data.seeds || data || []
      return Array.isArray(seeds) ? seeds : []
    } catch {
      return []
    }
  }
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
// Even if intent says "enrich", only include if results are actually relevant.

function isRelevantEnough(seeds: WeaviateSeed[], query: string): boolean {
  if (seeds.length === 0) return false

  const q = query.toLowerCase()
  return seeds.some(s => {
    const title = safeStr(s.title).toLowerCase()
    const summary = safeStr(s.summary).toLowerCase()
    const tags = safeStr(s.tags).toLowerCase()
    const combined = `${title} ${summary} ${tags}`

    // Check if any significant word from the query appears in the seed
    const queryWords = q.split(/\s+/).filter(w => w.length > 4)
    const matchCount = queryWords.filter(w => combined.includes(w)).length
    return matchCount >= 2 || (matchCount >= 1 && seeds[0]?._additional?.score && Number(seeds[0]._additional.score) > 3)
  })
}

// ── Route handler ────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 3 } = await req.json()

    if (!query || typeof query !== 'string' || query.length < 5) {
      return NextResponse.json({ context: '', seeds: [], enriched: false, reason: 'too_short' })
    }

    // Step 1: Intent classification
    const intent = classifyIntent(query)
    if (intent === 'skip') {
      return NextResponse.json({ context: '', seeds: [], enriched: false, reason: 'intent_skip' })
    }

    // Step 2: Search garden
    const seeds = await searchWeaviate(query, Math.min(limit, 5))

    // Step 3: Relevance gate — only enrich if results actually match
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
