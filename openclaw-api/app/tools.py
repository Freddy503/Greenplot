"""
Tool definitions for the chat endpoint.
OpenAI/OpenRouter function-calling format.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_seeds",
            "description": "Search the user's Second Brain for relevant seeds (ideas, notes, insights) using semantic similarity.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query to find relevant seeds."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 5).",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_seed",
            "description": "Create a new seed (idea/note) in the user's Second Brain. Use when the user wants to capture or save an idea.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Concise title for the seed."
                    },
                    "content": {
                        "type": "string",
                        "description": "Rich elaboration of the idea (1-3 paragraphs)."
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional tags for categorization."
                    }
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_briefing",
            "description": "Get the user's daily briefing: weather, calendar highlights, recent seeds, and a creative prompt.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_recent_seeds",
            "description": "List the most recent seeds in the user's Second Brain. Use when asked to show what's there or review recent ideas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of recent seeds to return (default 5).",
                        "default": 5
                    }
                },
                "required": []
            }
        }
    },
]

# Add web_search after the existing TOOLS list
TOOLS.append({
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for current information. Use when the user asks about recent events, news, or topics outside the knowledge base.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant web results."
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (default 3).",
                    "default": 3
                }
            },
            "required": ["query"]
        }
    }
})
