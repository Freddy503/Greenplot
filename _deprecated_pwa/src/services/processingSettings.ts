/**
 * Processing settings: local (privacy mode) vs server.
 * Persists to localStorage.
 */

export interface ProcessingSettings {
  localTranscription: boolean;
  localEmbeddings: boolean;
}

const STORAGE_KEY = 'seedify-processing-settings';

const defaults: ProcessingSettings = {
  localTranscription: false,  // default: server-side (simpler)
  localEmbeddings: false,
};

export function getSettings(): ProcessingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export function saveSettings(settings: ProcessingSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
