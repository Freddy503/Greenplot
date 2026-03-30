/**
 * In-browser audio transcription using @xenova/transformers (Whisper tiny).
 * Falls back to null if model download fails or WebGPU unavailable.
 */

let transcriber: any = null;
let loading = false;
let loadError: string | null = null;

async function loadModel(): Promise<any> {
  if (transcriber) return transcriber;
  if (loadError) throw new Error(loadError);
  if (loading) {
    // Wait for existing load
    while (loading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (transcriber) return transcriber;
    throw new Error(loadError || 'Model failed to load');
  }

  loading = true;
  try {
    const { pipeline } = await import('@xenova/transformers');
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
    });
    loading = false;
    return transcriber;
  } catch (err: any) {
    loadError = err.message || 'Failed to load Whisper model';
    loading = false;
    throw err;
  }
}

/**
 * Transcribe an audio Blob to text.
 * Returns null if transcription fails.
 */
export async function transcribeAudio(blob: Blob): Promise<string | null> {
  try {
    const model = await loadModel();

    // Convert blob to audio buffer
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Get mono channel data
    const channelData = audioBuffer.getChannelData(0);

    const result = await model(channelData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    });

    audioCtx.close();
    return result?.text?.trim() || null;
  } catch (err) {
    console.warn('Whisper transcription failed:', err);
    return null;
  }
}

/**
 * Check if local transcription is likely to work.
 */
export function isLocalTranscriptionAvailable(): boolean {
  return typeof AudioContext !== 'undefined' && typeof indexedDB !== 'undefined';
}
