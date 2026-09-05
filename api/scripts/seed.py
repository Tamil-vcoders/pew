"""Seed the two demo projects and three prompts from docs/prototype.jsx, plus four
Firebase Auth accounts (one per role) for demoing RBAC gating end to end. Safe to
run more than once — every write is keyed so re-runs don't duplicate data."""
from __future__ import annotations

import asyncio
import os
from typing import Any

from firebase_admin import auth as fb_auth
from google.cloud import firestore

from app.adapters.firestore_repos import FirestoreAuditRepo, FirestoreUserRepo
from app.deps import get_firebase_app, get_firestore_client

TRIAGE_PROMPT = (
    "Summarize the support ticket and figure out how urgent it is. Try to be helpful "
    "and use your best judgement.\n\nTicket: {{ticket_text}}\nUrgency levels: "
    "{{urgency_levels}}\n\nGive me an answer."
)
REPLY_PROMPT = (
    "Write a reply to the customer. Try to sound nice.\n\nTicket: {{ticket_text}}\n"
    "Tone guide: {{tone}}\n\nAnswer:"
)
BLURB_PROMPT = (
    "Write a short product blurb. Try to make it catchy if possible.\n\nProduct notes: "
    "{{product_notes}}\nBrand voice: {{brand_voice}}\n\nBlurb:"
)

# Order matters: asha MUST be seeded first. She is the one who goes through
# `get_or_bootstrap` while `meta/bootstrap` doesn't exist yet, so she becomes the real
# bootstrapped administrator and writes the sentinel doc, exactly like a real first sign-in
# would. Everyone after her hits `get_or_bootstrap` with the sentinel already present, so
# they come back as "viewer" and need their role corrected by a direct update afterward.
DEMO_ACCOUNTS = [
    ("Asha Rao", "asha@acme.dev", "administrator"),
    ("Vikram Iyer", "vikram@acme.dev", "maintainer"),
    ("Meera Krishnan", "meera@acme.dev", "contributor"),
    ("Dev Patel", "dev@acme.dev", "viewer"),
]
DEMO_PASSWORD = "correct horse battery staple"

DEFAULT_CFG: dict[str, Any] = {
    "target": 8, "maxIter": 4, "budget": 0.6, "nSug": 2, "auto": False,
    "weights": {"code": 1, "model": 1, "human": 1},
    "models": {
        "execution": "gemini-2.5-pro", "grading": "gemini-2.5-flash",
        "suggestions": "gemini-2.5-flash", "datasetGen": "gemini-2.5-flash",
    },
}


async def _upsert_project(fs: firestore.AsyncClient, name: str, cfg: dict[str, Any]) -> str:
    existing = [d async for d in fs.collection("projects").where("name", "==", name).limit(1).stream()]
    if existing:
        return str(existing[0].id)
    ref = fs.collection("projects").document()
    await ref.set({"name": name, "cfg": cfg})
    return str(ref.id)


async def _upsert_prompt(fs: firestore.AsyncClient, project_id: str, name: str, tags: list[str], text: str) -> None:
    collection = fs.collection("projects").document(project_id).collection("prompts")
    existing = [d async for d in collection.where("nameLower", "==", name.lower()).limit(1).stream()]
    if existing:
        return
    ref = collection.document()
    await ref.set({
        "name": name, "nameLower": name.lower(), "tags": tags,
        "archived": False, "bestScore": None, "latestVersion": 1,
    })
    await ref.collection("versions").document("1").set({
        "n": 1, "text": text, "note": "Initial draft", "technique": None,
        "createdBy": "seed-script", "createdAt": None,
    })


async def _upsert_demo_accounts(fs: firestore.AsyncClient) -> None:
    """Create the four demo Firebase Auth accounts and their Firestore user docs through the
    exact same path a real sign-in uses (`FirestoreUserRepo.get_or_bootstrap`) rather than a
    parallel hand-rolled write. This matters: `get_or_bootstrap` is what writes the
    `meta/bootstrap` sentinel doc that decides "has an administrator already been assigned?" —
    a hand-rolled write that only touches `users/{uid}` (the old approach) left that sentinel
    missing, so the next real person to sign in for the first time would silently become
    administrator. Routing every demo account through `get_or_bootstrap` — asha first, while
    the sentinel doesn't exist yet, so she becomes the real bootstrapped administrator — closes
    that gap using the already-reviewed-and-tested bootstrap transaction itself.

    `get_or_bootstrap` only ever hands out "administrator" (first caller) or "viewer" (every
    caller after); there is no role-promotion endpoint yet (Phase 5), so vikram/meera get their
    specific non-viewer role applied via a direct Firestore update afterward — the one place a
    raw Firestore write for a single field is appropriate in this codebase pre-Phase-5.
    """
    app = get_firebase_app()
    audit_repo = FirestoreAuditRepo(fs)
    user_repo = FirestoreUserRepo(fs, audit_repo)

    for name, email, role in DEMO_ACCOUNTS:
        try:
            user_record = fb_auth.get_user_by_email(email, app=app)
        except fb_auth.UserNotFoundError:
            user_record = fb_auth.create_user(email=email, password=DEMO_PASSWORD, display_name=name, app=app)

        await user_repo.get_or_bootstrap(uid=user_record.uid, email=email, name=name)
        if role != "viewer":
            # Idempotent: re-running always re-asserts the intended role, whether this is
            # the first seed (get_or_bootstrap just created the doc as "viewer") or a re-run
            # (the doc already has the right role and this is a harmless no-op write).
            await fs.collection("users").document(user_record.uid).update({"role": role})


async def run(*, force: bool = False) -> None:
    if not force and not os.environ.get("FIRESTORE_EMULATOR_HOST"):
        raise RuntimeError(
            "refusing to seed a non-emulator Firestore project; set FIRESTORE_EMULATOR_HOST "
            "or pass force=True"
        )
    fs = await get_firestore_client()

    support_id = await _upsert_project(fs, "Support automation", DEFAULT_CFG)
    marketing_cfg: dict[str, Any] = {
        **DEFAULT_CFG, "target": 7.5, "maxIter": 3, "budget": 1.0,
    }
    marketing_id = await _upsert_project(fs, "Marketing copy", marketing_cfg)

    await _upsert_prompt(fs, support_id, "Ticket triage", ["triage", "prod"], TRIAGE_PROMPT)
    await _upsert_prompt(fs, support_id, "Reply drafter", ["replies", "experiment"], REPLY_PROMPT)
    await _upsert_prompt(fs, marketing_id, "Product blurb writer", ["marketing", "experiment"], BLURB_PROMPT)

    await _upsert_demo_accounts(fs)


if __name__ == "__main__":
    asyncio.run(run())
