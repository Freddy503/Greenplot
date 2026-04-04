# TOOLS.md - Local Notes

## Git Config
- **Always use Freddy's identity for commits:**
  - `git config user.name` → `Freddy503`
  - `git config user.email` → `Freddy503@users.noreply.github.com`
  - Command: `git -c user.name="Freddy503" -c user.email="Freddy503@users.noreply.github.com" commit -m "..."`
  - Vercel Hobby blocks commits from unrecognized authors

## Vercel
- **NEXT_PUBLIC_ env vars are baked at build time** — must be set before deploy
- Frontend is HTTPS → backend calls must go through Next.js API proxy (mixed content blocks HTTP from HTTPS)
- Site: `seedify-six.vercel.app`

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## Exa Web Search
- **API key stored at:** `~/.config/exa/api_key`
- **Endpoint:** `https://api.exa.ai/search`
- **Usage:**
  ```bash
  EXA_KEY=$(cat ~/.config/exa/api_key)
  curl -s -X POST "https://api.exa.ai/search" \
    -H "x-api-key: $EXA_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query": "your search", "numResults": 5}'
  ```

## Notion
- **API key stored at:** `~/.config/notion/api_key`
- **API version:** `2025-09-03`
- **Usage:**
  ```bash
  NOTION_KEY=$(cat ~/.config/notion/api_key)
  curl -s "https://api.notion.com/v1/blocks/{page_id}/children" \
    -H "Authorization: Bearer $NOTION_KEY" \
    -H "Notion-Version: 2025-09-03"
  ```

---

Add whatever helps you do your job. This is your cheat sheet.
