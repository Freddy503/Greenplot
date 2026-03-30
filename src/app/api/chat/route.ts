import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const textId = crypto.randomUUID()
      let hasStartedText = false

      try {
        const res = await fetch(`${apiUrl}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages }),
        })

        if (!res.ok) {
          const errorText = await res.text()
          writer.write({ type: 'text-start', id: textId })
          writer.write({
            type: 'text-delta',
            id: textId,
            delta: `API error: ${res.status} ${errorText}`,
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

                case 'tool_call':
                  writer.write({
                    type: 'tool-input-start',
                    toolCallId: event.id,
                    toolName: event.name,
                  })
                  try {
                    const input = typeof event.input === 'string'
                      ? JSON.parse(event.input)
                      : event.input
                    writer.write({
                      type: 'tool-input-available',
                      toolCallId: event.id,
                      toolName: event.name,
                      input,
                    })
                  } catch {
                    writer.write({
                      type: 'tool-input-available',
                      toolCallId: event.id,
                      toolName: event.name,
                      input: { raw: event.input },
                    })
                  }
                  break

                case 'tool_result':
                  writer.write({
                    type: 'tool-output-available',
                    toolCallId: event.id,
                    output: event.result,
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
          delta: `Connection error: ${(err as Error).message}. Make sure NEXT_PUBLIC_API_URL is set in Vercel.`,
        })
        writer.write({ type: 'text-end', id: textId })
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
