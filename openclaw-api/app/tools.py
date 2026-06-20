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
    {
        "type": "function",
        "function": {
            "name": "get_calendar_events",
            "description": "Fetch upcoming Google Calendar events. Use when the user asks what's on their calendar, schedule, or meetings.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "integer",
                        "description": "How many hours ahead to look (default 24).",
                        "default": 24
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Max events to return (default 10).",
                        "default": 10
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Create a new event in the user's Google Calendar. Use when the user asks to schedule something, block time, or add a meeting.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Event title / name."
                    },
                    "start_time": {
                        "type": "string",
                        "description": "Start datetime in ISO 8601 format, e.g. '2025-06-10T14:00:00'. Use the user's local timezone."
                    },
                    "end_time": {
                        "type": "string",
                        "description": "End datetime in ISO 8601 format. If not specified, default to 1 hour after start."
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional event notes or agenda."
                    },
                    "location": {
                        "type": "string",
                        "description": "Optional location or meeting link."
                    }
                },
                "required": ["summary", "start_time", "end_time"]
            }
        }
    },
]

# Add web_search after the existing TOOLS list
TOOLS.append({
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for current information. Use when the user asks about recent events, news, or topics outside the knowledge base. Results are automatically saved to their Sources library.",
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
                    "description": "Filter by domain (e.g. agentic-ai, career, medicine, legal, finance — any subject)."
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

# ── Cohesion Tools: Bridge Chat ↔ Garden ↔ Sources ──

# Search Sources (Links)
TOOLS.append({
    "type": "function",
    "function": {
        "name": "search_sources",
        "description": "Search the user's Sources library (saved links, references, articles). Use when discussing a topic and want to reference what the user has already saved. Results include titles, summaries, and domains.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant sources by title, domain, or tags."
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 5).",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    }
})

# Create Seed from Source
TOOLS.append({
    "type": "function",
    "function": {
        "name": "create_seed_from_source",
        "description": "Create a new seed (idea) from an existing source link. Use when the user wants to develop an idea based on something they've saved. This bridges the Sources to Garden flow.",
        "parameters": {
            "type": "object",
            "properties": {
                "link_id": {
                    "type": "string",
                    "description": "The ID of the source link to create the seed from."
                },
                "title": {
                    "type": "string",
                    "description": "Title for the new seed."
                },
                "elaboration": {
                    "type": "string",
                    "description": "Your elaboration or synthesis of the source content as it relates to the user's interests."
                }
            },
            "required": ["link_id", "title"]
        }
    }
})

# Get Knowledge Digest
TOOLS.append({
    "type": "function",
    "function": {
        "name": "get_knowledge_digest",
        "description": "Get a digest of the user's knowledge base: recent seeds, new sources, connections made, and items needing attention. Use for daily briefings or when asked what's new.",
        "parameters": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "How many days back to look (default 7).",
                    "default": 7
                }
            },
            "required": []
        }
    }
})

# Garden Intelligence
TOOLS.append({
    "type": "function",
    "function": {
        "name": "get_garden_intelligence",
        "description": "Get garden intelligence: trending seeds, stale seeds needing attention, top rated, health score. Use when asked about garden health, what to review, or knowledge base status.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
})

# Activity Feed
TOOLS.append({
    "type": "function",
    "function": {
        "name": "get_activity_feed",
        "description": "Get recent system activity: what seeds were created, sources found, enrichments completed. Use when asked what happened recently or what the system has been doing.",
        "parameters": {
            "type": "object",
            "properties": {
                "hours": {
                    "type": "integer",
                    "description": "How many hours back to look (default 48).",
                    "default": 48
                },
                "limit": {
                    "type": "integer",
                    "description": "Max events to return (default 10).",
                    "default": 10
                }
            },
            "required": []
        }
    }
})

# Read Source Content
TOOLS.append({
    "type": "function",
    "function": {
        "name": "read_source",
        "description": "Fetch and read the full content of a saved source link. Use when you need to reference specific details from a source to answer a complex question. Returns the page text content.",
        "parameters": {
            "type": "object",
            "properties": {
                "link_id": {
                    "type": "string",
                    "description": "The ID of the source link to read."
                }
            },
            "required": ["link_id"]
        }
    }
})

# Garden Skimmer / Sub-Agent Analysis
TOOLS.append({
    "type": "function",
    "function": {
        "name": "garden_skimmer",
        "description": "Run an autonomous sub-agent analysis of the user's garden. Discovers hidden patterns across domains, identifies knowledge gaps (seeds without wiki coverage), analyzes trends, and audits seed quality. Saves findings as insight seeds. Use when the user asks to analyze, run insights, or discover patterns in the garden.",
        "parameters": {
            "type": "object",
            "properties": {
                "agent_type": {
                    "type": "string",
                    "description": "Which analysis to run: 'all' for full analysis, 'pattern' for cross-domain patterns, 'gap' for knowledge gaps, 'trend' for distribution analysis, 'quality' for seed health audit.",
                    "default": "all",
                    "enum": ["all", "pattern", "gap", "trend", "quality"]
                }
            },
            "required": []
        }
    }
})

# Search Wiki Articles
TOOLS.append({
    "type": "function",
    "function": {
        "name": "search_wiki",
        "description": "Search the user's wiki knowledge base (synthesized articles from seeds and sources). Use when answering complex or conceptual questions that benefit from the user's own documented knowledge. This is the highest-quality context layer. ALWAYS call search_wiki alongside search_seeds and web_search for topic questions.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant wiki articles by title, content, or summary."
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 3).",
                    "default": 3
                }
            },
            "required": ["query"]
        }
    }
})

