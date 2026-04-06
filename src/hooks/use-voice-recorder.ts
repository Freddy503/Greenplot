'use client'

import { useCallback, useRef, useState } from 'react'

export type VoiceRecorderState = 'idle' | 'recording' | 'processing'

const MAX_RECORDING_SECONDS = 90

interface UseVoiceRecorderOptions {
  onTranscription: (text: string) => void
  onError?: (error: string) => void
  backendUrl?: string
  authToken?: string
}

export function useVoiceRecorder({
  onTranscription,
  onError,
  backendUrl = '',
  authToken = '',
}: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>('idle')
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // Check if MediaRecorder is available
      if (typeof MediaRecorder === 'undefined') {
        onError?.('Voice recording not supported in this browser')
        return
      }

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        onError?.('Microphone access not available (requires HTTPS)')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Find a supported MIME type
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        stopTimer()

        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        })

        if (blob.size < 1000) {
          onError?.('Recording too short')
          setState('idle')
          return
        }

        setState('processing')

        try {
          const formData = new FormData()
          const ext = mediaRecorder.mimeType.includes('webm') ? 'webm' : 'mp4'
          formData.append('file', blob, `voice-memo.${ext}`)

          // Get fresh token from localStorage (might have been set after hook init)
          const token = authToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : '')

          // Call backend directly (CORS is configured for seedify-six.vercel.app)
          const voiceUrl = 'https://api.greenplot.ink/api/v1/ingest/voice'

          const res = await fetch(voiceUrl, {
              method: 'POST',
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: formData,
            }
          )

          if (!res.ok) {
            const errText = await res.text()
            console.error('[voice] Upload failed:', res.status, errText)
            throw new Error(errText || `Upload failed (${res.status})`)
          }

          const data = await res.json()
          console.log('[voice] Response:', data)
          const transcript = data.transcript || data.transcription || data.text || data.content || ''
          if (transcript.trim()) {
            onTranscription(transcript.trim())
          } else {
            onError?.('No speech detected')
          }
        } catch (err) {
          onError?.(
            err instanceof Error ? err.message : 'Transcription failed'
          )
        } finally {
          setState('idle')
        }
      }

      mediaRecorder.start(250) // collect data every 250ms
      mediaRecorderRef.current = mediaRecorder
      setDuration(0)
      setState('recording')

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      // Auto-stop after MAX_RECORDING_SECONDS to prevent oversized uploads
      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          onError?.(`Recording capped at ${MAX_RECORDING_SECONDS}s — transcribing now`)
          mediaRecorderRef.current.stop()
        }
      }, MAX_RECORDING_SECONDS * 1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[voice] Recording error:', msg)
      if (msg.includes('Permission') || msg.includes('permission') || msg.includes('NotAllowed')) {
        onError?.('Microphone permission denied. Please allow microphone access.')
      } else if (msg.includes('NotFoundError') || msg.includes('no microphone')) {
        onError?.('No microphone found on this device')
      } else {
        onError?.(`Microphone access denied: ${msg}`)
      }
    }
  }, [backendUrl, authToken, onError, onTranscription, stopTimer])

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (state === 'recording') {
      stopRecording()
    } else if (state === 'idle') {
      startRecording()
    }
  }, [state, startRecording, stopRecording])

  return {
    state,
    duration,
    toggleRecording,
    isRecording: state === 'recording',
    isProcessing: state === 'processing',
  }
}
