import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'

export const maxDuration = 300

export async function POST(req: Request) {
  const { messages } = await req.json()
  const BACKEND = 'https://memorial-beautifully-says-statewide.trycloudflare.com'

  // Forward auth token from frontend
  const authHeader = req.headers.get('authorization') || ''

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const textId = crypto.randomUUID()
      let hasStartedText = false

      try {
        const res = await fetch(`${BACKEND}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({ messages }),
        })

        if (!res.ok) {
          const errorText = await res.text()
          writer.write({ type: 'text-start', id: textId })
          writer.write({
            type: 'text-delta',
            id: textId,
            delta: `Backend error (${res.status}): ${errorText}`,
          })
          writer.write({ type: 'text-end', id: textId })
          return
        }

        const reader = res.body?.getReader()
        if (!reader) return

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

            try {
              const event = JSON.parse(line)

              switch (event.type) {
                case 'content':
                  if (!hasStartedText) {
                    writer.write({ type: 'text-start', id: textId })
                    hasStartedText = true
                  }
                  writer.write({
                    type: 'text-delta',
                    id: textId,
                    delta: event.text,
                  })
                  break

                case 'error':
                  if (!hasStartedText) {
                    writer.write({ type: 'text-start', id: textId })
                    hasStartedText = true
                  }
                  writer.write({
                    type: 'text-delta',
                    id: textId,
                    delta: `Error: ${event.text}`,
                  })
                  break
              }
            } catch {
              // Skip malformed lines
            }
          }
        }

        if (hasStartedText) {
          writer.write({ type: 'text-end', id: textId })
        }
      } catch (err) {
        if (!hasStartedText) {
          writer.write({ type: 'text-start', id: textId })
        }
        writer.write({
          type: 'text-delta',
          id: textId,
          delta: `Cannot reach backend. The Cloudflare tunnel may be down.`,
        })
        writer.write({ type: 'text-end', id: textId })
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
