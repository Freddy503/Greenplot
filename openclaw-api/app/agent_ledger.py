"""
Knowledge Ledger — the engine behind adaptive Studio agents.

Spec: docs/specs/adaptive-agents.md

Before an agent asks anything, build_ledger sweeps what the system already
knows (related seeds, the source paper's doc tree, the MAIN product, the repo
map, prior session state) and grades every question-slot: known (confirm it),
weak (one drill-down), unknown (earned a question). Users never repeat
themselves to their own knowledge system.
"""

import json
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, Seed
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

RESUME_WINDOW_DAYS = 7

LEDGER_SLOTS: dict[str, list[str]] = {
    "spec": ["problem", "evidence", "why_now", "solution", "primary_user", "success_metrics",
             "ux_principles", "scope_in", "scope_out", "user_stories", "risks"],
    "vision": ["who", "demand_evidence", "why_us_now", "wedge", "taste"],
    "problem": ["who_hurts", "demand_evidence", "cost_of_problem", "why_now"],
    "brainstorm": ["core_idea", "adjacent_unexplored", "tensions", "why_now"],
    "pressure": ["weakest_assumptions", "missing_evidence", "failure_modes", "overlap_risk"],
    "devil": ["strongest_counter", "disconfirming_evidence", "alternative_path"],
}

LEDGER_PROMPT = """You grade what is ALREADY KNOWN before an agent interrogates a user.
For each slot, judge from the provided context only:
- "known": the context answers it. Give evidence (short quote + source name) and a one-line
  confirmation phrased as an assumption the user can correct.
- "weak": partially answered or asserted without evidence. Give what exists and a sharp
  drill-down question.
- "unknown": not answered. Give the single best question to ask.
Reply with ONLY valid JSON:
{"slots": [{"slot": "<name>", "status": "known|weak|unknown", "evidence": "<quote — source>",
"confirmation": "<one-liner if known>", "question": "<question if weak/unknown>"}]}"""


def _embed(text: str):
    from app.enricher_v2 import embed_text
    return embed_text(text)


def build_ledger(kind: str, seed_id: str | None, user: User, db: Session) -> dict:
    """Sweep context → grade slots → persist on the subject seed. Resumable."""
    from app.briefings import _call_llm

    kind = kind if kind in LEDGER_SLOTS else "spec"
    subject = None
    if seed_id:
        try:
            subject = db.query(Seed).filter(
                Seed.id == UUID(seed_id), Seed.tenant_id == user.tenant_id).first()
        except ValueError:
            subject = None

    # Resume an interrupted session
    if subject:
        prior = (subject.seed_metadata or {}).get("interrogation")
        if isinstance(prior, dict) and prior.get("kind") == kind and prior.get("ledger"):
            try:
                at = datetime.fromisoformat(prior.get("at", ""))
                if datetime.utcnow() - at < timedelta(days=RESUME_WINDOW_DAYS):
                    return {"status": "ok", "resumed": True, "kind": kind, "slots": prior["ledger"]}
            except Exception:
                pass

    # ── Context sweep ─────────────────────────────────────────────
    parts = []
    anchor = subject.title if subject else ""
    if subject:
        parts.append(f"SUBJECT ({subject.title}):\n{(subject.content or '')[:3000]}")
        meta = subject.seed_metadata or {}
        if kind == "pressure":
            if meta.get("rubric_score") is not None:
                parts.append(f"RUBRIC SCORE: {meta['rubric_score']}/7 (quality: {meta.get('quality', 'ok')})")
            if meta.get("overlaps"):
                parts.append("OVERLAPS: " + json.dumps(meta["overlaps"])[:400])
        # Source paper's table of contents (tree retrieval)
        src_paper_id = meta.get("source_paper_id")
        if src_paper_id:
            try:
                paper = db.query(Seed).filter(Seed.id == UUID(src_paper_id)).first()
                tree = (paper.seed_metadata or {}).get("doc_tree") if paper else None
                if tree:
                    toc = "\n".join(f"- {n['title']}: {n.get('summary', '')}" for n in tree[:20])
                    parts.append(f"SOURCE PAPER ({paper.title}) — sections:\n{toc}")
            except Exception:
                pass

    try:
        related = weaviate_client.search_seeds(
            tenant_id=str(user.tenant_id), embedding=_embed(anchor or kind), limit=6)
        related = [r for r in related if (r.get("title") or "").strip().lower() != anchor.strip().lower()][:5]
        if related:
            parts.append("RELATED GARDEN SEEDS:\n" + "\n".join(
                f"- \"{r.get('title', '')}\": {(r.get('summary') or r.get('content') or '')[:200]}" for r in related))
    except Exception:
        pass

    try:
        main = next((p for p in db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id, Seed.seed_type == "product").all()
            if (p.seed_metadata or {}).get("rank") == "main"), None)
        if main:
            pm = main.seed_metadata or {}
            parts.append(f"MAIN PRODUCT ({main.title}):\nPROBLEM: {pm.get('problem_statement', '')}\nPILLARS: "
                         + "; ".join(p["name"] for p in pm.get("pillars", [])))
    except Exception:
        pass

    try:
        from app.github_sync import get_repo_map_for_tenant
        rm = get_repo_map_for_tenant(str(user.tenant_id), db)
        if rm:
            parts.append(f"REPOSITORY (excerpt):\n{rm[:2000]}")
    except Exception:
        pass

    slots = LEDGER_SLOTS[kind]
    context = "\n\n".join(parts)[:16000] or "(no context available — everything is unknown)"
    raw = _call_llm(
        f"SLOTS TO GRADE ({kind}): {', '.join(slots)}\n\nCONTEXT:\n{context}",
        system=LEDGER_PROMPT, max_tokens=3000, model=settings.CHAT_MODEL)

    ledger = []
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        ledger = [s for s in json.loads(cleaned).get("slots", []) if s.get("slot") in slots]
    except Exception:
        pass
    if not ledger:
        # Degrade gracefully: everything unknown → the agent just asks (old behavior)
        ledger = [{"slot": s, "status": "unknown", "evidence": "", "question": ""} for s in slots]

    if subject:
        m = dict(subject.seed_metadata or {})
        m["interrogation"] = {"kind": kind, "ledger": ledger, "at": datetime.utcnow().isoformat()}
        subject.seed_metadata = m
        db.commit()

    known = sum(1 for s in ledger if s.get("status") == "known")
    logger.info(f"[ledger] {kind} for '{anchor[:40]}': {known} known / {len(ledger)} slots")
    return {"status": "ok", "resumed": False, "kind": kind, "slots": ledger}
