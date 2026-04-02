"""
Multi-Layer Memory Architecture (MLMA) for Greenplot
Based on: arxiv.org/abs/2603.29194

Three memory layers:
  - Working Memory:  bounded window of recent dialogue tokens
  - Episodic Memory: recursive session summaries with decay
  - Semantic Memory: stable entity-event graphs

Adaptive retrieval gating + retention regularization.
"""

import json
import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict

# ── Data Structures ─────────────────────────────────────

@dataclass
class WorkingMemory:
    """Bounded window of recent dialogue."""
    messages: list[dict] = field(default_factory=list)  # [{role, content, timestamp}]
    max_tokens: int = 2000  # capacity bound C_w

    def add(self, role: str, content: str):
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        # Enforce bounded capacity (simple token approximation)
        total = sum(len(m["content"].split()) for m in self.messages)
        while total > self.max_tokens and len(self.messages) > 1:
            removed = self.messages.pop(0)
            total -= len(removed["content"].split())

    def as_context(self) -> str:
        if not self.messages:
            return ""
        lines = [f"[{m['role']}] {m['content']}" for m in self.messages[-10:]]
        return "\n".join(lines)

    def similarity(self, query: str) -> float:
        """Simple keyword overlap similarity."""
        if not self.messages:
            return 0.0
        q_words = set(query.lower().split())
        m_words = set(" ".join(m["content"] for m in self.messages).lower().split())
        if not q_words or not m_words:
            return 0.0
        return len(q_words & m_words) / len(q_words | m_words)


@dataclass
class EpisodicMemory:
    """Recursive session summaries with decay."""
    summaries: list[dict] = field(default_factory=list)  # [{summary, session_id, timestamp}]
    decay_alpha: float = 0.7  # retention decay
    max_entries: int = 50  # capacity bound C_e

    def consolidate(self, session_id: str, session_text: str) -> str:
        """Generate summary and blend with existing episodic memory."""
        # Extract key points from session
        sentences = [s.strip() for s in session_text.replace("\n", ". ").split(".") if len(s.strip()) > 20]
        summary_text = ". ".join(sentences[:5])  # top 5 sentences as summary

        entry = {
            "summary": summary_text,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "weight": 1.0,  # initial weight, decays over time
        }

        # Apply decay to existing entries
        for s in self.summaries:
            s["weight"] *= self.decay_alpha

        self.summaries.append(entry)

        # Enforce capacity
        if len(self.summaries) > self.max_entries:
            # Remove lowest-weight entries
            self.summaries.sort(key=lambda x: x["weight"], reverse=True)
            self.summaries = self.summaries[:self.max_entries]

        return summary_text

    def as_context(self) -> str:
        if not self.summaries:
            return ""
        # Sort by weight (most relevant first)
        sorted_s = sorted(self.summaries, key=lambda x: x["weight"], reverse=True)
        lines = [f"[Session {s['session_id'][:8]}] {s['summary']}" for s in sorted_s[:8]]
        return "\n".join(lines)

    def similarity(self, query: str) -> float:
        if not self.summaries:
            return 0.0
        q_words = set(query.lower().split())
        all_text = " ".join(s["summary"] for s in self.summaries)
        s_words = set(all_text.lower().split())
        if not q_words or not s_words:
            return 0.0
        return len(q_words & s_words) / len(q_words | s_words)


@dataclass
class SemanticEntity:
    """A stable entity-event node in semantic memory."""
    name: str
    entity_type: str  # person, concept, project, tool, event
    attributes: dict = field(default_factory=dict)
    relations: list[str] = field(default_factory=list)  # names of related entities
    created: str = ""
    last_seen: str = ""
    stability_score: float = 1.0  # higher = more stable/confirmed

    def __post_init__(self):
        if not self.created:
            self.created = datetime.now(timezone.utc).isoformat()
        self.last_seen = datetime.now(timezone.utc).isoformat()


