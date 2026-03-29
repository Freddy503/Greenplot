# @striderlabs/mcp-opentable

[![npm](https://img.shields.io/npm/v/@striderlabs/mcp-opentable)](https://www.npmjs.com/package/@striderlabs/mcp-opentable)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

MCP server for OpenTable — let AI agents search restaurants and book reservations.

Built by [Strider Labs](https://striderlabs.ai).

## Features

- Search restaurants by location, cuisine, party size, date and time
- Get detailed restaurant info — description, address, hours, and features
- Check real-time availability for any date, time, and party size
- Book reservations with a confirmation step before committing
- View all upcoming reservations in one place
- Cancel reservations safely with a confirm gate
- Persistent sessions — stay logged in across restarts

## Installation

```bash
npm install -g @striderlabs/mcp-opentable
```

Or with npx:

```bash
npx @striderlabs/mcp-opentable
```

## Configuration

Add to your MCP client configuration (e.g., Claude Desktop `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "opentable": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-opentable"]
    }
  }
}
```

## Authentication

This connector uses browser automation via Playwright. On first use:

1. Call `opentable_status` — it returns a login URL
2. Open the login URL in your browser and sign in to OpenTable
3. Session cookies are automatically saved to `~/.strider/opentable/cookies.json`
4. Sessions persist across restarts — no need to log in again

To log out or reset your session:

```
opentable_logout
```

## Available Tools

### Session Management

| Tool | Description |
|------|-------------|
| `opentable_status` | Check login status; returns login URL if not authenticated |
| `opentable_login` | Get the OpenTable login URL and instructions |
| `opentable_logout` | Clear stored session cookies (log out) |

### Discovery

| Tool | Description |
|------|-------------|
| `opentable_search` | Search restaurants by location, cuisine, party size, date/time |
| `opentable_get_restaurant` | Get full details for a specific restaurant |
| `opentable_check_availability` | List available time slots for a restaurant |

### Reservations

| Tool | Description |
|------|-------------|
| `opentable_make_reservation` | Book a reservation (requires `confirm=true`) |
| `opentable_get_reservations` | List all upcoming reservations |
| `opentable_cancel_reservation` | Cancel a reservation (requires `confirm=true`) |

## Example Usage

### Search for restaurants

```json
{
  "tool": "opentable_search",
  "arguments": {
    "location": "San Francisco",
    "cuisine": "italian",
    "partySize": 4,
    "date": "2026-03-20",
    "time": "19:30"
  }
}
```

### Check availability

```json
{
  "tool": "opentable_check_availability",
  "arguments": {
    "restaurantId": "restaurant-slug-or-id",
    "date": "2026-03-20",
    "time": "19:30",
    "partySize": 4
  }
}
```

### Book a reservation (two-step)

```json
// Step 1: Preview
{
  "tool": "opentable_make_reservation",
  "arguments": {
    "restaurantId": "restaurant-slug-or-id",
    "date": "2026-03-20",
    "time": "19:30",
    "partySize": 4,
    "specialRequests": "Window table if possible",
    "confirm": false
  }
}

// Step 2: Confirm and book
{
  "tool": "opentable_make_reservation",
  "arguments": {
    "restaurantId": "restaurant-slug-or-id",
    "date": "2026-03-20",
    "time": "19:30",
    "partySize": 4,
    "specialRequests": "Window table if possible",
    "confirm": true
  }
}
```

### View upcoming reservations

```json
{
  "tool": "opentable_get_reservations",
  "arguments": {}
}
```

### Cancel a reservation

```json
// Step 1: Preview cancellation
{
  "tool": "opentable_cancel_reservation",
  "arguments": {
    "reservationId": "res-abc123",
    "confirm": false
  }
}

// Step 2: Confirm cancellation
{
  "tool": "opentable_cancel_reservation",
  "arguments": {
    "reservationId": "res-abc123",
    "confirm": true
  }
}
```

## Requirements

- Node.js 18+
- Playwright browsers (auto-installed on first run via `playwright install chromium`)

## How It Works

This connector uses Playwright for browser automation:

1. **Headless Chrome** — runs a real browser in the background
2. **Cookie persistence** — maintains logged-in state across sessions
3. **Stealth mode** — uses realistic browser fingerprints to avoid detection
4. **Structured responses** — all data returned as JSON

## Security

- Session cookies are stored locally in `~/.strider/opentable/cookies.json`
- No credentials are stored — authentication uses browser-based login
- Cookies are only readable by the current OS user

## Limitations

- OpenTable must be available in your region
- Some reservation flows may require additional profile information on your OpenTable account
- Bot-detection countermeasures on OpenTable's site may occasionally interrupt automation

## Development

```bash
git clone https://github.com/markswendsen-code/mcp-opentable.git
cd mcp-opentable
npm install
npx playwright install chromium
npm run build
npm start
```

## License

MIT © [Strider Labs](https://striderlabs.ai)

## Related

- [@striderlabs/mcp-doordash](https://www.npmjs.com/package/@striderlabs/mcp-doordash) - DoorDash MCP connector
- [@striderlabs/mcp-gmail](https://www.npmjs.com/package/@striderlabs/mcp-gmail) - Gmail MCP connector
- [Model Context Protocol](https://modelcontextprotocol.io) - Learn more about MCP
