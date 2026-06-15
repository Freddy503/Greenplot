'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

// --- Radix Primitives ---

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { showArrow?: boolean }
>(({ className, sideOffset = 4, showArrow = false, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'relative z-50 max-w-[280px] rounded-md bg-popover text-popover-foreground px-1.5 py-1 text-xs',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className
      )}
      {...props}
    >
      {props.children}
      {showArrow && <TooltipPrimitive.Arrow className="-my-px fill-popover" />}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-64 rounded-xl bg-popover p-2 text-popover-foreground shadow-md outline-none border border-[var(--hairline)]',
        'animate-in data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// --- SVG Icons ---

const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 5.25L12 18.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.75 12L12 5.25L5.25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Settings2Icon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />
  </svg>
)

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ImageIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
)

const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

const NetworkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v4" /><path d="M10.8 13.5 6.5 17" /><path d="m13.2 13.5 4.3 3.5" />
  </svg>
)

const PaperIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
)

const MicIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
  </svg>
)

const WaveformIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" {...props}>
    <line x1="4" y1="10" x2="4" y2="14" /><line x1="8" y1="7" x2="8" y2="17" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="16" y1="7" x2="16" y2="17" /><line x1="20" y1="10" x2="20" y2="14" />
  </svg>
)

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 5v14" /><path d="M5 12h14" />
  </svg>
)

// --- Greenplot tools ---

const TOOLS = [
  { id: 'createImage', name: 'Create an image', shortName: 'Image', icon: ImageIcon, prefix: 'Generate an image of: ' },
  { id: 'searchWeb', name: 'Search the web', shortName: 'Web', icon: GlobeIcon, prefix: 'Search the web for: ' },
  { id: 'ingestPaper', name: 'Plant a research paper', shortName: 'Paper', icon: PaperIcon, prefix: 'Ingest this paper into my garden: ' },
  { id: 'visualize', name: 'Visualize my garden', shortName: 'Graph', icon: NetworkIcon, prefix: 'Visualize my garden around: ' },
]

// --- Live transcription (Web Speech API) ---

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

// --- PromptBox — Greenplot chat composer ---

export const PromptBox = React.forwardRef<
  HTMLTextAreaElement,
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> & {
    onSubmit?: (message: string) => void
    isRecording?: boolean
    isProcessingVoice?: boolean
    recordingDuration?: number
    onToggleVoice?: () => void
    /** Opens the full-screen Siri-style voice overlay (voice memo mode) */
    onOpenVoice?: () => void
    /** Disables tools and mic while streaming */
    isDisabled?: boolean
    /** Attach a PDF to the garden (inline "+" menu) */
    onAttachPdf?: (file: File) => void
    /** Add a link (article / paper / YouTube) to the garden */
    onAddLink?: (url: string) => void
  }
