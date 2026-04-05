# Feature Spec: Voice Recording Screen

## Problem
The current mic button in the chat input doesn't open a proper recording screen. Users can't start, monitor, or stop voice recordings. This blocks 11+ voice-related seeds.

## Solution
When user taps the microphone button:
1. Opens a full-screen overlay with recording UI
2. Shows live waveform/level animation
3. Displays recording duration
4. Has clear "Stop" and "Cancel" buttons
5. On stop: sends to Whisper API for transcription
6. Transcription result appears in chat input

## UI Components
- **RecordingOverlay**: Full-screen modal with dark semi-transparent background
- **WaveformVisualizer**: Canvas-based or CSS animation showing audio levels
- **DurationDisplay**: MM:SS format counter
- **ControlButtons**: Stop (red) + Cancel (gray)

## Technical Flow
```
User taps mic → RecordingOverlay opens → getUserMedia starts recording
→ Level monitoring every 100ms → Duration counter every 1s
→ User taps Stop → MediaRecorder stops → Blob uploaded to Whisper API
→ Transcription result → inserted into chat input → Overlay closes
```

## Existing Code Base
- `use-voice-recorder.ts` hook already exists
- `PromptBox` component already has voice recording props
- Just need the full-screen overlay UI

## Edge Cases
- Permission denied → show helpful message
- No microphone → show error
- Network failure during upload → retry option
- Recording too long (>5 min) → auto-stop warning
