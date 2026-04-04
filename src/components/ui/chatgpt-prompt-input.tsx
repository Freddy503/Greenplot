'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as DialogPrimitive from '@radix-ui/react-dialog'
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

const Dialog = DialogPrimitive.Root
const DialogPortal = DialogPrimitive.Portal
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border-none bg-transparent p-0 shadow-none duration-300',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    >
      <div className="relative bg-card rounded-[28px] overflow-hidden shadow-2xl p-1">
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-full bg-background/50 p-1 hover:bg-accent transition-all">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// --- SVG Icons ---

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 5V19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 5.25L12 18.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.75 12L12 5.25L5.25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
  }
>(({ className, onSubmit, isRecording, isProcessingVoice, recordingDuration, onToggleVoice, ...props }, ref) => {
  const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [imagePreview, setImagePreview] = React.useState<string | null>(null)
  const [isImageDialogOpen, setIsImageDialogOpen] = React.useState(false)

  React.useImperativeHandle(ref, () => internalTextareaRef.current!, [])

  React.useLayoutEffect(() => {
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

  const handlePlusClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    event.target.value = ''
  }

  const handleRemoveImage = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Dynamic input hints
  const getHint = (): { icon: string; text: string; color: string } | null => {
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
    if (currentValue.trim() || imagePreview) {
      onSubmit?.(currentValue)
      setValue('')
      if (textareaRef.current) textareaRef.current.value = ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const hasValue = (textareaRef.current?.value ?? value).trim().length > 0 || imagePreview

  return (
    <div
      className={cn(
        'flex flex-col rounded-[28px] p-2 shadow-sm transition-colors cursor-text',
        'bg-surface-container-highest border border-outline-variant/10',
        className
      )}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      {imagePreview && (
        <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
          <div className="relative mb-1 w-fit rounded-[1rem] px-1 pt-1">
            <button type="button" className="transition-transform" onClick={() => setIsImageDialogOpen(true)}>
              <img src={imagePreview} alt="Image preview" className="h-14 w-14 rounded-[1rem] object-cover" />
            </button>
            <button
              onClick={handleRemoveImage}
              className="absolute right-2 top-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-background/50 text-foreground transition-colors hover:bg-accent"
              aria-label="Remove image"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <DialogContent>
            <img src={imagePreview} alt="Full size preview" className="w-full max-h-[95vh] object-contain rounded-[24px]" />
          </DialogContent>
        </Dialog>
      )}

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
            {/* Attach */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handlePlusClick}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none"
                >
                  <PlusIcon className="h-6 w-6" />
                  <span className="sr-only">Attach image</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow>
                <p>Attach image</p>
              </TooltipContent>
            </Tooltip>

            {/* Web search */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none"
                >
                  <GlobeIcon className="h-5 w-5" />
                  <span className="sr-only">Search the web</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow>
                <p>Search the web</p>
              </TooltipContent>
            </Tooltip>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Mic */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleVoice}
                  disabled={isProcessingVoice}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-all focus-visible:outline-none',
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
                      : 'Record voice memo'}
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