@dataclass
class SemanticMemory:
    """Stable entity-event graph (long-term knowledge)."""
    entities: dict[str, SemanticEntity] = field(default_factory=dict)
    max_entities: int = 200  # capacity bound C_s

    def upsert(self, name: str, entity_type: str, attributes: dict = None, relations: list[str] = None):
        """Add or update entity with conflict resolution."""
        key = name.lower().strip()
        if key in self.entities:
            existing = self.entities[key]
            # Merge attributes (new wins on conflict)
            if attributes:
                existing.attributes.update(attributes)
            # Merge relations (union)
            if relations:
                existing.relations = list(set(existing.relations + relations))
            existing.last_seen = datetime.now(timezone.utc).isoformat()
            existing.stability_score = min(existing.stability_score + 0.1, 2.0)
        else:
            self.entities[key] = SemanticEntity(
                name=name,
                entity_type=entity_type,
                attributes=attributes or {},
                relations=relations or [],
            )

        # Enforce capacity — remove lowest stability
        if len(self.entities) > self.max_entities:
            sorted_e = sorted(self.entities.values(), key=lambda e: e.stability_score)
            for e in sorted_e[:len(self.entities) - self.max_entities]:
                del self.entities[e.name.lower().strip()]

    def extract_from_text(self, text: str, source: str = "chat"):
        """Extract entities from text using simple heuristics."""
        # Extract capitalized phrases as potential entities
        import re
        # Proper nouns / acronyms
        proper_nouns = re.findall(r'\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b', text)
        acronyms = re.findall(r'\b[A-Z]{2,}\b', text)
        # Known patterns
        concepts = re.findall(r'\b(agentic|RAG|vector|embedding|LLM|pipeline|agent|multi-agent|knowledge graph)\b', text, re.IGNORECASE)

        for name in set(proper_nouns + acronyms + [c for c in concepts]):
            if len(name) > 2 and name.lower() not in {"the", "this", "that", "what", "when", "where", "which", "how", "why"}:
                self.upsert(name, "concept", {"source": source})

    def as_context(self, max_entities: int = 10) -> str:
        if not self.entities:
            return ""
        # Sort by stability (most stable first)
        sorted_e = sorted(self.entities.values(), key=lambda e: e.stability_score, reverse=True)
        lines = []
        for e in sorted_e[:max_entities]:
            rels = f" (related: {', '.join(e.relations[:3])})" if e.relations else ""
            lines.append(f"- {e.name} [{e.entity_type}]{rels}")
        return "\n".join(lines)

    def similarity(self, query: str) -> float:
        if not self.entities:
            return 0.0
        q_words = set(query.lower().split())
        e_words = set()
        for e in self.entities.values():
            e_words.update(e.name.lower().split())
            e_words.update(str(e.attributes).lower().split())
        if not q_words or not e_words:
            return 0.0
        return len(q_words & e_words) / len(q_words | e_words)


# ── Multi-Layer Memory Manager ──────────────────────────

