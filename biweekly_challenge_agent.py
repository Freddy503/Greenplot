#!/usr/bin/env python3
"""
biweekly_challenge_agent.py
Run every 2 weeks to find knowledge gaps and generate counter-intuitive challenges.
"""

import os, sys, json, urllib.request, datetime
from neo4j import GraphDatabase

# Config
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "StrongPasswordHere123!")
NOTION_KEY = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
NOTION_VERSION = "2022-06-28"

# Notion DB IDs
IDEA_GARDEN_DB = "331fbc8d-40a5-816b-80e0-ea68ff4ba64d"
PARKING_LOT_DB = "331fbc8d-40a5-8119-bff8-fa81e339ed97"
JOURNAL_DB = "3866fe8b-57e0-4629-afc5-11776e8960dc"
CHALLENGE_DB = "332fbc8d-40a5-81b8-9e8f-123456789abc"  # will create if needed

def notion_query_db(db_id, filter_props=None):
    """Query a Notion database and return pages."""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    headers = {
        "Authorization": f"Bearer {NOTION_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }
    data = {"page_size": 100}
    if filter_props:
        data["filter"] = filter_props
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers)
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
    return res.get("results", [])

def get_seed_stats():
    """Analyze Idea Garden for domain distribution and connectivity."""
    seeds = notion_query_db(IDEA_GARDEN_DB)
    domain_counts = {}
    tag_counts = {}
    isolated_seeds = []
    
    for page in seeds:
        props = page["properties"]
        title = "".join(x["plain_text"] for x in props.get("Seed", {}).get("title", []))
        # Domain multi_select
        domain_prop = props.get("Domain", {}).get("multi_select", [])
        domains = [d["name"] for d in domain_prop]
        for d in domains:
            domain_counts[d] = domain_counts.get(d, 0) + 1
        # Tags? (if exist)
        # Connections: check Connections rich_text length or count
        connections_prop = props.get("Connections", {}).get("rich_text", [])
        connections_text = "".join(x["plain_text"] for x in connections_prop)
        # Rough heuristic: if connections mention fewer than 2 other seeds, consider isolated
        if len(connections_text.split(",")) < 2:
            isolated_seeds.append(title)
    
    return {
        "total_seeds": len(seeds),
        "domain_counts": domain_counts,
        "isolated_seeds": isolated_seeds[:10]  # top 10
    }

def get_journal_stats():
    """Check journal entry frequency and energy levels."""
    journals = notion_query_db(JOURNAL_DB)
    # Group by date and energy
    energy_counts = {}
    recent = 0
    for page in journals:
        created = page.get("created_time", "")[:10]
        # Recent: last 7 days
        if created >= (datetime.date.today() - datetime.timedelta(days=7)).isoformat():
            recent += 1
        energy_prop = page["properties"].get("Energy", {}).get("select", {})
        energy = energy_prop.get("name", "Unknown")
        energy_counts[energy] = energy_counts.get(energy, 0) + 1
    return {
        "total_entries": len(journals),
        "recent_week": recent,
        "energy_distribution": energy_counts
    }

def generate_challenge(stats, journal_stats):
    """Use a low-cost LLM (Claude Sonnet) to generate counter-intuitive takes."""
    import openai  # using OpenRouter
    
    openai.api_key = os.getenv("OPENROUTER_API_KEY")
    openai.base_url = "https://openrouter.ai/api/v1"
    
    prompt = f"""
You are a provocative thinking assistant. Analyze this Second Brain stats and propose a bold challenge.

Stats:
- Total seeds: {stats['total_seeds']}
- Domain distribution: {json.dumps(stats['domain_counts'], indent=2)}
- Isolated seeds (lack connections): {len(stats['isolated_seeds'])}. Examples: {', '.join(stats['isolated_seeds'][:5])}
- Journal entries: {journal_stats['total_entries']} total, {journal_stats['recent_week']} in last 7 days
- Energy distribution: {json.dumps(journal_stats['energy_distribution'], indent=2)}

Task:
1. Identify 2-3 glaring gaps (domains with very few seeds, or missing combinations)
2. Propose one counter-intuitive take that challenges Freddy's current assumptions (e.g., "What if the opposite of 'more AI agents is better' is true?")
3. Suggest one concrete experiment for the next 2 weeks to test this challenge

Keep it under 200 words. Be sharp, not generic.
"""
    
    response = openai.chat.completions.create(
        model="openrouter/nvidia/nemotron-3-super-120b-a12b:free",
        messages=[
            {"role": "system", "content": "You are a helpful, contrarian thinking partner."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=500,
        temperature=0.8
    )
    # response may be a dict with choices[] OR a raw string depending on the client
    if isinstance(response, str):
        return response.strip()
    return response.choices[0].message.content.strip()

def create_notion_challenge_page(challenge_text, stats):
    """Create a new page in the Biweekly Challenge DB."""
    # Ensure DB exists - create if needed
    # For now, we'll use a simple page under OpenClaw parent
    parent_id = "19231104-e27a-4ea3-888f-ae449d2076ae"  # OpenClaw page
    page_data = {
        "parent": {"page_id": parent_id},
        "properties": {
            "title": {"title": [{"text": {"content": f"Biweekly Challenge — {datetime.date.today().isoformat()}"}}]}
        },
        "children": [
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Knowledge Gap Analysis"}}]}
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": f"Total seeds: {stats['total_seeds']}\nDomain distribution: {json.dumps(stats['domain_counts'], indent=2)}\nIsolated seeds: {len(stats['isolated_seeds'])}"}}]}
            },
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Counter-Intuitive Take & Experiment"}}]}
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": challenge_text}}]}
            }
        ]
    }
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {NOTION_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, data=json.dumps(page_data).encode(), headers=headers)
    with urllib.request.urlopen(req) as r:
        page = json.loads(r.read())
    return f"https://www.notion.so/{page['id'].replace('-','')}"

def main():
    print("=== Biweekly Challenge Agent ===")
    stats = get_seed_stats()
    journal_stats = get_journal_stats()
    print(f"Stats collected: {stats['total_seeds']} seeds, {journal_stats['total_entries']} journal entries")
    
    challenge = generate_challenge(stats, journal_stats)
    print(f"\nChallenge generated:\n{challenge}\n")
    
    url = create_notion_challenge_page(challenge, stats)
    print(f"Challenge page created: {url}")
    
    # Also output JSON for skill consumption if needed
    print("\n=== JSON OUTPUT ===")
    print(json.dumps({
        "date": datetime.date.today().isoformat(),
        "stats": stats,
        "journal_stats": journal_stats,
        "challenge": challenge,
        "page_url": url
    }, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
