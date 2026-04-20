'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
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


// --- SVG Icons ---

const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 5.25L12 18.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.75 12L12 5.25L5.25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ImageIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)

const MicIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
  </svg>
)

// --- PromptBox Component (without tools) ---

export const PromptBox = React.forwardRef<
  HTMLTextAreaElement,
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> & {
    onSubmit?: (message: string) => void
    isRecording?: boolean
    isProcessingVoice?: boolean
    recordingDuration?: number
    onToggleVoice?: () => void
    /** Opens the full-screen Siri-style voice overlay (preferred over onToggleVoice on mobile) */
    onOpenVoice?: () => void
    /** Disables image mode toggle and mic while streaming */
    isDisabled?: boolean
  }
>(({ className, onSubmit, isRecording, isProcessingVoice, recordingDuration, onToggleVoice, onOpenVoice, isDisabled, ...props }, ref) => {
  const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [imageMode, setImageMode] = React.useState(false)

  React.useImperativeHandle(ref, () => internalTextareaRef.current!, [])

  typeof window !== 'undefined' && React.useEffect ? React.useEffect : React.useEffect(() => {
    const textarea = internalTextareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 200)
      textarea.style.height = `${newHeight}px`
    }
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    if (props.onChange) props.onChange(e)
  }

  // Mobile Safari fallback: listen to native input event
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const handler = () => {
      if (ta.value !== value) setValue(ta.value)
    }
    ta.addEventListener('input', handler, { passive: true })
    return () => ta.removeEventListener('input', handler)
  }, [value])

  // Dynamic input hints
  const getHint = (): { icon: string; text: string; color: string } | null => {
    if (imageMode) {
      return { icon: 'image', text: 'Image mode — describe what to generate', color: 'text-primary' }
    }
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 3) return null

    // URL detected
    if (/^https?:\/\/\S+/.test(trimmed)) {
      return { icon: 'link', text: 'Link detected — will be added to Sources', color: 'text-blue-400' }
    }
    // Question detected
    if (/^(what|how|why|when|where|who|can|could|should|would|is|are|do|does|did)\b/i.test(trimmed) || /\?$/.test(trimmed)) {
      return { icon: 'search', text: 'Searching your garden...', color: 'text-secondary' }
    }
    // Long thought/reflection
    if (trimmed.length > 80 && !trimmed.includes('?')) {
      return { icon: 'eco', text: 'Capturing as seed...', color: 'text-primary' }
    }
    // /save command
    if (/^\/save\b/i.test(trimmed)) {
      return { icon: 'eco', text: 'Save last response to garden', color: 'text-primary' }
    }
    // /plants command
    if (/^\/plants\b/i.test(trimmed)) {
      return { icon: 'auto_stories', text: 'Compile plant from related seeds', color: 'text-blue-400' }
    }
    return null
  }

  const hint = getHint()

  const handleSubmit = () => {
    const currentValue = textareaRef.current?.value ?? value
    if (currentValue.trim()) {
      const message = imageMode
        ? `Generate an image of: ${currentValue.trim()}`
        : currentValue
      onSubmit?.(message)
      setValue('')
      if (textareaRef.current) textareaRef.current.value = ''
      if (imageMode) setImageMode(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const hasValue = (textareaRef.current?.value ?? value).trim().length > 0

  return (
    <div
      className={cn(
        'flex flex-col rounded-[24px] p-2 shadow-[0_2px_8px_rgba(22,163,74,0.08)] transition-all cursor-text',
        'bg-primary/[0.04] border border-primary/15 hover:border-primary/30 hover:shadow-[0_4px_12px_rgba(22,163,74,0.12)] focus-within:border-primary/40 focus-within:shadow-[0_4px_16px_rgba(22,163,74,0.15)]',
        className
      )}
    >
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
        placeholder="Nurture a new idea..."
        className="custom-scrollbar w-full resize-none border-0 bg-transparent p-3 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 focus-visible:outline-none min-h-12"
        suppressHydrationWarning
        {...props}
      />

      {/* Dynamic hint bar */}
      {hint && (
        <div className="px-3 pb-1">
          <div className={`flex items-center gap-1.5 text-[11px] font-medium ${hint.color}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: '"FILL" 1' }}>{hint.icon}</span>
            {hint.text}
          </div>
        </div>
      )}

      <div className="mt-0.5 p-1 pt-0">
        <TooltipProvider delayDuration={100}>
          <div className="flex items-center gap-2">
            {/* Generate image */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setImageMode(m => !m)}
                  disabled={isDisabled}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:pointer-events-none',
                    imageMode
                      ? 'bg-primary/20 text-primary hover:bg-primary/30'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  )}
                >
                  <ImageIcon className="h-5 w-5" />
                  <span className="sr-only">{imageMode ? 'Cancel image generation' : 'Generate image'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow>
                <p>{imageMode ? 'Image mode active — describe what to generate' : 'Generate image with BFL FLUX'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Mic — opens full-screen voice overlay */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenVoice ?? onToggleVoice}
                  disabled={isProcessingVoice || isDisabled}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-all focus-visible:outline-none disabled:opacity-40',
                    isRecording
                      ? 'bg-error/15 text-error animate-pulse hover:bg-error/25'
                      : isProcessingVoice
                        ? 'bg-surface-container cursor-wait'
                        : 'hover:bg-surface-container'
                  )}
                >
                  <MicIcon className="h-5 w-5" />
                  <span className="sr-only">{isRecording ? 'Stop recording' : 'Record voice'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow>
                <p>
                  {isRecording
                    ? `Recording${recordingDuration ? ` ${Math.floor(recordingDuration / 60)}:${String(recordingDuration % 60).padStart(2, '0')}` : ''} — tap to stop`
                    : isProcessingVoice
                      ? 'Transcribing…'
                      : 'Voice memo'}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Send */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!hasValue}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-primary/40"
                >
                  <SendIcon className="h-5 w-5" />
                  <span className="sr-only">Send message</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow>
                <p>Send</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
})
PromptBox.displayName = 'PromptBox'
