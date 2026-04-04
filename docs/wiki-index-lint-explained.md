# Wiki Index & Wiki Lint — Quick Explanation

## Wiki Index
Currently your wiki page shows 9 article cards in a flat grid. A Wiki Index would be a **full directory** of all knowledge — like Wikipedia's "List of all articles" but interactive:

| Feature | What it does |
|---|---|
| **Search** | Find any wiki article by keyword (across titles, content, tags) |
| **Filters** | Show only "Agentic AI" category, or articles updated in the last month |
| **Sort** | By date, title, or relevance |
| **Categories** | Group articles by domain/subject |
| **Stats** | Show article count per category |

This makes the wiki browsable and discoverable instead of just showing the 9 most recent cards.

## Wiki Lint
A weekly **health check** that scans your wiki for problems and reports them:

| Check | What it finds | Example |
|---|---|---|
| **Orphans** | Articles with 0 backlinks (floating in space) | A wiki page about "enterprise software Integration" that no other article mentions |
| **Stale claims** | Articles not updated in 30+ days | "AI agents are theoretical" — but now they're deployed |
| **Missing cross-refs** | Topics mentioned in multiple articles but no wiki link between them | Agentic AI and MCP Protocol both share "architecture" but no link |
| **Contradictions** | Articles stating opposite things | Article A says "Agents need human oversight", Article B says "Full autonomy works" |
| **Empty categories** | Domains with 0 articles | You have tags for "Enterprise" but no Enterprise articles |

**Report format:** WikiLints are saved as wiki articles themselves (status: "lint-report") so you can browse past health checks.

Both are low-effort, high-value additions. Index = navigation, Lint = quality control.
