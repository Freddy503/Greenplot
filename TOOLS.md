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

---

Add whatever helps you do your job. This is your cheat sheet.
