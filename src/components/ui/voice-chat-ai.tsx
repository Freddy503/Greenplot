"use client"

import { Mic, MicOff, Volume2, VolumeX, Sparkles, Loader2 } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface Particle {
  id: number
  x: number
  y: number
  size: number
  opacity: number
  velocity: { x: number; y: number }
}

interface VoiceChatAIProps {
  onStart?: () => void
  onStop?: (duration: number) => void
  onTranscribe?: (text: string) => void
  className?: string
}

export function VoiceChatAI({ onStart, onStop, onTranscribe, className }: VoiceChatAIProps) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [volume, setVolume] = useState(0)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Generate particles for ambient effect
  const [particles, setParticles] = useState<Particle[]>(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.3 + 0.1,
      velocity: {
        x: (Math.random() - 0.5) * 0.5,
        y: (Math.random() - 0.5) * 0.5
      }
    }))
  )

  const handleStart = useCallback(async () => {
    setIsProcessing(false)
    setDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRecorderRef.current.start()
      setIsListening(true)
      onStart?.()
    } catch {
      // Permission denied or no mic
      fallbackStart()
    }
  }, [onStart])

  const fallbackStart = useCallback(() => {
    setIsListening(true)
    onStart?.()
  }, [onStart])

  const handleStop = useCallback(async () => {
    setIsListening(false)
    setIsProcessing(true)

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }

    // Simulate processing + transcript (replace with real Whisper call)
    await new Promise(r => setTimeout(r, 2000))
    setIsProcessing(false)

    const dur = duration
    onStop?.(dur)
    onTranscribe?.("Transcript will appear here")
  }, [onStop, onTranscribe, duration])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  useEffect(() => {
    if (!isListening) return
    const interval = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(interval)
  }, [isListening])

  return (
    <div className={cn("relative w-full aspect-square max-w-sm mx-auto", className)}>
      {/* Ambient particles */}
      <div className="absolute inset-0 overflow-hidden rounded-[2rem]">
        {particles.map(p => (
          <motion.div
            key={p.id}
            animate={{
              x: [p.x, p.x + (Math.random() - 0.5) * 40],
              y: [p.y, p.y + (Math.random() - 0.5) * 40],
              opacity: [p.opacity, p.opacity * 0.5, p.opacity]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-1 h-1 rounded-full bg-primary"
          />
        ))}
      </div>

      {/* Central orb */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence>
          {isListening ? (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {/* Pulse rings */}
              <div className="relative">
                <motion.div
                  className="absolute -inset-6 rounded-full bg-primary/10"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.2, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute -inset-10 rounded-full bg-primary/5"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                />
                <motion.button
                  onClick={handleStop}
                  className="relative w-24 h-24 rounded-full bg-primary/90 text-background flex items-center justify-center shadow-lg shadow-primary/30"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <MicOff className="w-8 h-8" />
                </motion.button>
              </div>
            </motion.div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center gap-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-10 h-10 text-primary" />
              </motion.div>
              <p className="text-sm text-on-surface-variant">Transcribing…</p>
            </div>
          ) : (
            <motion.button
              onClick={handleStart}
              className="w-24 h-24 rounded-full bg-primary/90 text-background flex items-center justify-center shadow-lg shadow-primary/30"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Mic className="w-8 h-8" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Duration */}
        {isListening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 text-lg font-mono text-on-surface-variant"
          >
            {formatTime(duration)}
          </motion.p>
        )}

        {/* Label */}
        {isListening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-primary font-medium mt-2"
          >
            Listening…
          </motion.p>
        )}
      </div>
    </div>
  )
}
