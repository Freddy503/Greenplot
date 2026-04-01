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

  const stream = createUIMessageStream({
    async execute({ writer }) {
      let textId = ''
      let hasStartedText = false

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
          body: JSON.stringify({ messages }),
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
            if (!line.trim()) continue

            let event: {
              type: string
              text?: string
              name?: string
              input?: string | Record<string, unknown>
              result?: string | Record<string, unknown>
            }

            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            switch (event.type) {
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

                // Tool input is immediately available (backend sends complete input)
                writer.write({
                  type: 'tool-input-available',
                  toolCallId,
                  toolName,
                  input,
                })
                break
              }

              case 'tool_result': {
                // Tool results arrive after tool calls in this backend.
                // The tool state shown to the user is already complete
                // (tool-input-start + tool-input-available were emitted
                // when the tool_call event arrived). No additional stream
                // event is needed here.

                // Extract sources from web search results
                const output =
                  typeof event.result === 'string'
                    ? event.result
                    : JSON.stringify(event.result)

                // Extract sources from web search results
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
                  delta: `\n\n⚠️ ${event.text || 'Unknown error'}`,
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
