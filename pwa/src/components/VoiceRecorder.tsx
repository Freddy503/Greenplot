import { useState, useRef } from 'react';
import { Attachment } from '../types';

export function VoiceRecorder({ onAttachment }: { onAttachment: (att: Attachment) => void }) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const base64 = await blobToBase64(blob);
        onAttachment({
          name: `voice-${Date.now()}.webm`,
          type: 'audio/webm',
          dataUrl: base64,
        });
        stream.getTracks().forEach(t => t.stop());
      };
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

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      className={`p-2 rounded-full ${recording ? 'bg-error text-on-error' : 'bg-surface-container text-on-surface'}`}
      title={recording ? 'Stop recording' : 'Start voice'}
    >
      <span className="material-symbols-outlined">{recording ? 'mic' : 'mic_none'}</span>
    </button>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
