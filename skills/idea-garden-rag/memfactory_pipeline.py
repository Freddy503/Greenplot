"""
MemFactory-Inspired Memory Pipeline for Greenplot
Adapted from: github.com/Valsure/MemFactory

Three-stage pipeline:
  1. Extractor — LLM extracts structured memory items from conversation
  2. Updater — LLM decides ADD/UPDATE/DEL/NONE operations
  3. Retriever — Adaptive layer-weighted retrieval (from MLMA paper)

No GPU needed — uses backend LLM API for extraction/updates.
"""

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


# ── Memory Item (from MemFactory's MemoryItem) ─────────

@dataclass
class MemoryItem:
    """Structured memory unit — the atomic element of all memory layers."""
    id: str = ""
    key: str = ""                    # unique concise title
    value: str = ""                  # detailed memory statement
    memory_type: str = "UserMemory"  # LongTermMemory | UserMemory | Episodic | Semantic
    tags: list[str] = field(default_factory=list)
    source: str = ""                 # session_id or origin
    created: str = ""
    last_accessed: str = ""
    access_count: int = 0
    stability_score: float = 1.0     # higher = more confirmed/reinforced

    def __post_init__(self):
        if not self.id:
            self.id = hashlib.md5(f"{self.key}:{self.value[:100]}".encode()).hexdigest()[:12]
        if not self.created:
            self.created = datetime.now(timezone.utc).isoformat()
        self.last_accessed = datetime.now(timezone.utc).isoformat()

    def touch(self):
        """Mark as accessed — increases stability."""
        self.access_count += 1
        self.last_accessed = datetime.now(timezone.utc).isoformat()
        self.stability_score = min(self.stability_score + 0.05, 3.0)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "MemoryItem":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── Update Operation (from MemFactory's Updater) ────────

@dataclass
class UpdateOp:
    """A single memory update operation."""
    op: str           # NONE | ADD | DEL | UPDATE
    id: str = ""      # target memory item ID
    key: str = ""     # for ADD/UPDATE
    value: str = ""   # for ADD/UPDATE
    tags: list[str] = field(default_factory=list)


# ── Prompts (adapted from MemFactory) ───────────────────

EXTRACTION_PROMPT = """You are a memory extraction expert.
Extract memories from the user's perspective based on this conversation.

Rules:
1. Identify the user's experiences, thoughts, decisions, plans, beliefs, emotional reactions
2. Include assistant statements that the user acknowledges or responds to
3. Resolve all pronouns and references to full names
4. Always write from third-person perspective using "User"

Return JSON:
{{
  "memory_list": [
    {{
      "key": "<concise unique title>",
      "memory_type": "LongTermMemory or UserMemory",
      "value": "<detailed independent statement>",
      "tags": ["<topic keywords>"]
    }}
  ],
  "summary": "<120-200 word paragraph summarizing from user's perspective>"
}}

Conversation:
{conversation}

Output:"""

UPDATE_PROMPT = """You are a smart memory manager.
Decide how to update the memory database.

Existing Memories:
{existing_memories}

New Extracted Memories:
{new_memories}

Operations:
- NONE: Keep existing as-is / Ignore new candidate
- ADD: Add new memory to database
- DEL: Delete existing memory (contradicted or merged)
- UPDATE: Modify existing memory (provide merged content)

If a new memory updates an existing one: DEL old + UPDATE new with merged content.

Return JSON:
{{
  "operations": [
    {{"id": "<id>", "op": "NONE|ADD|DEL|UPDATE", "key": "...", "value": "...", "tags": [...]}}
  ]
}}

Output:"""


# ── Memory Store ────────────────────────────────────────

class MemoryStore:
    """
    Persistent memory store with structured items.
    Supports all three layers via memory_type field.
    """

    def __init__(self, user_id: str, storage_dir: str = "/tmp/mlma"):
        self.user_id = user_id
        self.storage_dir = Path(storage_dir) / user_id
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.items: dict[str, MemoryItem] = {}
        self.session_summaries: list[dict] = []
        self._load()

    def _path(self) -> Path:
        return self.storage_dir / "memory_store.json"

    def _load(self):
        path = self._path()
        if path.exists():
            try:
                data = json.loads(path.read_text())
                for item_data in data.get("items", []):
                    item = MemoryItem.from_dict(item_data)
                    self.items[item.id] = item
                self.session_summaries = data.get("summaries", [])
            except Exception:
                pass

    def save(self):
        data = {
            "user_id": self.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "items": [item.to_dict() for item in self.items.values()],
            "summaries": self.session_summaries,
        }
        self._path().write_text(json.dumps(data, indent=2, default=str))

    # ── CRUD ────────────────────────────────────────────

    def add(self, item: MemoryItem) -> str:
        self.items[item.id] = item
        self.save()
        return item.id

    def get(self, item_id: str) -> Optional[MemoryItem]:
        item = self.items.get(item_id)
        if item:
            item.touch()
        return item

    def delete(self, item_id: str):
        self.items.pop(item_id, None)
        self.save()

    def update(self, item_id: str, key: str = None, value: str = None, tags: list[str] = None):
        item = self.items.get(item_id)
        if not item:
            return
        if key:
            item.key = key
        if value:
            item.value = value
        if tags:
            item.tags = tags
        item.stability_score = min(item.stability_score + 0.1, 3.0)
        self.save()

    def search(self, query: str, memory_type: str = None, limit: int = 5) -> list[MemoryItem]:
        """Simple keyword search over memory items."""
        q_words = set(query.lower().split())
        scored = []

        for item in self.items.values():
            if memory_type and item.memory_type != memory_type:
                continue

            # Keyword overlap score
            item_text = f"{item.key} {item.value} {' '.join(item.tags)}".lower()
            i_words = set(item_text.split())
            overlap = len(q_words & i_words)
            if overlap > 0:
                # Combine keyword match with stability
                score = overlap * item.stability_score
                scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [item for _, item in scored[:limit]]

        # Touch accessed items
        for item in results:
            item.touch()

        return results

    # ── Layer Accessors ─────────────────────────────────

    def working_items(self) -> list[MemoryItem]:
        return [i for i in self.items.values() if i.memory_type == "UserMemory"]

    def episodic_items(self) -> list[MemoryItem]:
        return [i for i in self.items.values() if i.memory_type == "Episodic"]

    def semantic_items(self) -> list[MemoryItem]:
        return [i for i in self.items.values() if i.memory_type in ("LongTermMemory", "Semantic")]

    def as_context(self, query: str = "", max_items: int = 8) -> str:
        """Build memory context for LLM injection."""
        if query:
            items = self.search(query, limit=max_items)
        else:
            items = sorted(self.items.values(), key=lambda i: i.stability_score, reverse=True)[:max_items]

        if not items:
            return ""

        lines = []
        for item in items:
            tags = f" [{', '.join(item.tags[:3])}]" if item.tags else ""
            lines.append(f"- **{item.key}**: {item.value[:150]}{tags}")

        return "---\n🧠 **Your Memories**:\n" + "\n".join(lines) + "\n---"

    # ── Apply Update Operations ─────────────────────────

    def apply_operations(self, operations: list[dict]):
        """Apply the operations from the Updater."""
        for op_data in operations:
            op = op_data.get("op", "NONE")
            item_id = op_data.get("id", "")

            if op == "ADD":
                item = MemoryItem(
                    key=op_data.get("key", ""),
                    value=op_data.get("value", ""),
                    tags=op_data.get("tags", []),
                    memory_type=op_data.get("memory_type", "UserMemory"),
                    source="extractor",
                )
                self.add(item)

            elif op == "DEL":
                self.delete(item_id)

            elif op == "UPDATE":
                self.update(
                    item_id,
                    key=op_data.get("key"),
                    value=op_data.get("value"),
                    tags=op_data.get("tags"),
                )

            # NONE = do nothing

        self.save()

    # ── Stats ───────────────────────────────────────────

    def stats(self) -> dict:
        return {
            "total_items": len(self.items),
            "working": len(self.working_items()),
            "episodic": len(self.episodic_items()),
            "semantic": len(self.semantic_items()),
            "session_summaries": len(self.session_summaries),
            "top_items": [
                {"key": i.key, "type": i.memory_type, "stability": i.stability_score, "accesses": i.access_count}
                for i in sorted(self.items.values(), key=lambda x: x.stability_score, reverse=True)[:5]
            ],
        }


# ── Pipeline Interface ─────────────────────────────────

def extract_memories(conversation_text: str, llm_call=None) -> dict:
    """
    Stage 1: Extract structured memories from conversation.
    If llm_call is provided, uses LLM. Otherwise uses heuristic extraction.
    """
    if llm_call:
        prompt = EXTRACTION_PROMPT.format(conversation=conversation_text)
        try:
            response = llm_call(prompt)
            # Parse JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group())
        except Exception:
            pass

    # Fallback: heuristic extraction
    sentences = [s.strip() for s in conversation_text.replace("\n", ". ").split(".") if len(s.strip()) > 20]
    return {
        "memory_list": [
            {
                "key": s[:60],
                "memory_type": "UserMemory",
                "value": s,
                "tags": [w.lower() for w in s.split() if w[0].isupper() and len(w) > 2][:5],
            }
            for s in sentences[:5]
        ],
        "summary": ". ".join(sentences[:3]),
    }


def decide_updates(existing_items: list[MemoryItem], new_candidates: list[dict], llm_call=None) -> list[dict]:
    """
    Stage 2: Decide update operations for new vs existing memories.
    If llm_call is provided, uses LLM. Otherwise uses heuristic merge.
    """
    if llm_call and existing_items:
        existing_fmt = json.dumps([
            {"id": i.id, "key": i.key, "value": i.value[:100]}
            for i in existing_items[:10]
        ], indent=2)
        new_fmt = json.dumps([
            {"id": f"new_{j}", "key": c.get("key", ""), "value": c.get("value", "")[:100]}
            for j, c in enumerate(new_candidates)
        ], indent=2)

        prompt = UPDATE_PROMPT.format(existing_memories=existing_fmt, new_memories=new_fmt)
        try:
            response = llm_call(prompt)
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                result = json.loads(json_match.group())
                return result.get("operations", [])
        except Exception:
            pass

    # Fallback: add all new, skip dedup check
    operations = []
    existing_keys = {i.key.lower() for i in existing_items}

    for j, candidate in enumerate(new_candidates):
        if candidate.get("key", "").lower() not in existing_keys:
            operations.append({
                "op": "ADD",
                "key": candidate.get("key", ""),
                "value": candidate.get("value", ""),
                "tags": candidate.get("tags", []),
                "memory_type": candidate.get("memory_type", "UserMemory"),
            })

    return operations


def run_pipeline(user_id: str, session_id: str, messages: list[dict], llm_call=None) -> dict:
    """
    Full MemFactory-inspired pipeline:
    Conversation → Extract → Decide Updates → Store → Retrieve
    """
    store = MemoryStore(user_id=user_id)

    # Stage 1: Extract
    conversation_text = "\n".join(f"{m.get('role','user')}: {m.get('content','')}" for m in messages)
    extraction = extract_memories(conversation_text, llm_call=llm_call)
    new_candidates = extraction.get("memory_list", [])

    # Stage 2: Decide updates
    existing = list(store.items.values())
    operations = decide_updates(existing, new_candidates, llm_call=llm_call)

    # Stage 3: Apply
    store.apply_operations(operations)

    # Add session summary
    summary = extraction.get("summary", "")
    if summary:
        store.session_summaries.append({
            "session_id": session_id,
            "summary": summary,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "items_extracted": len(new_candidates),
            "operations_applied": len(operations),
        })

    store.save()

    return {
        "extracted": len(new_candidates),
        "operations": len(operations),
        "summary": summary,
        "stats": store.stats(),
    }


if __name__ == "__main__":
    # Quick test
    messages = [
        {"role": "user", "content": "I've been thinking about building a second brain using RAG. My project is called Greenplot."},
        {"role": "assistant", "content": "RAG is great for knowledge management. You could use Weaviate for vector storage."},
        {"role": "user", "content": "I also want to integrate multi-agent systems for automated enrichment."},
    ]

    result = run_pipeline("test_user", "session_abc", messages)
    print(json.dumps(result, indent=2))

    store = MemoryStore("test_user")
    print("\n=== Memory Context ===")
    print(store.as_context("RAG agents"))
    print("\n=== Stats ===")
    print(json.dumps(store.stats(), indent=2))
