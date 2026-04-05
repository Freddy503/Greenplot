'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'

interface VoiceOverlayProps {
  isOpen: boolean
  onClose: () => void
  onTranscription: (text: string) => void
  onError?: (msg: string) => void
  authToken?: string
}

// Real-time waveform bars driven by AudioContext analyser
function useWaveform(isRecording: boolean) {
  const [bars, setBars] = useState<number[]>(Array(28).fill(0))
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!isRecording) {
      cancelAnimationFrame(rafRef.current)
      setBars(Array(28).fill(0))
      analyserRef.current = null
      return
    }

    let alive = true

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!alive) return
        analyser.getByteFrequencyData(data)
        const slice = Array.from(data.slice(0, 28)).map(v => v / 255)
        setBars(slice)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }).catch(() => {
      // mic already granted to MediaRecorder — fall back to simulated bars
      const tick = () => {
        if (!alive) return
        setBars(Array(28).fill(0).map(() => Math.random() * 0.8 + 0.05))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    })

    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [isRecording])

  return bars
}

export function VoiceOverlay({
  isOpen,
  onClose,
  onTranscription,
  onError,
  authToken = '',
}: VoiceOverlayProps) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle')

  const handleTranscription = useCallback((text: string) => {
    setPhase('done')
    setTimeout(() => {
      onTranscription(text)
      onClose()
      setPhase('idle')
    }, 600)
  }, [onTranscription, onClose])

  const handleError = useCallback((msg: string) => {
    onError?.(msg)
    onClose()
    setPhase('idle')
  }, [onError, onClose])

  const { state: recState, duration, toggleRecording } = useVoiceRecorder({
    onTranscription: handleTranscription,
    onError: handleError,
    authToken,
  })

  // Sync phase with recorder state
  useEffect(() => {
    if (recState === 'recording') setPhase('recording')
    else if (recState === 'processing') setPhase('processing')
    else if (recState === 'idle' && phase !== 'done') setPhase('idle')
  }, [recState, phase])

  // Auto-start when opened
  useEffect(() => {
    if (isOpen && recState === 'idle') {
      const t = setTimeout(() => toggleRecording(), 300)
      return () => clearTimeout(t)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop recording and close
  const handleClose = useCallback(() => {
    if (recState === 'recording') toggleRecording()
    onClose()
    setTimeout(() => setPhase('idle'), 400)
  }, [recState, toggleRecording, onClose])

  const bars = useWaveform(phase === 'recording')

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="voice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl"
        >
          {/* Ambient glow */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <motion.div
              className="w-[480px] h-[480px] rounded-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 blur-3xl"
              animate={{
                scale: phase === 'recording' ? [1, 1.15, 1] : [1, 1.05, 1],
                opacity: phase === 'recording' ? [0.4, 0.7, 0.4] : [0.15, 0.25, 0.15],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-14 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container border border-border/20 text-on-surface-variant hover:text-on-surface transition-colors"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative z-10 flex flex-col items-center gap-10 px-8 w-full max-w-sm">

            {/* Big pulsing circle */}
            <motion.div className="relative" whileTap={{ scale: 0.94 }}>
              <motion.button
                onClick={() => phase === 'recording' ? toggleRecording() : undefined}
                className={cn(
                  'relative flex h-32 w-32 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  phase === 'recording'
                    ? 'border-primary bg-primary/10 shadow-xl shadow-primary/20'
                    : phase === 'processing'
                    ? 'border-secondary bg-secondary/10 shadow-xl shadow-secondary/20'
                    : phase === 'done'
                    ? 'border-primary bg-primary/20'
                    : 'border-border bg-surface-container',
                )}
                animate={
                  phase === 'recording'
                    ? { boxShadow: ['0 0 0 0 rgba(34,197,94,0.35)', '0 0 0 28px rgba(34,197,94,0)'] }
                    : {}
                }
                transition={{ duration: 1.6, repeat: phase === 'recording' ? Infinity : 0 }}
              >
                <AnimatePresence mode="wait">
                  {phase === 'processing' ? (
                    <motion.span
                      key="proc"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      className="material-symbols-outlined text-secondary animate-spin"
                      style={{ fontSize: 48 }}
                    >
                      progress_activity
                    </motion.span>
                  ) : phase === 'done' ? (
                    <motion.span
                      key="done"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      className="material-symbols-outlined text-primary"
                      style={{ fontSize: 48, fontVariationSettings: '"FILL" 1' }}
                    >
                      check_circle
                    </motion.span>
                  ) : phase === 'recording' ? (
                    <motion.span
                      key="rec"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      className="material-symbols-outlined text-primary"
                      style={{ fontSize: 48, fontVariationSettings: '"FILL" 1' }}
                    >
                      mic
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      className="material-symbols-outlined text-on-surface-variant"
                      style={{ fontSize: 48 }}
                    >
                      mic
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Pulse rings while recording */}
              <AnimatePresence>
                {phase === 'recording' && (
                  <>
                    {[0, 0.6].map((delay, i) => (
                      <motion.div
                        key={i}
                        className="absolute inset-0 rounded-full border-2 border-primary/25"
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.9, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay }}
                      />
                    ))}
                  </>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Live waveform */}
            <div className="flex h-14 items-center justify-center gap-[3px] w-full">
              {bars.map((h, i) => (
                <motion.div
                  key={i}
                  className={cn(
                    'rounded-full w-[3px] flex-shrink-0',
                    phase === 'recording' ? 'bg-primary' : 'bg-border',
                  )}
                  animate={{ height: `${Math.max(4, h * 52)}px` }}
                  transition={{ duration: 0.08, ease: 'easeOut' }}
                />
              ))}
            </div>

            {/* Status label + timer */}
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.p
                className={cn(
                  'text-base font-semibold tracking-wide',
                  phase === 'recording' ? 'text-primary' :
                  phase === 'processing' ? 'text-secondary' :
                  phase === 'done' ? 'text-primary' :
                  'text-on-surface-variant',
                )}
                animate={{ opacity: [1, 0.65, 1] }}
                transition={{
                  duration: 2,
                  repeat: phase === 'recording' || phase === 'processing' ? Infinity : 0,
                }}
              >
                {phase === 'recording' ? 'Listening…'
                  : phase === 'processing' ? 'Transcribing…'
                  : phase === 'done' ? 'Got it!'
                  : 'Starting…'}
              </motion.p>

              {phase === 'recording' && (
                <p className="font-mono text-sm text-on-surface-variant">
                  {fmt(duration)}
                </p>
              )}

              {phase === 'recording' && (
                <p className="text-xs text-on-surface-variant/50 mt-1">
                  Tap the circle to stop
                </p>
              )}
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
