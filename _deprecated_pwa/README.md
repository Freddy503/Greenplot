# Second Brain — PWA Frontend

React + Vite + TypeScript + Tailwind PWA, styled after Seedify designs.

## Features

- Vercel AI SDK `useChat` style custom hook with streaming
- Voice recording via MediaRecorder
- File attachments (text and images)
- TTS toggle (coming soon)
- Rating UI (stars + consent)
- Dark theme with emerald-green primary
- PWA manifest for install

## Quickstart

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure backend is running at http://localhost:8000 (OpenClaw API).

3. Run dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173

## Build

```bash
npm run build
```

Output in `dist/`.

## Environment

- `VITE_API_URL`: Override API base (default `/` which proxies to localhost:8000 via Vite dev server)
