"""
Briefing generation module for personalized notifications.

Generates rich, multi-section briefings for:
- Morning Idea Spark (Weather + Deep Pattern)
- Daily Briefing (News + Academic)
- Evening Reflection (Contrarian + Actionable)
- Weekly Content Eval (What Stuck + Constraints)
- Biweekly Challenge (Cross-domain synthesis)
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import json
import httpx
import os

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

logger = logging.getLogger(__name__)

# Try to use the configured LLM client (Nemotron/Qwen), fall back to Anthropic
_client = None

def get_llm_client():
    """Get or initialize the LLM client."""
    global _client
    if _client is None:
        try:
            # Try to import the configured LLM client from settings
            from app.config import settings
            if hasattr(settings, 'llm_client') and settings.llm_client:
                _client = settings.llm_client
                logger.info("✓ Using configured LLM client")
            elif Anthropic:
                api_key = os.environ.get('ANTHROPIC_API_KEY', '')
                _client = Anthropic(api_key=api_key)
                logger.info("✓ Using Anthropic client")
            else:
                logger.warning("⚠️ No LLM client configured; briefings will be basic")
                _client = None
        except Exception as e:
            logger.error(f"Failed to initialize LLM client: {e}")
            _client = None
    return _client


def _call_llm(prompt: str, system: str = "", max_tokens: int = 1500) -> str:
    """Call the LLM with a prompt. Returns empty string on failure."""
    try:
        client = get_llm_client()
        if not client:
            return ""

        # Try Anthropic API first
        if hasattr(client, 'messages'):
            response = client.messages.create(
                model="claude-opus-4-6",  # Or from config
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text if response.content else ""

        # Fallback for other clients
        return ""
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return ""


async def fetch_web_search(query: str, limit: int = 5) -> List[Dict[str, str]]:
    """
    Fetch recent web search results.
    Returns: [{"title": "...", "url": "...", "snippet": "..."}, ...]
    """
    try:
        # Use SerpAPI, Tavily, or similar
        api_key = os.environ.get("SERPAPI_API_KEY") or os.environ.get("TAVILY_API_KEY")
        if not api_key:
            logger.warning("No web search API key configured")
            return []

        # Example using Tavily (free tier available)
        if "TAVILY" in os.environ:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.tavily.com/search",
                    params={"api_key": api_key, "query": query, "max_results": limit}
                )
                data = response.json()
                return [
                    {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
                    for r in data.get("results", [])
                ]
        else:
            # SerpAPI
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://serpapi.com/search",
                    params={"api_key": api_key, "q": query, "num": limit}
                )
                data = response.json()
                return [
                    {"title": r.get("title", ""), "url": r.get("link", ""), "snippet": r.get("snippet", "")}
                    for r in data.get("organic_results", [])
                ]
    except Exception as e:
        logger.error(f"Web search failed: {e}")
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
            Seed.created_at >= thirty_days_ago
        ).order_by(Seed.created_at.desc()).limit(20).all()

        if not recent_seeds:
            return ["learning", "research"]

        # Combine seed content
        text = " ".join([s.content for s in recent_seeds if s.content])

        # Simple keyword extraction
        keywords = {}
        for word in text.lower().split():
            if len(word) > 4 and word not in ['about', 'which', 'their', 'where', 'these']:
                keywords[word] = keywords.get(word, 0) + 1

        # Top 3 most frequent meaningful words
        top_words = sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:3]
        return [w[0] for w in top_words] if top_words else ["learning"]
    except Exception as e:
        logger.error(f"Failed to extract themes: {e}")
        return ["learning", "research"]


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

    deep_pattern = _call_llm(llm_prompt, max_tokens=500)
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

    news_synthesis = _call_llm(news_prompt, max_tokens=600)
    if not news_synthesis:
        news_synthesis = "• Check recent news on " + theme_str + " for latest enterprise AI developments."

    academic_prompt = f"""
From this research paper:
{json.dumps(academic_results[0] if academic_results else {"title": "Emerging research"}, indent=2)}

Summarize in 2-3 sentences: What's the contribution? Why should {theme_str} practitioners care?
"""

    academic_synthesis = _call_llm(academic_prompt, max_tokens=300)
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

    contrarian = _call_llm(contrarian_prompt, max_tokens=300)
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

    evaluation = _call_llm(eval_prompt, max_tokens=400)
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

    challenge = _call_llm(challenge_prompt, max_tokens=500)
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
                "content": f"Apply [{themes[0]}] to solve [{themes[1]} bottleneck]"
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
