import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'

export const maxDuration = 60 // Vercel Hobby = 10s effective, Pro = 60s+

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')
const BACKEND_TIMEOUT_MS = 9000 // 9s — safely under Vercel Hobby's 10s limit

/**
 * Transform AI SDK v5 messages (parts format) → backend format (content string).
 * The backend expects: { role, content } not { role, parts: [{type:"text",text}] }
 */
function toBackendMessages(
  msgs: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; content?: string }>
): Array<{ role: string; content: string }> {
  return msgs.map((m) => {
    if (m.content) return { role: m.role, content: m.content }
    if (m.parts) {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text || '')
        .join('')
      return { role: m.role, content: text }
    }
    return { role: m.role, content: '' }
  })
}

export async function POST(req: Request) {
  let body: Record<string, any>
  try {
    body = await req.json()
  } catch (err) {
    const rawText = await req.text().catch(() => 'failed to read body')
    console.error('[chat] JSON parse error:', err instanceof Error ? err.message : String(err))
    console.error('[chat] Raw body (first 500):', rawText.slice(0, 500))
    console.error('[chat] Content-Type:', req.headers.get('content-type'))
    return new Response(
      JSON.stringify({ error: `Invalid JSON in request body: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const rawMessages = body.messages || []

  const messages = toBackendMessages(rawMessages)

  // Auth token forwarded from frontend via body
  const token: string = body._auth_token || ''
  const authHeader = token ? `Bearer ${token}` : ''

  // Session ID for resume
  const sessionId: string = body.session_id || ''

  const stream = createUIMessageStream({
    async execute({ writer }) {
      let textId = ''
      let hasStartedText = false
      let currentSessionId = sessionId

      const ensureTextStarted = () => {
        if (!hasStartedText) {
          textId = crypto.randomUUID()
          writer.write({ type: 'text-start', id: textId })
          hasStartedText = true
        }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)

        const requestBody = JSON.stringify({
          messages,
          ...(currentSessionId ? { session_id: currentSessionId } : {}),
        })

        // Debug: log request to Vercel function logs
        console.log('[chat] Sending to backend:', {
          messageCount: messages.length,
          lastRole: messages[messages.length - 1]?.role,
          lastContent: messages[messages.length - 1]?.content?.slice(0, 80),
          hasToken: !!authHeader,
          sessionId: currentSessionId,
        })

        const res = await fetch(`${BACKEND}/api/v1/chat/v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: requestBody,
          signal: controller.signal,
        })

        clearTimeout(timeout)

        console.log('[chat] Backend response:', { status: res.status, ok: res.ok })

        if (!res.ok) {
          const errorText = await res.text()
          ensureTextStarted()
          writer.write({
            type: 'text-delta',
            id: textId,
            delta: `Backend error (${res.status}): ${errorText}`,
          })
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          ensureTextStarted()
          writer.write({
            type: 'text-delta',
            id: textId,
            delta: 'No response body from backend.',
          })
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            // SSE format: "data: {...}"
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const jsonStr = trimmed.slice(6) // Remove "data: " prefix
            if (!jsonStr) continue

            let event: {
              type: string
              session_id?: string
              text?: string
              name?: string
              input?: string | Record<string, unknown>
              result?: string | Record<string, unknown>
              message?: string
            }

            try {
              event = JSON.parse(jsonStr)
            } catch {
              continue
            }

            switch (event.type) {
              case 'session': {
                // Backend confirms session ID
                if (event.session_id) {
                  currentSessionId = event.session_id
                }
                break
              }

              case 'content': {
                ensureTextStarted()
                writer.write({
                  type: 'text-delta',
                  id: textId,
                  delta: event.text || '',
                })
                break
              }

              case 'tool_call': {
                const toolCallId = crypto.randomUUID()
                const toolName = event.name || 'unknown'
                const input =
                  typeof event.input === 'string'
                    ? JSON.parse(event.input)
                    : event.input || {}

                // Signal tool is starting
                writer.write({
                  type: 'tool-input-start',
                  toolCallId,
                  toolName,
                })

                // Tool input is immediately available
                writer.write({
                  type: 'tool-input-available',
                  toolCallId,
                  toolName,
                  input,
                })
                break
              }

              case 'tool_result': {
                // Extract sources from web search results
                const output =
                  typeof event.result === 'string'
                    ? event.result
                    : JSON.stringify(event.result)

                try {
                  const parsed = JSON.parse(output)
                  if (parsed.results && Array.isArray(parsed.results)) {
                    const seen = new Set<string>()
                    for (const r of parsed.results) {
                      if (r.url && !seen.has(r.url)) {
                        seen.add(r.url)
                        const title =
                          r.title && r.title !== 'link' && r.title.trim().length > 0
                            ? r.title
                            : (() => {
                                try {
                                  return new URL(r.url).hostname
                                } catch {
                                  return r.url
                                }
                              })()
                        writer.write({
                          type: 'source-url',
                          sourceId: r.url,
                          url: r.url,
                          title,
                        })
                      }
                    }
                  }
                } catch {
                  // Not JSON or no results — skip source extraction
                }
                break
              }

              case 'error': {
                ensureTextStarted()
                writer.write({
                  type: 'text-delta',
                  id: textId,
                  delta: `\n\n⚠️ ${event.message || event.text || 'Unknown error'}`,
                })
                break
              }
            }
          }
        }

        if (hasStartedText) {
          writer.write({ type: 'text-end', id: textId })
        }
      } catch (err) {
        ensureTextStarted()
        const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'))
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[chat] CATCH ERROR:', { isTimeout, errMsg, backend: BACKEND, stack: err instanceof Error ? err.stack?.slice(0, 300) : '' })
        writer.write({
          type: 'text-delta',
          id: textId,
          delta: isTimeout
            ? 'This request requires tools (search, research, etc.) and takes longer than the current hosting allows. Try a simpler question, or upgrade to Vercel Pro for longer timeouts.'
            : `Cannot reach backend (${errMsg}). The Cloudflare tunnel may be down.`,
        })
        writer.write({ type: 'text-end', id: textId })
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
