# Wiki Article Structure Spec (Wikipedia/GrokPedia-Inspired)

## Standard Article Template

```markdown
# {Title}

> **{One-line summary/definition}**

{Lead paragraph: 2-4 sentences providing a comprehensive overview. Bold the subject on first mention. Should stand alone as a complete summary.}

---

## Contents
- [Background](#background)
- [Key Concepts](#key-concepts)
- [Applications](#applications)
- [Connections](#connections)
- [See Also](#see-also)
- [References](#references)

---

<!-- Infobox: key facts at a glance -->
:::infobox
| Field | Value |
|-------|-------|
| Category | {category} |
| Created | {date} |
| Sources | {n} links |
| Connections | {n} related |
| Status | {active/draft/archived} |
:::

## Background

{Context and motivation. Why does this topic matter? What problem does it solve?}

## Key Concepts

### {Sub-concept 1}
{Explanation with examples}

### {Sub-concept 2}
{Explanation with examples}

## Applications

{Real-world uses, implementations, case studies}

## Connections

{How this relates to other wiki articles, seeds, and sources}

---

![Concept Visualization](/api/v1/wiki/{id}/image)

---

## See Also
- [[Related Article 1]]
- [[Related Article 2]]

## References
1. [{Source title}]({url}) — {domain}
2. [{Source title}]({url}) — {domain}

---

*Last updated: {date} • Sources: {n} • Category: {category}*
```

## Infobox Data Structure

```json
{
  "title": "Article Title",
  "summary": "One-line definition",
  "category": "Concept|Project|Research|Design|Tech|Product",
  "created_at": "2026-04-04",
  "updated_at": "2026-04-04",
  "source_count": 5,
  "connection_count": 3,
  "status": "active",
  "image_url": "/api/v1/wiki/{id}/image",
  "tags": ["ai", "rag", "architecture"],
  "key_facts": [
    {"label": "Type", "value": "Architecture Pattern"},
    {"label": "Related", "value": "RAG, Embeddings"},
    {"label": "Status", "value": "Production"}
  ]
}
```

## Visualization Requirements

1. **Hero Image**: BFL FLUX-generated concept art (16:9 aspect ratio)
2. **Concept Map**: D3.js force-directed graph showing connections
3. **Timeline**: If article has historical context
4. **Infobox**: Structured metadata sidebar (Wikipedia-style)

## Category Taxonomy

| Category | Icon | Description |
|----------|------|-------------|
| Concept | 💡 | Abstract ideas, theories, patterns |
| Project | 🚀 | Active projects, initiatives |
| Research | 🔬 | Studies, papers, findings |
| Design | 🎨 | Design systems, UX, creative |
| Tech | 💻 | Technical implementations, code |
| Product | 🧩 | Features, product decisions |
| Strategy | 📊 | Business strategy, planning |
| People | 👤 | Profiles, roles, teams |