# Save a URL to Sources library
TOOLS.append({
    "type": "function",
    "function": {
        "name": "save_link",
        "description": "Save a URL to the user's Sources library. Use when the user shares a link or asks to save a URL as a source. Automatically fetches page title and summary.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to save."
                },
                "title": {
                    "type": "string",
                    "description": "Optional title override (auto-fetched from page if omitted)."
                },
                "tags": {
                    "type": "string",
                    "description": "Optional comma-separated tags."
                }
            },
            "required": ["url"]
        }
    }
})


# Create a wiki article from chat
TOOLS.append({
    "type": "function",
    "function": {
        "name": "create_wiki_article",
        "description": "Create a structured wiki article and save it to the user's knowledge base. Use when the user asks to create a wiki article, document a topic, or compile knowledge into an article. The AI will synthesize the content into Wikipedia-style format.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the wiki article."
                },
                "content": {
                    "type": "string",
                    "description": "Raw content to structure into the article (can be notes, bullet points, or prose)."
                },
                "topic": {
                    "type": "string",
                    "description": "Topic or subject area if title not specified."
                }
            },
            "required": ["title", "content"]
        }
    }
})

# ── Thinking Partner Tools ────────────────────────────────────────────────────

TOOLS.append({
    "type": "function",
    "function": {
        "name": "develop_idea",
        "description": (
            "Transform a raw idea into a structured spec using forcing questions. "
            "Call with phase='interrogate' to start the questioning process, then "
            "phase='finalize' after the user has answered to produce a Spec seed with "
            "YAML frontmatter (WHO, CURRENT, DESIRED, SUCCESS CRITERIA, MVP, FAILURE MODES) "
            "plus a dual-voice CEO + Engineering review."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "idea": {
                    "type": "string",
                    "description": "Raw idea text to develop into a spec."
                },
                "seed_id": {
                    "type": "string",
                    "description": "ID of an existing seed to use as the starting idea."
                },
                "phase": {
                    "type": "string",
                    "enum": ["interrogate", "finalize"],
                    "description": "interrogate: ask forcing questions. finalize: produce the spec."
                }
            },
            "required": ["phase"]
        }
    }
})

TOOLS.append({
    "type": "function",
    "function": {
        "name": "capture_learnings",
        "description": (
            "Save a learning, decision, or insight from this conversation as a learning-type seed. "
            "Use after a key decision is made or a pattern is discovered. "
            "Future sessions will be primed with high-confidence learnings."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "learning": {
                    "type": "string",
                    "description": "The learning or decision to capture (1-3 sentences)."
                },
                "confidence": {
                    "type": "integer",
                    "description": "Confidence level 1-10 (10 = highly certain).",
                    "default": 7
                }
            },
            "required": ["learning"]
        }
    }
})

TOOLS.append({
    "type": "function",
    "function": {
        "name": "create_github_issue",
        "description": (
            "File a GitHub issue from a spec seed. Use after develop_idea has produced a spec "
            "to create a trackable issue ready for Claude Code or Codex to implement."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Issue title."
                },
                "body": {
                    "type": "string",
                    "description": "Issue body (markdown). If omitted, uses the spec seed content."
                },
                "seed_id": {
                    "type": "string",
                    "description": "ID of the Spec seed to file as an issue."
                },
                "repo": {
                    "type": "string",
                    "description": "GitHub repo in owner/name format, e.g. 'Freddy503/Seedify'."
                }
            },
            "required": ["repo"]
        }
    }
})
