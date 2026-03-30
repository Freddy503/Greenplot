'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useEffect, useState } from 'react'

export default function ChatPage() {
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || status !== 'ready') return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#01120b]/80 backdrop-blur-xl flex justify-between items-center px-6 py-4 border-b border-[#384c43]/20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#69f6b8] flex items-center justify-center rounded-full shadow-lg shadow-[#69f6b8]/20">
            <span className="text-[#005a3c] font-bold text-lg">S</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Seedify</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#69f6b8] font-bold">The Living Laboratory</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="pt-24 pb-44 px-4 md:max-w-4xl md:mx-auto min-h-screen w-full">
        <div className="flex flex-col gap-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-[#69f6b8]/10 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-4xl text-[#69f6b8]">local_florist</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Plant your first seed</h2>
              <p className="text-[#9ab0a5] max-w-md">Share a thought, paste an article, or record a voice memo. I&apos;ll help it grow.</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} gap-2 pr-12`}
            >
              <div
                className={`max-w-[85%] rounded-[2rem] px-8 py-6 shadow-sm border ${
                  message.role === 'user'
                    ? 'bg-[#09241b] border-[#384c43]/20'
                    : 'bg-[#69f6b8] text-[#005a3c] shadow-xl shadow-[#69f6b8]/10'
                }`}
              >
                {message.parts.map((part, index) => {
                  switch (part.type) {
                    case 'text':
                      return (
                        <p key={index} className="text-base leading-relaxed whitespace-pre-wrap">
                          {part.text}
                        </p>
                      )

                    default:
                      // Tool call parts: tool-{name}
                      if (part.type.startsWith('tool-')) {
                        const toolName = part.type.replace('tool-', '')
                        const toolPart = part as Record<string, unknown>
                        return (
                          <div key={index} className="mt-3 border-t border-[#005a3c]/10 pt-3">
                            <ToolCallDisplay
                              toolName={toolName}
                              state={(toolPart.state as string) || 'unknown'}
                              input={toolPart.input}
                              output={toolPart.output}
                              errorText={toolPart.errorText as string | undefined}
                            />
                          </div>
                        )
                      }
                      return null
                  }
                })}
              </div>

              {message.role === 'assistant' && (
                <div className="flex items-center gap-3 pl-2">
                  <span className="material-symbols-outlined text-sm text-[#06b77f]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    science
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#9ab0a5]/60">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          ))}

          {status === 'submitted' && (
            <div className="flex items-center gap-3 px-6 py-3 bg-[#06b77f]/10 border border-[#06b77f]/20 rounded-full w-fit mx-auto animate-pulse">
              <span className="material-symbols-outlined text-[#06b77f] text-sm">local_florist</span>
              <span className="text-xs font-semibold text-[#06b77f] tracking-wide uppercase">Searching your garden…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="fixed bottom-0 left-0 w-full px-4 pb-8 pt-10 bg-gradient-to-t from-[#01120b] via-[#01120b]/90 to-transparent z-40">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="bg-[#0d2b21] shadow-2xl rounded-full p-2 flex items-center gap-1 border border-[#384c43]/10 backdrop-blur-md"
          >
            <button
              type="button"
              className="p-3 text-[#9ab0a5] hover:text-[#69f6b8] transition-colors active:scale-90 rounded-full"
              title="Attach file (coming soon)"
            >
              <span className="material-symbols-outlined">attach_file</span>
            </button>

            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 text-[#e4fcf0] py-3 px-3 resize-none max-h-40 placeholder:text-[#657a70]"
              placeholder="Nurture a new idea..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              disabled={status !== 'ready'}
            />

            <button
              type="button"
              className="p-3 text-[#9ab0a5] hover:text-[#69f6b8] transition-colors active:scale-90 rounded-full"
              title="Voice (coming soon)"
            >
              <span className="material-symbols-outlined">mic_none</span>
            </button>

            {status === 'streaming' ? (
              <button
                type="button"
                onClick={stop}
                className="bg-[#ff716c] text-white p-4 rounded-full shadow-lg transition-all active:scale-95"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || status !== 'ready'}
                className="bg-[#69f6b8] text-[#005a3c] p-4 rounded-full shadow-lg shadow-[#69f6b8]/20 hover:shadow-[#69f6b8]/40 transition-all active:scale-95 disabled:opacity-30"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

// Tool call display component
function ToolCallDisplay({
  toolName,
  state,
  input,
  output,
  errorText,
}: {
  toolName: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}) {
  const toolIcons: Record<string, string> = {
    web_search: 'search',
    search: 'search',
    get_weather: 'cloud',
    calculate: 'calculate',
    execute: 'terminal',
  }

  const icon = toolIcons[toolName] || 'build'

  if (state === 'input-streaming' || state === 'input-available') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
        <span className="font-medium opacity-70">Using {toolName.replace(/_/g, ' ')}…</span>
      </div>
    )
  }

  if (state === 'output-available') {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
          <span className="font-medium opacity-70">{toolName.replace(/_/g, ' ')}</span>
        </div>
        <pre className="text-xs bg-[#005a3c]/20 rounded-lg px-3 py-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
          {outputStr.length > 500 ? outputStr.slice(0, 500) + '…' : outputStr}
        </pre>
      </div>
    )
  }

  if (state === 'output-error') {
    return (
      <div className="flex items-center gap-2 text-xs text-[#ff716c]">
        <span className="material-symbols-outlined text-sm">error</span>
        <span>{errorText || `${toolName} failed`}</span>
      </div>
    )
  }

  return null
}
