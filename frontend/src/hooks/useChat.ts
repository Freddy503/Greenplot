'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    const token = typeof window !== 'undefined' ? localStorage.getItem('sb-kpdxrpeuzwzilonvjzcy-auth-token') : null
    let accessToken = ''
    if (token) {
      try {
        const parsed = JSON.parse(token)
        accessToken = parsed?.access_token || ''
      } catch {}
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

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
            if (event.type === 'content') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              )
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: m.content || `Error: ${(err as Error).message}` }
              : m
          )
        )
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, isLoading, messages])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, input, handleInputChange, handleSubmit, isLoading, stop, setMessages }
}