class MultiLayerMemory:
    """
    Core memory architecture with adaptive retrieval gating.

    Memory state: M_t = {M_t(w), M_t(e), M_t(s)}
    Retrieval: R_t = Σ γ_i * M_t(i)  where γ_i = softmax(β * sim(x_t, M_t(i)))
    """

    def __init__(
        self,
        user_id: str,
        storage_dir: str = "/tmp/mlma",
        beta: float = 2.0,         # retrieval sharpness temperature
        working_max_tokens: int = 2000,
        episodic_alpha: float = 0.7,
        episodic_max: int = 50,
        semantic_max: int = 200,
    ):
        self.user_id = user_id
        self.storage_dir = Path(storage_dir) / user_id
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.beta = beta
        self.working = WorkingMemory(max_tokens=working_max_tokens)
        self.episodic = EpisodicMemory(decay_alpha=episodic_alpha, max_entries=episodic_max)
        self.semantic = SemanticMemory(max_entities=semantic_max)

        # Load persisted state
        self._load()

    def _state_path(self) -> Path:
        return self.storage_dir / "memory_state.json"

    def _load(self):
        path = self._state_path()
        if path.exists():
            try:
                data = json.loads(path.read_text())
                if "working" in data:
                    self.working.messages = data["working"].get("messages", [])
                if "episodic" in data:
                    self.episodic.summaries = data["episodic"].get("summaries", [])
                if "semantic" in data:
                    for name, edata in data["semantic"].get("entities", {}).items():
                        self.semantic.entities[name] = SemanticEntity(**edata)
            except Exception:
                pass  # Start fresh on corruption

    def save(self):
        data = {
            "user_id": self.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "working": {"messages": self.working.messages[-20:]},  # cap persisted
            "episodic": {"summaries": self.episodic.summaries},
            "semantic": {"entities": {k: asdict(v) for k, v in self.semantic.entities.items()}},
        }
        self._state_path().write_text(json.dumps(data, indent=2))

    # ── Adaptive Retrieval Gating ───────────────────────

    def _compute_weights(self, query: str) -> dict[str, float]:
        """Compute adaptive layer weights: γ_i = softmax(β * sim(x_t, M_t(i)))"""
        sims = {
            "working": self.working.similarity(query),
            "episodic": self.episodic.similarity(query),
            "semantic": self.semantic.similarity(query),
        }

        # Softmax with temperature β
        exps = {k: math.exp(self.beta * v) for k, v in sims.items()}
        total = sum(exps.values())
        if total == 0:
            return {"working": 0.33, "episodic": 0.33, "semantic": 0.34}
        return {k: v / total for k, v in exps.items()}

    def retrieve(self, query: str, verbose: bool = False) -> str:
        """
        Adaptive layer-weighted retrieval.
        Returns fused memory context for the given query.
        """
        weights = self._compute_weights(query)

        if verbose:
            print(f"[MLMA] Layer weights: { {k: f'{v:.2%}' for k, v in weights.items()} }")

        # Build context from each layer
        contexts = {}
        if weights["working"] > 0.1:
            ctx = self.working.as_context()
            if ctx:
                contexts["working"] = ctx
        if weights["episodic"] > 0.1:
            ctx = self.episodic.as_context()
            if ctx:
                contexts["episodic"] = ctx
        if weights["semantic"] > 0.1:
            ctx = self.semantic.as_context()
            if ctx:
                contexts["semantic"] = ctx

        if not contexts:
            return ""

        # Build fused context
        parts = []
        if "working" in contexts:
            parts.append(f"**Recent Context** (weight: {weights['working']:.0%}):\n{contexts['working']}")
        if "episodic" in contexts:
            parts.append(f"**Past Sessions** (weight: {weights['episodic']:.0%}):\n{contexts['episodic']}")
        if "semantic" in contexts:
            parts.append(f"**Known Facts** (weight: {weights['semantic']:.0%}):\n{contexts['semantic']}")

        return "---\n🧠 **Your Memory**:\n" + "\n\n".join(parts) + "\n---"

    # ── Memory Updates ─────────────────────────────────

    def add_message(self, role: str, content: str):
        """Add message to working memory."""
        self.working.add(role, content)

    def consolidate_session(self, session_id: str, session_text: str):
        """
        Move working memory → episodic, extract entities → semantic.
        This is the 'memory consolidation' step from the paper.
        """
        # Episodic consolidation
        summary = self.episodic.consolidate(session_id, session_text)

        # Semantic extraction
        self.semantic.extract_from_text(session_text, source=f"session_{session_id[:8]}")
        self.semantic.extract_from_text(summary, source="episodic_summary")

        # Clear working memory after consolidation
        self.working.messages = []

        self.save()

    def get_retention_score(self) -> dict:
        """Compute retention metrics (for monitoring)."""
        return {
            "working_messages": len(self.working.messages),
            "episodic_summaries": len(self.episodic.summaries),
            "semantic_entities": len(self.semantic.entities),
            "top_entities": [
                {"name": e.name, "type": e.entity_type, "stability": e.stability_score}
                for e in sorted(self.semantic.entities.values(), key=lambda x: x.stability_score, reverse=True)[:5]
            ],
        }


# ── Convenience Functions ───────────────────────────────

def get_memory(user_id: str) -> MultiLayerMemory:
    """Get or create memory instance for a user."""
    return MultiLayerMemory(user_id=user_id)


def enrich_query_with_memory(user_id: str, query: str) -> str:
    """
    Enrich a user query with multi-layer memory context.
    Call this before sending to the LLM.
    """
    memory = get_memory(user_id)
    memory.add_message("user", query)
    memory.save()
    return memory.retrieve(query)


def consolidate_after_session(user_id: str, session_id: str, messages: list[dict]):
    """
    Consolidate a completed chat session into memory layers.
    Call this when a session ends or periodically.
    """
    memory = get_memory(user_id)
    session_text = "\n".join(f"{m['role']}: {m.get('content', '')}" for m in messages)
    memory.consolidate_session(session_id, session_text)


if __name__ == "__main__":
    # Quick test
    m = MultiLayerMemory(user_id="test_user")

    # Simulate messages
    m.add_message("user", "How does RAG work with vector databases?")
    m.add_message("assistant", "RAG combines retrieval with generation. You embed documents into vectors, store them in a vector DB like Weaviate, then retrieve relevant chunks at query time.")
    m.add_message("user", "What about multi-agent coordination?")
    m.add_message("assistant", "Multi-agent systems use orchestrators to delegate tasks. Common patterns include supervisor, hierarchical, and peer-to-peer.")

    # Test retrieval
    print("=== Retrieval: 'Tell me about agents' ===")
    result = m.retrieve("Tell me about agents", verbose=True)
    print(result)

    # Consolidate
    m.consolidate_session("session_123", "User asked about RAG and multi-agent systems. Discussed vector DBs, embeddings, and agent coordination patterns.")

    print("\n=== After consolidation ===")
    print(m.retrieve("What do I know about agents?", verbose=True))

    print("\n=== Retention score ===")
    print(json.dumps(m.get_retention_score(), indent=2))
