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

# Rate a seed (1-5 stars)
TOOLS.append({
    "type": "function",
    "function": {
        "name": "rate_seed",
        "description": "Rate a seed from 1-5 stars. Use when the user wants to rate or give feedback on an idea.",
        "parameters": {
            "type": "object",
            "properties": {
                "seed_id": {
                    "type": "string",
                    "description": "The ID of the seed to rate."
                },
                "score": {
                    "type": "integer",
                    "description": "Rating from 1-5 stars.",
                    "minimum": 1,
                    "maximum": 5
                },
                "feedback": {
                    "type": "string",
                    "description": "Optional feedback text explaining the rating."
                }
            },
            "required": ["seed_id", "score"]
        }
    }
})

# Get seed detail with enrichment
TOOLS.append({
    "type": "function",
    "function": {
        "name": "get_seed_detail",
        "description": "Get full details of a seed including enrichment data (tags, entities, backlinks, domain). Use when the user asks about a specific seed.",
        "parameters": {
            "type": "object",
            "properties": {
                "seed_id": {
                    "type": "string",
                    "description": "The seed ID or notion_id to look up."
                }
            },
            "required": ["seed_id"]
        }
    }
})

# Search seeds with filters
TOOLS.append({
    "type": "function",
    "function": {
        "name": "search_seeds_filtered",
        "description": "Search seeds with specific filters: domain, tags, energy level. Use when user asks 'show me all enterprise seeds' or similar.",
        "parameters": {
            "type": "object",
            "properties": {
                "domain": {
                    "type": "string",
                    "description": "Filter by domain: agentic-ai, career, enterprise, systems, learning, creativity.",
                    "enum": ["agentic-ai", "career", "enterprise", "systems", "learning", "creativity"]
                },
                "tags": {
                    "type": "string",
                    "description": "Filter by tags (comma-separated, matches any)."
                },
                "energy": {
                    "type": "string",
                    "description": "Filter by energy level.",
                    "enum": ["Spark", "Hot", "Flow", "Cool"]
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 5).",
                    "default": 5
                }
            },
            "required": []
        }
    }
})
