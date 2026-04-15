'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import ReactMarkdown from 'react-markdown'

const EXPLAIN_SYSTEM_PROMPT = `You are an expert tutor with deep knowledge across science, technology, enterprise, and creative fields. Your mission is to explain topics clearly and build genuine understanding through dialogue.

For EVERY response, follow this structure:
1. Give a clear, well-structured explanation using headers, bullet points, and concrete examples.
2. ALWAYS use search_seeds and search_wiki first to ground your explanation in the user's personal knowledge base and connect to what they already know.
3. Keep explanations concrete — use analogies, real examples, and step-by-step reasoning. Never be vague.
4. End EVERY response with exactly this section (no exceptions):

**Explore further:**
- [specific follow-up question 1]
- [specific follow-up question 2]
- [specific follow-up question 3]

The follow-up questions should be specific and progressively deeper, not generic.`

function parseFollowUps(text: string): string[] {
  const match = text.match(/\*\*Explore further:\*\*\s*([\s\S]*?)(?:\n\n|$)/)
  if (!match) return []
  return match[1]
    .split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(l => l.length > 0)
    .slice(0, 3)
}

function stripFollowUps(text: string): string {
  return text.replace(/\*\*Explore further:\*\*[\s\S]*$/, '').trim()
}

interface QABlock {
  question: string
  answer: string
}

