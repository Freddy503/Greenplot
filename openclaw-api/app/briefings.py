"""
Briefing generation module for personalized notifications.

Generates rich, multi-section briefings for:
- Morning Idea Spark (Weather + Deep Pattern)
- Daily Briefing (News + Academic)
- Evening Reflection (Contrarian + Actionable)
- Weekly Content Eval (What Stuck + Constraints)
- Biweekly Challenge (Cross-domain synthesis)

Uses:
- OpenRouter (via OpenAI SDK) for LLM: Nemotron Super (qwen/qwen3-235b-a22b)
- Exa API for web search
- Open-Meteo for weather (free)
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import json
import httpx
import os

logger = logging.getLogger(__name__)

# Global LLM client (OpenRouter via OpenAI SDK)
_llm_client = None


def get_llm_client():
    """Get or initialize OpenRouter client via OpenAI SDK."""
    global _llm_client
    if _llm_client is None:
        try:
            from openai import OpenAI
            from app.config import settings

            api_key = settings.OPENROUTER_API_KEY or os.environ.get('OPENROUTER_API_KEY')
            if not api_key:
                logger.warning("⚠️ OPENROUTER_API_KEY not configured")
                return None

            _llm_client = OpenAI(
                api_key=api_key,
                base_url=settings.OPENROUTER_BASE_URL
            )
            logger.info("✓ OpenRouter client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize LLM client: {e}")
            _llm_client = None
    return _llm_client


def _call_llm(prompt: str, system: str = "", max_tokens: int = 1500, model: str = None) -> str:
    """
    Call OpenRouter LLM with a prompt.
    Default model: Nemotron Super (qwen/qwen3-235b-a22b)
    Returns empty string on failure.
    """
    try:
        client = get_llm_client()
        if not client:
            logger.warning("No LLM client available")
            return ""

        # Use provided model or default to Nemotron Super
        if not model:
            model = "qwen/qwen3-235b-a22b"

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7
        )

        content = response.choices[0].message.content if response.choices else ""
        # Strip any chain-of-thought thinking blocks (some models emit these)
        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        return content
    except Exception as e:
        logger.error(f"LLM call failed (model={model}): {e}")
        # Try fallback model
        if model != "qwen/qwen3-235b-a22b":
            logger.info("Retrying with Nemotron fallback...")
            return _call_llm(prompt, system, max_tokens, model="qwen/qwen3-235b-a22b")
        return ""


async def fetch_web_search(query: str, limit: int = 5) -> List[Dict[str, str]]:
    """
    Fetch recent web search results using Exa API.
    Returns: [{"title": "...", "url": "...", "snippet": "..."}, ...]
    """
    try:
        from app.config import settings

        exa_key = settings.EXA_API_KEY or os.environ.get('EXA_API_KEY')
        if not exa_key:
            logger.warning("⚠️ EXA_API_KEY not configured")
            return []

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.exa.ai/search",
                headers={
                    "x-api-key": exa_key,
                    "Content-Type": "application/json"
                },
                json={
                    "query": query,
                    "numResults": limit,
                    "type": "auto"
                },
                timeout=15.0
            )

            if response.status_code != 200:
                logger.warning(f"Exa API returned {response.status_code}")
                return []

            data = response.json()
            results = []
            for r in data.get("results", [])[:limit]:
                # Exa returns: title, url, text (snippet)
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("text", "")[:300] if r.get("text") else ""
                })

            logger.info(f"✓ Exa search returned {len(results)} results for '{query}'")
            return results

    except Exception as e:
        logger.error(f"Web search (Exa) failed: {e}")
        return []


def fetch_user_themes(user_id: str, db) -> List[str]:
    """
    Extract dominant themes from user's recent chats/seeds.
    Returns: ["agentic systems", "PKM", ...]
    """
    try:
        from app.models import Thought, Seed
        # Get recent seeds (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_seeds = db.query(Seed).filter(
            Seed.user_id == user_id,
            Seed.created_at >= thirty_days_ago,
            (Seed.archived == False) | (Seed.archived == None),
            (Seed.quality_score >= 0.3) | (Seed.quality_score == None)
        ).order_by(Seed.created_at.desc()).limit(20).all()

        if not recent_seeds:
            return ["learning", "research"]

        # Combine seed content
        text = " ".join([s.content for s in recent_seeds if s.content])

        # Simple keyword extraction
        _stopwords = {'about', 'which', 'their', 'where', 'these', 'there', 'would',
                      'could', 'should', 'other', 'being', 'after', 'before', 'while',
                      'using', 'based', 'given', 'might', 'often', 'since', 'within'}
        keywords = {}
        for word in text.lower().split():
            if len(word) > 4 and word not in _stopwords:
                keywords[word] = keywords.get(word, 0) + 1

        top_words = sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:3]
        keyword_themes = [w[0] for w in top_words]

        # Pull seed titles, truncate to first 3 words for clean Exa queries
        _title_stopwords = {'how', 'why', 'what', 'when', 'the', 'and', 'for', 'with', 'that', 'this', 'from'}
        seed_titles = [s.title for s in recent_seeds if getattr(s, 'title', None) and len(s.title) > 3]
        title_themes = []
        for t in seed_titles[:5]:
            words = [w for w in t.lower().split() if len(w) > 3 and w not in _title_stopwords]
            if words:
                title_themes.append(" ".join(words[:3]))

        # Combine, dedup, return top 3
        combined = list(dict.fromkeys(keyword_themes + title_themes))
        return combined[:3] if combined else ["learning"]
    except Exception as e:
        logger.error(f"Failed to extract themes: {e}")
        return ["learning", "research"]


def fetch_garden_context(user_id: str, themes: List[str], db) -> List[Dict[str, str]]:
    """
    Return up to 5 seed snippets from the last 90 days that relate to the given themes.
    Used to ground the academic digest in the user's existing knowledge.
    """
    try:
        from app.models import Seed
        ninety_days_ago = datetime.utcnow() - timedelta(days=90)
        seeds = db.query(Seed).filter(
            Seed.user_id == user_id,
            Seed.created_at >= ninety_days_ago
        ).order_by(Seed.created_at.desc()).limit(60).all()

        theme_words = set(t.lower() for t in themes)
        scored = []
        for s in seeds:
            if not s.content:
                continue
            text = (s.title or "") + " " + s.content
            score = sum(1 for w in theme_words if w in text.lower())
            if score > 0:
                scored.append((score, s))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {"title": s.title or "(untitled)", "snippet": s.content[:200]}
            for _, s in scored[:5]
        ]
    except Exception as e:
        logger.error(f"fetch_garden_context failed: {e}")
        return []


def fetch_wiki_context(themes: List[str]) -> List[Dict[str, str]]:
    """
    Read wiki/*.md files and return relevant paragraph excerpts for the given themes.
    No vector search — simple keyword matching is sufficient.
    """
    import os, glob as _glob
    try:
        from app.config import settings
        wiki_dir = settings.WIKI_DATA_PATH
    except Exception:
        wiki_dir = "/data/wiki"

    results = []
    theme_words = [t.lower() for t in themes]

    try:
        md_files = _glob.glob(os.path.join(wiki_dir, "*.md"))
        for path in md_files[:30]:  # cap file scan
            try:
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
                fname = os.path.basename(path)
                # Split into paragraphs and score each
                paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 80]
                for para in paragraphs:
                    score = sum(1 for w in theme_words if w in para.lower())
                    if score >= 1:
                        results.append((score, fname, para[:400]))
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Wiki context fetch error: {e}")

    results.sort(key=lambda x: x[0], reverse=True)
    return [
        {"source": fname, "excerpt": excerpt}
        for _, fname, excerpt in results[:3]
    ]


def get_user_city(user_id: str, db) -> Optional[str]:
    """Get user's city from profile."""
    try:
        from app.models import User
        user = db.query(User).filter(User.id == user_id).first()
        return user.city if user else None
    except:
        return None


async def fetch_weather(city: Optional[str]) -> Optional[str]:
    """Fetch weather for a city using Open-Meteo (free, no API key)."""
    if not city:
        return None
    try:
        async with httpx.AsyncClient() as client:
            # Geocode the city
            geo_response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "en"}
            )
            geo_data = geo_response.json()
            if not geo_data.get("results"):
                return None

            location = geo_data["results"][0]
            lat, lon = location["latitude"], location["longitude"]

            # Get current weather
            weather_response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "temperature_unit": "celsius"
                }
            )
            weather_data = weather_response.json()
            current = weather_data.get("current", {})

            if not current:
                return None

            temp = current.get("temperature_2m", "?")
            humidity = current.get("relative_humidity_2m", "?")
            wind = current.get("wind_speed_10m", "?")
            code = current.get("weather_code", 0)

            # Simple weather code to description
            weather_desc = {
                0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
                45: "Foggy", 48: "Depositing rime fog",
                51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
                61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
                71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
                80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
                85: "Slight snow showers", 86: "Heavy snow showers",
                95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail"
            }.get(code, "Unknown")

            return f"{weather_desc}, {temp}°C, humidity {humidity}%, wind {wind} km/h"
    except Exception as e:
        logger.error(f"Weather fetch failed: {e}")
        return None


def build_morning_spark(
    user_id: str,
    db,
    city: Optional[str] = None,
    weather: Optional[str] = None,
    themes: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Build morning spark: Weather + Deep Pattern from user's research interests.
    """
    if not city:
        city = get_user_city(user_id, db)
    if not themes:
        themes = fetch_user_themes(user_id, db)

    # Generate deep pattern using LLM
    theme_str = ", ".join(themes[:2])
    llm_prompt = f"""
Based on these research themes: {theme_str}

Generate a bold, thought-provoking "deep pattern" from recent industry developments:
- What concept/trend is emerging?
- What problem does it solve?
- How does it work (briefly)?
- A real-world production example
- How it relates to {theme_str}

Keep to 150 words. Be specific, not generic. Use sources if available.
Format as: [Concept Name] / [Problem Solved] / [How it works] / [Example] / [Relevance]
"""

    deep_pattern = _call_llm(
        llm_prompt,
        max_tokens=500,
        model="qwen/qwen3-235b-a22b"  # Nemotron is more reliable
    )
    if not deep_pattern:
        deep_pattern = f"Explore emerging patterns in {theme_str}. What new architectures or techniques are changing how we build systems in these domains?"

    return {
        "type": "morning_spark",
        "title": f"{datetime.now().strftime('%A, %B %d')} — Deep Pattern",
        "subtitle": f"Tailored to your interests in {theme_str}",
        "sections": [
            {
                "title": f"Weather — {city or 'Your Location'}",
                "icon": "cloud",
                "color": "text-blue-400",
                "content": weather or "Check your local weather today."
            },
            {
                "title": "Deep Pattern",
                "icon": "architecture",
                "color": "text-primary",
                "content": deep_pattern,
                "sources": [
                    {"title": "Recent research & industry trends", "url": "https://arxiv.org"},
                ]
            }
        ],
        "prompt": f"Weather: {weather or 'unknown'}. Deep pattern: {deep_pattern}"
    }


async def build_daily_briefing(
    user_id: str,
    db,
    themes: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Build daily briefing: Enterprise AI News + Academic Papers.
    """
    if not themes:
        themes = fetch_user_themes(user_id, db)

    theme_str = ", ".join(themes[:2])

    # Search for news
    news_results = await fetch_web_search(f"{theme_str} AI news 2026", limit=3)
    academic_results = await fetch_web_search(f"{theme_str} research paper 2026 site:arxiv.org", limit=1)

    # Synthesize with LLM
    news_prompt = f"""
From these search results about {theme_str}:
{json.dumps(news_results, indent=2)}

Extract 2-3 key news items. For each: headline, 1-2 sentence summary, actionable insight.
Keep concise. Format as bullet points.
"""

    news_synthesis = _call_llm(
        news_prompt,
        max_tokens=600,
        model="qwen/qwen3-235b-a22b"  # Longer context for news synthesis
    )
    if not news_synthesis:
        news_synthesis = "• Check recent news on " + theme_str + " for latest enterprise AI developments."

    academic_prompt = f"""
From this research paper:
{json.dumps(academic_results[0] if academic_results else {"title": "Emerging research"}, indent=2)}

Summarize in 2-3 sentences: What's the contribution? Why should {theme_str} practitioners care?
"""

    academic_synthesis = _call_llm(
        academic_prompt,
        max_tokens=300,
        model="qwen/qwen3-235b-a22b"
    )
    if not academic_synthesis:
        academic_synthesis = "Explore recent academic work in your domain."

    return {
        "type": "daily_briefing",
        "title": "Daily Briefing",
        "subtitle": f"{datetime.now().strftime('%A, %B %d')} – Enterprise AI & Research",
        "sections": [
            {
                "title": "Enterprise AI News",
                "icon": "newspaper",
                "color": "text-blue-400",
                "content": news_synthesis,
                "sources": [{"title": r["title"][:50], "url": r["url"]} for r in news_results[:2]]
            },
            {
                "title": "Academic Spotlight",
                "icon": "school",
                "color": "text-purple-400",
                "content": academic_synthesis,
                "sources": [{"title": r["title"][:50], "url": r["url"]} for r in academic_results]
            }
        ],
        "prompt": f"News: {news_synthesis}. Academic: {academic_synthesis}"
    }


def build_reflection(user_id: str, db) -> Dict[str, Any]:
    """
    Build evening reflection: Contrarian view + Actionable move.
    """
    themes = fetch_user_themes(user_id, db)
    theme_str = ", ".join(themes[:2])

    contrarian_prompt = f"""
Imagine you spent today working on {theme_str}.
What's the most contrarian argument against your main focus?
- Something most people would disagree with
- But potentially true
- In 1-2 sentences

Then propose ONE concrete 15-minute action for tomorrow that tests this contrarian view.
"""

    contrarian = _call_llm(
        contrarian_prompt,
        max_tokens=300,
        model="qwen/qwen3-235b-a22b"
    )
    if not contrarian:
        contrarian = f"Question your assumptions about {theme_str}. What would change if you were wrong?"

    return {
        "type": "reflection",
        "title": "Evening Reflection",
        "subtitle": datetime.now().strftime('%A, %B %d'),
        "sections": [
            {
                "title": "Contrarian View",
                "icon": "psychology",
                "color": "text-purple-400",
                "content": contrarian.split('\n')[0] if '\n' in contrarian else contrarian
            },
            {
                "title": "Actionable Move",
                "icon": "task_alt",
                "color": "text-green-400",
                "content": contrarian.split('\n')[1] if '\n' in contrarian else "Tomorrow: Test one assumption from today."
            }
        ],
        "prompt": contrarian
    }


def build_weekly_eval(user_id: str, db) -> Dict[str, Any]:
    """
    Build weekly eval: What stuck + Creative constraint.
    """
    themes = fetch_user_themes(user_id, db)
    theme_str = ", ".join(themes[:2])

    eval_prompt = f"""
Based on a week focused on {theme_str}:

1. What theme emerged strongest? Why?
2. What topic was touched but not deep-dived?
3. Propose ONE creative constraint for next week that forces depth:
   - Examples: "cite 2+ sources", "no reusing same concept", "one conversation with outside expert"

Be analytical. Format: [Theme] / [Gap] / [Next Week's Constraint]
"""

    evaluation = _call_llm(
        eval_prompt,
        max_tokens=400,
        model="qwen/qwen3-235b-a22b"  # Longer context for analysis
    )
    if not evaluation:
        evaluation = f"Review your {theme_str} work this week. What emerged as most valuable?"

    return {
        "type": "weekly_eval",
        "title": "Weekly Content Eval",
        "subtitle": f"Week of {(datetime.now() - timedelta(days=7)).strftime('%b %d')}",
        "sections": [
            {
                "title": "What Stuck",
                "icon": "trending_up",
                "color": "text-green-400",
                "content": evaluation.split('\n')[0] if '\n' in evaluation else evaluation
            },
            {
                "title": "What Didn't",
                "icon": "help_outline",
                "color": "text-yellow-400",
                "content": evaluation.split('\n')[1] if '\n' in evaluation else "Identify topics to revisit."
            },
            {
                "title": "Creative Constraint for Next Week",
                "icon": "auto_awesome",
                "color": "text-purple-400",
                "content": evaluation.split('\n')[2] if len(evaluation.split('\n')) > 2 else "Push deeper on one area."
            }
        ],
        "prompt": evaluation
    }


def build_biweekly_challenge(user_id: str, db) -> Dict[str, Any]:
    """
    Build biweekly challenge: Cross-domain synthesis.
    """
    themes = fetch_user_themes(user_id, db)
    if len(themes) < 2:
        themes = themes + ["new domain"]

    challenge_prompt = f"""
Cross-domain challenge:

Domain A (your strength): {themes[0]}
Domain B (weaker area): {themes[1]}

Task: Take ONE concept/pattern from A and apply it to solve a problem in B.

Format:
- The Idea: [Concept from A] → [Problem in B]
- 3 Concrete Steps to experiment
- Expected outcome (measurable)

Be specific, not abstract. 15-min experiment.
"""

    challenge = _call_llm(
        challenge_prompt,
        max_tokens=500,
        model="nvidia/llama-3.1-nemotron-ultra-253b-v1"
    )
    if not challenge:
        challenge = f"Apply concepts from {themes[0]} to solve a challenge in {themes[1]}."

    return {
        "type": "challenge",
        "title": "Biweekly Cross-Domain Challenge",
        "subtitle": f"Until {(datetime.now() + timedelta(days=14)).strftime('%b %d')}",
        "sections": [
            {
                "title": "Challenge Setup",
                "icon": "emoji_events",
                "color": "text-red-400",
                "content": f"Apply **{themes[0]}** to solve a **{themes[1]}** bottleneck"
            },
            {
                "title": "The Idea",
                "icon": "lightbulb",
                "color": "text-amber-400",
                "content": challenge.split('\n\n')[0] if '\n\n' in challenge else challenge
            },
            {
                "title": "How to Experiment",
                "icon": "science",
                "color": "text-blue-400",
                "content": challenge.split('\n\n')[1] if '\n\n' in challenge else "1. Pick a small problem.\n2. Apply the concept.\n3. Measure the result."
            }
        ],
        "prompt": challenge
    }


async def _fetch_arxiv_papers(themes: List[str], limit: int = 5) -> List[Dict]:
    """
    Search Exa for arXiv papers matching themes, returning only individual
    abstract pages (arxiv.org/abs/XXXX.XXXXX) — never category listing pages.
    """
    import re as _re
    from app.config import settings as _settings
    query = " ".join(themes[:3]) + " 2025 2026"
    try:
        exa_key = _settings.EXA_API_KEY or os.environ.get('EXA_API_KEY', '')
        if not exa_key:
            return []
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                json={
                    "query": query,
                    "numResults": limit * 3,
                    "type": "neural",
                    "includeDomains": ["arxiv.org"],
                },
                timeout=15.0,
            )
            if response.status_code != 200:
                logger.warning(f"[academic_digest] Exa arXiv search returned {response.status_code}")
                return []
            results = response.json().get("results", [])
            abs_re = _re.compile(r'arxiv\.org/abs/\d{4}\.\d{4,5}')
            filtered = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": (r.get("text", "") or "")[:300],
                }
                for r in results if abs_re.search(r.get("url", ""))
            ]
            logger.info(f"[academic_digest] arXiv search: {len(results)} raw → {len(filtered)} abs/ papers for '{query}'")
            # If not enough abs/ papers, do a second search with different phrasing
            if len(filtered) < limit:
                query2 = " ".join(themes[1:3]) + " machine learning agent 2025"
                resp2 = await client.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                    json={"query": query2, "numResults": limit * 2, "type": "neural", "includeDomains": ["arxiv.org"]},
                    timeout=15.0,
                )
                if resp2.status_code == 200:
                    r2 = resp2.json().get("results", [])
                    seen = {p["url"] for p in filtered}
                    for r in r2:
                        if abs_re.search(r.get("url", "")) and r.get("url") not in seen:
                            filtered.append({"title": r.get("title",""), "url": r.get("url",""), "snippet": (r.get("text","") or "")[:300]})
                            seen.add(r.get("url",""))
        return filtered[:limit]
    except Exception as e:
        logger.error(f"[academic_digest] arXiv paper search failed: {e}")
        return []


def _save_papers_as_seeds(papers: list, user_id: str, db) -> int:
    """Save academic digest papers as Garden seeds. Deduplicates by source_url."""
    import uuid as _uuid
    from app.models import Seed, User
    saved = 0
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return 0
    for paper in papers:
        url = paper.get("url", "")
        title = (paper.get("title", "") or "").strip()
        content = (paper.get("content", "") or paper.get("snippet", "")).strip()
        if not title or len(content) < 50:
            continue
        # Deduplicate: skip if a seed with this source_url already exists
        try:
            existing = db.query(Seed).filter(
                Seed.user_id == user_id,
                Seed.seed_metadata["source_url"].astext == url
            ).first()
            if existing:
                continue
        except Exception:
            pass  # JSON path query not supported — skip dedup, still save
        seed = Seed(
            id=_uuid.uuid4(),
            tenant_id=user.tenant_id,
            user_id=user_id,
            title=title[:200],
            content=content[:3000],
            created_by="agent_research",
            created_via="academic_digest",
            seed_metadata={
                "tags": ["research-paper", "arxiv"],
                "domain": "Research",
                "source_url": url,
                "energy": "HIGH",
            },
        )
        db.add(seed)
        saved += 1
    if saved:
        db.commit()
        logger.info(f"[academic_digest] Auto-saved {saved} papers as Garden seeds for user {user_id}")
    return saved


async def build_academic_digest(user_id: str, db) -> Dict[str, Any]:
    """
    Build a daily academic + practical digest that connects new research
    to the user's existing Garden seeds and Wiki knowledge.

    Sections: Weather · Academic Spotlight · Enterprise News ·
              Challenging Take · Actionable Move · Solution Design Seed
    """
    import re as _re

    themes = fetch_user_themes(user_id, db)
    # Always lead with "agentic AI" — inject if not already present
    if "agentic" not in " ".join(themes).lower():
        themes = ["agentic AI"] + themes[:2]
    theme_str = ", ".join(themes[:3])
    city = get_user_city(user_id, db)
    today = datetime.now().strftime("%a %b %d, %Y")

    # Gather context in parallel-ish (sequential but fast)
    garden_ctx = fetch_garden_context(user_id, themes, db)
    wiki_ctx = fetch_wiki_context(themes)
    weather = await fetch_weather(city)

    # Fetch arXiv papers (abs/ pages only) + enterprise news
    paper_results = await _fetch_arxiv_papers(themes, limit=8)
    news_results = await fetch_web_search(f"enterprise AI {theme_str} news {today}", limit=3)

    # Deduplicate papers by URL
    seen = set()
    unique_papers = []
    for p in paper_results:
        if p["url"] not in seen:
            seen.add(p["url"])
            unique_papers.append(p)

    # Fetch full text for top 4 papers
    from app.enricher import fetch_url_content
    paper_texts = []
    for paper in unique_papers[:4]:
        full = fetch_url_content(paper["url"])
        paper_texts.append({
            "title": paper["title"],
            "url": paper["url"],
            "text": full[:3000] if full else paper.get("snippet", ""),
        })

    # Build the LLM context block
    garden_block = "\n".join(
        f"- [{s['title']}]: {s['snippet']}" for s in garden_ctx
    ) or "No recent seeds."
    wiki_block = "\n".join(
        f"[{w['source']}]: {w['excerpt']}" for w in wiki_ctx
    ) or "No wiki articles found."
    papers_block = "\n\n".join(
        f"PAPER: {p['title']}\nURL: {p['url']}\n{p['text']}"
        for p in paper_texts
    ) or "No papers found."
    news_block = "\n".join(
        f"- {n['title']} ({n['url']}): {n['snippet']}"
        for n in news_results[:3]
    ) or "No news results."

    system_prompt = (
        "You are a research-to-practice synthesizer for a personal knowledge management system. "
        "Your job: connect new academic research to the user's existing knowledge and ongoing work, "
        "producing insights that are both intellectually rigorous and immediately actionable. "
        "The user's focus areas: " + theme_str + ". "
        "Always relate findings back to how they apply to enterprise AI deployment and forward-deployed engineering. "
        "Output valid JSON only (no markdown fences)."
    )

    user_prompt = f"""Today: {today}

USER'S RECENT GARDEN SEEDS (what they've been thinking about):
{garden_block}

USER'S WIKI KNOWLEDGE (what they already know well):
{wiki_block}

NEW ACADEMIC PAPERS:
{papers_block}

ENToperationalRISE AI NEWS TODAY:
{news_block}

Produce a JSON object with this exact structure:
{{
  "papers": [
    {{
      "title": "Paper title + authors + year",
      "content": "3-4 sentences: what problem it solves, key finding, why it matters for enterprise AI or agentic systems. Connect to user's existing seeds/wiki where relevant.",
      "url": "arxiv_url"
    }}
  ],
  "news_items": [
    {{"headline": "...", "synthesis": "1-2 sentences", "url": "..."}}
  ],
  "challenging_take": "A counterintuitive observation connecting one of the papers to a broader trend. 2-3 sentences.",
  "actionable_move": "One specific thing the user can do TODAY based on the research, grounded in their current seeds.",
  "solution_design_seed": "3-5 bullet markdown sketch of how the most interesting paper could become a concrete tool or project.",
  "prompt": "A single sentence to open a chat discussion about today's research."
}}

Include all {len(paper_texts)} papers in the "papers" array. Synthesize each independently."""

    raw = _call_llm(user_prompt, system=system_prompt, max_tokens=2500,
                    model="qwen/qwen3-235b-a22b")

    # Parse JSON, strip fences if needed
    cleaned = _re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=_re.IGNORECASE)
    cleaned = _re.sub(r'\s*```$', '', cleaned.strip())
    try:
        data = json.loads(cleaned)
    except Exception:
        logger.error(f"[academic_digest] JSON parse failed, using fallback. Raw: {raw[:200]}")
        data = {}

    # Build standard briefing sections
    sections = []

    # Weather
    if weather and city:
        sections.append({
            "title": f"Weather — {city}",
            "icon": "cloud",
            "color": "text-blue-400",
            "content": weather,
        })

    # Academic spotlights — one section per paper
    papers = data.get("papers", [])
    if not papers and paper_texts:
        # fallback: create stubs from raw paper data
        papers = [{"title": p["title"], "content": p.get("snippet", ""), "url": p["url"]} for p in paper_texts]
    for i, paper in enumerate(papers):
        sections.append({
            "title": paper.get("title", f"Paper {i+1}"),
            "icon": "school",
            "color": "text-indigo-400",
            "content": paper.get("content", ""),
            "sources": [{"title": "arXiv", "url": paper.get("url", "")}] if paper.get("url") else [],
        })

    # Enterprise news
    news_items = data.get("news_items", [])
    if news_items:
        news_content = [f"{item.get('headline', '')}: {item.get('synthesis', '')}" for item in news_items]
        news_sources = [{"title": item.get("headline", "")[:40], "url": item.get("url", "")} for item in news_items if item.get("url")]
        sections.append({
            "title": "Enterprise AI News",
            "icon": "newspaper",
            "color": "text-blue-400",
            "content": news_content,
            "sources": news_sources,
        })

    # Challenging take
    if data.get("challenging_take"):
        sections.append({
            "title": "Challenging Take",
            "icon": "bolt",
            "color": "text-amber-400",
            "content": data["challenging_take"],
        })

    # Actionable move
    if data.get("actionable_move"):
        sections.append({
            "title": "One Actionable Move",
            "icon": "tips_and_updates",
            "color": "text-green-400",
            "content": data["actionable_move"],
        })

    # Solution design seed
    if data.get("solution_design_seed"):
        sections.append({
            "title": "Solution Design Seed",
            "icon": "architecture",
            "color": "text-purple-400",
            "content": data["solution_design_seed"],
        })

    # Auto-save papers as Garden seeds (best-effort, never blocks delivery)
    try:
        _save_papers_as_seeds(papers, user_id, db)
    except Exception as e:
        logger.warning(f"[academic_digest] Failed to save papers as seeds: {e}")

    return {
        "type": "academic_digest",
        "title": f"Research Digest — {today}",
        "subtitle": f"Grounded in your interests: {theme_str}",
        "sections": sections,
        "prompt": data.get("prompt", f"Let's discuss today's research on {theme_str}."),
        "_solution_design_seed": data.get("solution_design_seed", ""),
    }


def generate_solution_design(briefing: dict, user_id: str, db) -> Optional[str]:
    """
    Expand the solution_design_seed from an academic digest into a full
    markdown solution design document. Saves to /data/outputs/solution_designs/.
    Returns the file path, or None on failure.
    """
    import os, re as _re
    seed = briefing.get("_solution_design_seed") or briefing.get("solution_design_seed", "")
    if not seed:
        logger.warning("[solution_design] No seed found in briefing")
        return None

    themes = fetch_user_themes(user_id, db)
    garden_ctx = fetch_garden_context(user_id, themes, db)
    wiki_ctx = fetch_wiki_context(themes)

    garden_block = "\n".join(f"- [{s['title']}]: {s['snippet']}" for s in garden_ctx) or ""
    wiki_block = "\n".join(f"[{w['source']}]: {w['excerpt']}" for w in wiki_ctx) or ""

    system = (
        "You are a solution architect for a forward-deployed AI engineer. "
        "Produce a clean, actionable markdown solution design document. "
        "It should be concrete enough to be directly executed as a plan by Claude Code or Cursor."
    )
    prompt = f"""Expand this idea sketch into a full solution design document:

IDEA SKETCH:
{seed}

USER'S EXISTING KNOWLEDGE:
{wiki_block}

USER'S RECENT CONTEXT:
{garden_block}

Write a markdown document with these sections:
# [Project Name]
## Problem Statement
## Proposed Approach (from research)
## Connection to Existing Knowledge
## Implementation Sketch
### Phase 1 (MVP)
### Phase 2 (Enhancement)
## Key Technical Decisions
## Open Questions
## Success Criteria
"""

    md_content = _call_llm(prompt, system=system, max_tokens=2000, model="qwen/qwen3-235b-a22b")
    if not md_content:
        return None

    # Save to disk
    output_dir = "/data/outputs/solution_designs"
    os.makedirs(output_dir, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    # Derive slug from first heading or seed first line
    slug_src = (md_content.split("\n")[0].lstrip("# ") or seed.split("\n")[0])[:40]
    slug = _re.sub(r"[^a-z0-9]+", "-", slug_src.lower()).strip("-")
    filepath = os.path.join(output_dir, f"{date_str}-{slug}.md")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.info(f"[solution_design] Saved to {filepath}")
    return filepath


def run_agent_task(topic: str, user_id: str, db) -> Optional[str]:
    """
    Long-running agent: generates a strategy/implementation paper on a user-specified topic.
    Saves to /data/outputs/solution_designs/ and returns the markdown content.
    Called as a background task — delivers result via _sto<RESEND_API_KEY>().
    """
    import os, re as _re
    logger.info(f"[agent] Starting research paper for topic: {topic[:80]}")

    themes = fetch_user_themes(user_id, db)
    garden_ctx = fetch_garden_context(user_id, themes, db)
    wiki_ctx = fetch_wiki_context(themes)

    garden_block = "\n".join(f"- [{s['title']}]: {s['snippet']}" for s in garden_ctx) or "(none)"
    wiki_block = "\n".join(f"[{w['source']}]: {w['excerpt']}" for w in wiki_ctx) or "(none)"

    system = (
        "You are a senior solutions architect and strategy consultant. "
        "Produce a comprehensive, actionable markdown strategy and implementation paper. "
        "The document must be concrete enough to be executed directly by Claude Code, Cursor, or similar agentic coding tools. "
        "Use clear headings, numbered steps, and code snippets where relevant."
    )
    prompt = f"""Write a detailed strategy and implementation paper on the following topic:

TOPIC:
{topic}

USER'S EXISTING KNOWLEDGE BASE:
{wiki_block}

USER'S RECENT CONTEXT (from Garden):
{garden_block}

Produce a well-structured markdown document with these sections:
# [Title]
## Executive Summary (2-3 sentences)
## Problem & Opportunity
## Proposed Strategy
## Technical Architecture
## Implementation Plan
### Phase 1 — Foundation (MVP)
### Phase 2 — Expansion
### Phase 3 — Scale
## Key Technical Decisions & Trade-offs
## Integration with Existing Stack
## Risks & Mitigations
## Success Criteria & Metrics
## Next Immediate Steps (copy-paste ready for an agentic coding tool)
"""

    md_content = _call_llm(prompt, system=system, max_tokens=3000, model="qwen/qwen3-235b-a22b")
    if not md_content:
        logger.error(f"[agent] LLM returned no content for topic: {topic[:80]}")
        return None

    # Save to disk
    output_dir = "/data/outputs/solution_designs"
    os.makedirs(output_dir, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug_src = topic[:40]
    slug = _re.sub(r"[^a-z0-9]+", "-", slug_src.lower()).strip("-")
    filepath = os.path.join(output_dir, f"{date_str}-agent-{slug}.md")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.info(f"[agent] Research paper saved to {filepath}")

    # Save as a Garden seed so it's searchable and feeds future briefings
    try:
        import uuid as _uuid
        from app.models import Seed, User
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            seed = Seed(
                id=_uuid.uuid4(),
                tenant_id=user.tenant_id,
                user_id=user_id,
                title=topic[:200],
                content=md_content[:5000],
                created_by="agent_research",
                created_via="research_paper_agent",
                seed_metadata={
                    "tags": ["strategy-paper", "agent-output"],
                    "domain": "Research",
                    "energy": "HIGH",
                },
            )
            db.add(seed)
            db.commit()
            logger.info(f"[agent] Strategy paper saved as Garden seed for user {user_id}")
    except Exception as e:
        logger.warning(f"[agent] Failed to save paper as seed: {e}")

    return md_content
