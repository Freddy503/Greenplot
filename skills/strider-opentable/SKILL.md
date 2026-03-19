---
name: strider-opentable
description: Make restaurant reservations via OpenTable. Search restaurants, check availability, book tables.
metadata:
  openclaw:
    requires:
      bins: ["npx"]
    category: "commerce"
    author: "Strider Labs"
    homepage: "https://striderlabs.ai"
---

# Strider OpenTable Connector

Let your agent make restaurant reservations.

## Install

```bash
npm install @striderlabs/mcp-opentable
```

## Configure (Claude Desktop)

```json
{
  "mcpServers": {
    "opentable": {
      "command": "npx",
      "args": ["@striderlabs/mcp-opentable"]
    }
  }
}
```

## Example Usage

"Find Italian restaurants in San Francisco with availability tonight at 7pm for 2 people"

"Book a table at Flour + Water for Saturday at 8pm"

## Links

- npm: https://www.npmjs.com/package/@striderlabs/mcp-opentable
- Strider Labs: https://striderlabs.ai