export default function ExplainPage() {
  const [topic, setTopic] = useState('')
  const [topicLocked, setTopicLocked] = useState(false)
  const [qaBlocks, setQaBlocks] = useState<QABlock[]>([])
  const [followUps, setFollowUps] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const authToken = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
    body: {
      _auth_token: authToken,
      _system_override: EXPLAIN_SYSTEM_PROMPT,
    },
    onFinish: (msg) => {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg as any).parts?.map((p: any) => p.text || '').join('') || ''
      const lastUser = messages.filter(m => m.role === 'user').at(-1)
      const question = lastUser
        ? (typeof lastUser.content === 'string' ? lastUser.content : (lastUser as any).parts?.map((p: any) => p.text || '').join('') || '')
        : ''
      setQaBlocks(prev => [...prev, { question, answer: stripFollowUps(text) }])
      setFollowUps(parseFollowUps(text))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    },
  })

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim() || isLoading) return
    setTopicLocked(true)
    setInput(topic.trim())
    setTimeout(() => {
      const form = document.getElementById('explain-form') as HTMLFormElement
      form?.requestSubmit()
    }, 0)
  }

  const handleFollowUp = (q: string) => {
    setFollowUps([])
    setInput(q)
    setTimeout(() => {
      const form = document.getElementById('explain-form') as HTMLFormElement
      form?.requestSubmit()
    }, 0)
  }

  const handleExportPDF = async () => {
    if (!contentRef.current || exporting) return
    setExporting(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const filename = `explanation-${topic.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
      await html2pdf()
        .set({
          margin: [15, 15, 15, 15],
          filename,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css'] },
        })
        .from(contentRef.current)
        .save()
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const currentStreamText = messages.at(-1)?.role === 'assistant'
    ? (typeof messages.at(-1)!.content === 'string'
        ? messages.at(-1)!.content
        : (messages.at(-1) as any).parts?.map((p: any) => p.text || '').join('') || '')
    : ''

  const showExport = qaBlocks.length >= 2

  return (
    <div className="h-dvh flex flex-col bg-background">
      <Header />
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--header-height)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px', fontVariationSettings: '"FILL" 1' }}>school</span>
              <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Explain</h1>
            </div>
            {showExport && (
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>picture_as_pdf</span>
                {exporting ? 'Exporting…' : 'Export Q&A PDF'}
              </button>
            )}
          </div>

          {/* Topic input */}
          {!topicLocked ? (
            <form onSubmit={handleStart} className="mb-8">
              <div className="rounded-2xl bg-surface-container border border-outline-variant/10 p-5 space-y-4">
                <div>
                  <p className="text-sm font-bold text-on-surface mb-1">What do you want to understand?</p>
                  <p className="text-[11px] text-on-surface-variant">Ask about any topic — the agent will draw from your garden, wiki, and the web.</p>
                </div>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart(e) } }}
                  placeholder="e.g. How does transformer attention work? What is A2A orchestration? Explain RAG pipelines."
                  rows={3}
                  className="w-full rounded-xl bg-surface-container-high border border-outline-variant/20 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/40 resize-none"
                />
                <button
                  type="submit"
                  disabled={!topic.trim() || isLoading}
                  className="w-full rounded-full bg-primary text-on-primary py-2.5 text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                >
                  Start Explanation
                </button>
              </div>
            </form>
          ) : (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-full bg-surface-container border border-outline-variant/10">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>school</span>
              <p className="text-sm font-semibold text-on-surface flex-1 truncate">{topic}</p>
              <button
                onClick={() => { setTopicLocked(false); setQaBlocks([]); setFollowUps([]) }}
                className="text-[10px] text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
              >
                New topic
              </button>
            </div>
          )}

          {/* PDF-exportable Q&A content */}
          <div ref={contentRef} id="qa-content">
            {qaBlocks.length > 0 && (
              <div className="hidden-for-screen pdf-header mb-6">
                <h1 style={{ fontFamily: 'sans-serif', fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{topic}</h1>
                <p style={{ fontFamily: 'sans-serif', fontSize: '11px', color: '#666' }}>Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            )}

            <div className="space-y-6">
              {qaBlocks.map((block, i) => (
                <div key={i} className="space-y-3">
                  {/* Question */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                      <span className="text-[10px] font-black text-primary">Q</span>
                    </div>
                    <p className="text-sm font-bold text-on-surface leading-snug pt-0.5">{block.question}</p>
                  </div>
                  {/* Answer */}
                  <div className="ml-9 rounded-2xl bg-surface-container border border-outline-variant/10 p-4">
                    <div className="prose prose-sm max-w-none text-on-surface prose-headings:text-on-surface prose-headings:font-bold prose-p:text-on-surface/90 prose-li:text-on-surface/90 prose-strong:text-on-surface prose-code:text-primary prose-code:bg-surface-container-high prose-code:px-1 prose-code:rounded">
                      <ReactMarkdown>{block.answer}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming current answer */}
              {isLoading && currentStreamText && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                      <span className="text-[10px] font-black text-primary">Q</span>
                    </div>
                    <p className="text-sm font-bold text-on-surface leading-snug pt-0.5">
                      {messages.filter(m => m.role === 'user').at(-1)
                        ? (typeof messages.filter(m => m.role === 'user').at(-1)!.content === 'string'
                            ? messages.filter(m => m.role === 'user').at(-1)!.content as string
                            : '')
                        : ''}
                    </p>
                  </div>
                  <div className="ml-9 rounded-2xl bg-surface-container border border-outline-variant/10 p-4">
                    <div className="prose prose-sm max-w-none text-on-surface">
                      <ReactMarkdown>{stripFollowUps(currentStreamText)}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {isLoading && !currentStreamText && (
                <div className="flex items-center gap-3 ml-9 py-3">
                  <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '18px' }}>progress_activity</span>
                  <p className="text-xs text-on-surface-variant">Thinking…</p>
                </div>
              )}
            </div>
          </div>

          {/* Follow-up chips */}
          {followUps.length > 0 && !isLoading && (
            <div className="mt-6 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Explore further</p>
              <div className="flex flex-col gap-2">
                {followUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleFollowUp(q)}
                    className="text-left rounded-2xl bg-surface-container border border-outline-variant/10 px-4 py-3 text-sm text-on-surface hover:bg-surface-container-high hover:border-primary/20 active:scale-[0.99] transition-all"
                  >
                    <span className="text-primary font-bold mr-1">→</span> {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom follow-up input */}
          {topicLocked && !isLoading && qaBlocks.length > 0 && (
            <form id="explain-form" onSubmit={handleSubmit} className="mt-4">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Or ask your own follow-up…"
                  className="flex-1 rounded-xl bg-surface-container-high border border-outline-variant/20 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/40"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="rounded-xl bg-primary text-on-primary px-4 py-2.5 text-sm font-bold disabled:opacity-40 active:scale-95 transition-transform"
                >
                  Ask
                </button>
              </div>
            </form>
          )}

          {/* Hidden submit form for programmatic submits */}
          {topicLocked && (qaBlocks.length === 0 || isLoading) && (
            <form id="explain-form" onSubmit={handleSubmit} className="hidden">
              <input value={input} onChange={handleInputChange} />
            </form>
          )}

          <div ref={bottomRef} />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
