import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'

export const maxDuration = 300

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(req: Request) {
  const body = await req.json()
  const { messages } = body

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
        const res = await fetch(`${BACKEND}/api/v1/chat/v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({
            messages,
            ...(currentSessionId ? { session_id: currentSessionId } : {}),
          }),
        })

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
        writer.write({
          type: 'text-delta',
          id: textId,
          delta:
            'Cannot reach backend. The Cloudflare tunnel may be down.',
        })
        writer.write({ type: 'text-end', id: textId })
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
