'use client'

import { useCallback, useRef, useState } from 'react'

export type VoiceRecorderState = 'idle' | 'recording' | 'processing'

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

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4',
      })

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

          // Use Next.js proxy to avoid CORS issues
          const voiceUrl = '/api/ingest/voice'

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
            throw new Error(errText || `Upload failed (${res.status})`)
          }

          const data = await res.json()
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
    } catch {
      onError?.('Microphone access denied')
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
