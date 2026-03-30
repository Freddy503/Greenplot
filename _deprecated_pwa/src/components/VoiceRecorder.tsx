import { useState, useRef, useEffect } from 'react';
import { Attachment } from '../types';
import { transcribeAudio, isLocalTranscriptionAvailable } from '../services/whisperLocal';
import { getSettings } from '../services/processingSettings';

export function VoiceRecorder({ onAttachment }: { onAttachment: (att: Attachment) => void }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      wakeLockRef.current?.release();
    };
  }, []);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      // Wake lock not critical — just log
      console.debug('Wake lock unavailable:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        await releaseWakeLock();

        const settings = getSettings();
        const useLocal = settings.localTranscription && isLocalTranscriptionAvailable();

        if (useLocal) {
          setTranscribing(true);
          try {
            const text = await transcribeAudio(blob);
            if (text) {
              // Send as text attachment (already transcribed)
              onAttachment({
                name: `voice-${Date.now()}.txt`,
                type: 'text/plain',
                text: text,
              });
            } else {
              // Fallback to raw audio
              const base64 = await blobToBase64(blob);
              onAttachment({
                name: `voice-${Date.now()}.webm`,
                type: 'audio/webm',
                dataUrl: base64,
              });
            }
          } catch {
            // Fallback to raw audio
            const base64 = await blobToBase64(blob);
            onAttachment({
              name: `voice-${Date.now()}.webm`,
              type: 'audio/webm',
              dataUrl: base64,
            });
          }
          setTranscribing(false);
        } else {
          // Server-side: send raw audio
          const base64 = await blobToBase64(blob);
          onAttachment({
            name: `voice-${Date.now()}.webm`,
            type: 'audio/webm',
            dataUrl: base64,
          });
        }
      };

      await requestWakeLock();
      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
    }
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  if (transcribing) {
    return (
      <button
        type="button"
        disabled
        className="p-2 rounded-full bg-surface-container text-on-surface animate-pulse"
        title="Transcribing locally…"
      >
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      className={`p-2 rounded-full ${recording ? 'bg-error text-on-error animate-pulse' : 'bg-surface-container text-on-surface'}`}
      title={recording ? 'Stop recording' : 'Start voice'}
    >
      <span className="material-symbols-outlined">{recording ? 'mic' : 'mic_none'}</span>
    </button>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
