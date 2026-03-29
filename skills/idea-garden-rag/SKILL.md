# Skill: Idea Garden RAG (Weaviate + Notion)

## Purpose

When a new entry appears in Freddy's Receptive State Parking Lot (Notion), query the Weaviate Idea Garden index to surface related seeds and cross-connections. Synthesize a concise insight message and send it to Freddy via Telegram.

This skill runs on **Nemotron** (nvidia/llama-3.1-nemotron-ultra-253b-v1 or nemotron-4-mini). Do not use Anthropic XML tags. Use clean Markdown and strict JSON where specified.

---

## Trigger Condition

This skill fires when:
- A new page is detected in the Notion Parking Lot database (`1dbe354d-a0fa-4715-81ab-6cd8aea06ebc`)
- OR manually invoked with a query string

---

## Step 1: Extract the New Parking Lot Entry

Read the latest Parking Lot entry from Notion. Extract the full text of the entry (transcription + key takeaway if present).

Concatenate into a single `query_text` string. Strip filler words, keep substance.

---

## Step 2: Query Weaviate

Run the sync script in query-only mode:

```bash
python3 /root/.openclaw/workspace/skills/idea-garden-rag/sync_and_fetch_weaviate.py \
  --query "<query_text>" \
  --top-k 5
```

Parse the **JSON OUTPUT** section at the end of stdout. It will be:

```json
{
  "query": "...",
  "results": [
    {
      "rank": 1,
      "title": "...",
      "source": "idea_garden | parking_lot",
      "created": "YYYY-MM-DD",
      "url": "https://www.notion.so/...",
      "score": 0.87,
      "excerpt": "..."
    }
  ]
}
```

Discard results with `score < 0.5`. Keep top 3.

---

## Step 3: Synthesize with Nemotron

Call the NVIDIA NIM chat completions endpoint with this exact structure:

**Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`
**Model:** `nvidia/llama-3.1-nemotron-ultra-253b-v1`
**Auth:** `Bearer $NVIDIA_API_KEY`

**System prompt:**

```
You are Woody, Freddy's personal AI assistant. You help him connect ideas across time.
Your job: given a new Parking Lot entry and a set of related Idea Garden seeds, write a SHORT synthesis (max 5 bullet points) that surfaces genuine connections.

Rules:
- Be specific. Quote or paraphrase the actual seed content.
- Use the phrase "This echoes..." or "This connects to..." to link ideas.
- End with ONE concrete next action Freddy could take.
- Output clean Markdown only. No XML tags. No headers. Just bullets + one action line.
- Max 250 words total.
```

**User message:**

```
New Parking Lot entry:
---
<full text of new entry>
---

Related seeds found in the Idea Garden (ranked by relevance):
<for each result: title, excerpt, created date, url>

Write the synthesis.
```

---

## Step 4: Send to Telegram

Send the synthesis message to Freddy's Telegram chat using OpenClaw's native routing.

Format:

```
🌱 Idea Garden — New Connections Found

<Nemotron synthesis here>

---
Sources:
- [Title](url) — score: 0.87
- [Title](url) — score: 0.79
```

---

## Step 5: Re-sync Weaviate (after new entry)

After processing, add the new Parking Lot entry to Weaviate so future queries benefit from it:

```bash
python3 /root/.openclaw/workspace/skills/idea-garden-rag/sync_and_fetch_weaviate.py --sync
```

---

## Environment Requirements

| Variable | Value |
|---|---|
| `NVIDIA_API_KEY` | Set in environment |
| `WEAVIATE_URL` | `http://localhost:8080` |
| Weaviate | Running via Docker (see `weaviate/docker-compose.yml`) |
| Notion API key | `~/.config/notion/api_key` |

---

## Paths

| File | Path |
|---|---|
| Sync script | `/root/.openclaw/workspace/skills/idea-garden-rag/sync_and_fetch_weaviate.py` |
| Weaviate compose | `/root/.openclaw/workspace/weaviate/docker-compose.yml` |
| Skill | `/root/.openclaw/workspace/skills/idea-garden-rag/SKILL.md` |
| Parking Lot DB | Notion DB ID `1dbe354d-a0fa-4715-81ab-6cd8aea06ebc` |
| Idea Garden page | Notion page ID `331fbc8d-40a5-81b0-93f3-f27fcf49de50` |

---

## Error Handling

- If Weaviate is unreachable: log error, notify Freddy, skip synthesis.
- If NVIDIA API returns error: log and retry once with backoff.
- If no results above threshold: notify Freddy "No close connections found yet — the Garden is still growing."
- Never fail silently.