>(({ className, onSubmit, isRecording, isProcessingVoice, recordingDuration, onToggleVoice, onOpenVoice, isDisabled, onAttachPdf, onAddLink, ...props }, ref) => {
  const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [selectedTool, setSelectedTool] = React.useState<string | null>(null)
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)
  const [isAttachOpen, setIsAttachOpen] = React.useState(false)
  const attachFileRef = React.useRef<HTMLInputElement>(null)

  // Live transcription state
  const [listening, setListening] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const baseTextRef = React.useRef('')
  const liveSupported = React.useMemo(() => !!getSpeechRecognition(), [])

  React.useImperativeHandle(ref, () => internalTextareaRef.current!, [])

  React.useEffect(() => {
    const textarea = internalTextareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 240)
      textarea.style.height = `${newHeight}px`
    }
  }, [value])

  const setText = (text: string) => {
    setValue(text)
    if (textareaRef.current) textareaRef.current.value = text
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    if (props.onChange) props.onChange(e)
  }

  // Mobile Safari fallback: listen to native input event
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const handler = () => { if (ta.value !== value) setValue(ta.value) }
    ta.addEventListener('input', handler, { passive: true })
    return () => ta.removeEventListener('input', handler)
  }, [value])

  // ── Live transcription via Web Speech API ──────────────────────
  const stopListening = React.useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const startListening = React.useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      // No live transcription support — fall back to the Whisper voice memo flow
      ;(onOpenVoice ?? onToggleVoice)?.()
      return
    }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    baseTextRef.current = textareaRef.current?.value ?? value
    rec.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      const sep = baseTextRef.current && !baseTextRef.current.endsWith(' ') ? ' ' : ''
      setText(baseTextRef.current + sep + (finalText + interim).trimStart())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }, [onOpenVoice, onToggleVoice, value])

  React.useEffect(() => () => recognitionRef.current?.stop(), [])

  const handleSubmit = () => {
    if (listening) stopListening()
    const currentValue = (textareaRef.current?.value ?? value).trim()
    if (!currentValue) return
    const tool = selectedTool ? TOOLS.find(t => t.id === selectedTool) : null
    const message = tool ? `${tool.prefix}${currentValue}` : currentValue
    onSubmit?.(message)
    setText('')
    setSelectedTool(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const hasValue = (textareaRef.current?.value ?? value).trim().length > 0
  const activeTool = selectedTool ? TOOLS.find(t => t.id === selectedTool) : null
  const ActiveToolIcon = activeTool?.icon

  return (
    <div
      className={cn(
        'flex flex-col rounded-[26px] p-2 shadow-[0_2px_8px_rgba(22,163,74,0.08)] transition-all cursor-text',
        'bg-white/70 border border-primary/15 hover:border-primary/30 hover:shadow-[0_4px_12px_rgba(22,163,74,0.12)] focus-within:border-primary/40 focus-within:shadow-[0_6px_20px_rgba(22,163,74,0.15)]',
        className
      )}
    >
      {/* Input row — on mobile the mic + send sit inline on the right */}
      <div className="flex items-end lg:block">
        <textarea
          ref={(el) => {
            textareaRef.current = el
            if (internalTextareaRef && 'current' in (internalTextareaRef as object)) {
              (internalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
            }
          }}
          rows={1}
          defaultValue=""
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening… speak freely' : 'Nurture a new idea...'}
          className="custom-scrollbar w-full flex-1 min-w-0 resize-none border-0 bg-transparent p-3 text-[15px] leading-relaxed text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 focus-visible:outline-none min-h-14 lg:min-h-16"
          suppressHydrationWarning
          {...props}
        />

        {/* Mobile inline controls */}
        <div className="flex lg:hidden items-center gap-1 pb-2 pr-2 flex-shrink-0">
          {(onOpenVoice || liveSupported) && (
            <button
              type="button"
              onClick={onOpenVoice ? onOpenVoice : (listening ? stopListening : startListening)}
              disabled={isDisabled || isProcessingVoice}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full transition-all focus-visible:outline-none disabled:opacity-40',
                isRecording || listening ? 'bg-error/15 text-error animate-pulse' : 'text-on-surface-variant hover:bg-surface-container'
              )}
            >
              {onOpenVoice ? <WaveformIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
              <span className="sr-only">Voice input</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasValue}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-primary/40"
          >
            <SendIcon className="h-5 w-5" />
            <span className="sr-only">Send message</span>
          </button>
        </div>
      </div>

      {/* Live transcription indicator */}
      {listening && (
        <div className="px-3 pb-1 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[11px] font-medium text-on-surface-variant">Live transcription — tap mic to stop</span>
        </div>
      )}

      <div className="mt-0.5 p-1 pt-0">
        <TooltipProvider delayDuration={100}>
          <div className="flex items-center gap-1.5">
            {/* "+" attach — add a PDF or link to the garden, inline in the composer */}
            {(onAttachPdf || onAddLink) && (
              <>
                <input
                  type="file"
                  ref={attachFileRef}
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f && onAttachPdf) onAttachPdf(f); e.target.value = '' }}
                />
                <Popover open={isAttachOpen} onOpenChange={setIsAttachOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={isDisabled}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <PlusIcon className="h-5 w-5" />
                          <span className="sr-only">Add a PDF or link to your garden</span>
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top" showArrow><p>Add to garden</p></TooltipContent>
                  </Tooltip>
                  <PopoverContent side="top" align="start">
                    <div className="flex flex-col gap-0.5">
                      {onAttachPdf && (
                        <button
                          onClick={() => { setIsAttachOpen(false); attachFileRef.current?.click() }}
                          className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-[13px] font-medium hover:bg-surface-container"
                        >
                          <PaperIcon className="h-4 w-4 text-primary" />
                          <span>Upload a PDF</span>
                        </button>
                      )}
                      {onAddLink && (
                        <button
                          onClick={() => { setIsAttachOpen(false); const u = window.prompt('Paste a link — article, paper, or YouTube'); if (u && onAddLink) onAddLink(u) }}
                          className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-[13px] font-medium hover:bg-surface-container"
                        >
                          <GlobeIcon className="h-4 w-4 text-primary" />
                          <span>Add a link</span>
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            )}

            {/* Tools popover */}
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isDisabled}
                      className="flex h-9 items-center gap-2 rounded-full px-2.5 text-sm text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Settings2Icon className="h-4 w-4" />
                      {!selectedTool && <span className="text-[13px] font-medium">Tools</span>}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" showArrow><p>Garden tools</p></TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="start">
                <div className="flex flex-col gap-0.5">
                  {TOOLS.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => { setSelectedTool(tool.id); setIsPopoverOpen(false); internalTextareaRef.current?.focus() }}
                      className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-[13px] font-medium hover:bg-surface-container"
                    >
                      <tool.icon className="h-4 w-4 text-primary" />
                      <span>{tool.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Active tool chip */}
            {activeTool && (
              <>
                <div className="h-4 w-px bg-[var(--border-2)]" />
                <button
                  onClick={() => setSelectedTool(null)}
                  className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
                >
                  {ActiveToolIcon && <ActiveToolIcon className="h-3.5 w-3.5" />}
                  {activeTool.shortName}
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {/* Right-aligned: voice + send (desktop — mobile has them inline in the input row) */}
            <div className="ml-auto hidden lg:flex items-center gap-1.5">
              {/* Voice memo overlay (Whisper) */}
              {onOpenVoice && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onOpenVoice}
                      disabled={isProcessingVoice || isDisabled}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-all focus-visible:outline-none disabled:opacity-40',
                        isRecording ? 'bg-error/15 text-error animate-pulse' : isProcessingVoice ? 'bg-surface-container cursor-wait' : 'hover:bg-surface-container'
                      )}
                    >
                      <WaveformIcon className="h-5 w-5" />
                      <span className="sr-only">Voice memo</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>{isProcessingVoice ? 'Transcribing…' : isRecording ? `Recording${recordingDuration ? ` ${Math.floor(recordingDuration / 60)}:${String(recordingDuration % 60).padStart(2, '0')}` : ''}` : 'Voice memo (Whisper)'}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Live transcription mic */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={isDisabled}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full transition-all focus-visible:outline-none disabled:opacity-40',
                      listening ? 'bg-red-500/15 text-red-500' : 'text-on-surface-variant hover:bg-surface-container'
                    )}
                  >
                    <MicIcon className="h-5 w-5" />
                    <span className="sr-only">{listening ? 'Stop live transcription' : 'Dictate'}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" showArrow>
                  <p>{listening ? 'Stop live transcription' : liveSupported ? 'Dictate — live transcription' : 'Record voice'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Send */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasValue}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-primary/40"
                  >
                    <SendIcon className="h-5 w-5" />
                    <span className="sr-only">Send message</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" showArrow><p>Send</p></TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
})
PromptBox.displayName = 'PromptBox'
