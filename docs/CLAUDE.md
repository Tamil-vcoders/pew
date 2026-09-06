# CLAUDE.md — Prompt Evaluation Workbench (pew)

**Current status:** Phases 0–4 ✅ (auth/RBAC, editor + validation + versions, datasets +
Gemini runs + suggestions, improvement cycle w/ caps, end reasons, auto mode). Now building:
Phase 5.

This repo implements **docs/devspec.md** exactly. Read it before any task.
Behaviour questions the devspec doesn't answer: **docs/prd.md** (PRD v3).
UI/interaction questions the PRD doesn't answer: **docs/prototype.jsx** wins.

## Project constants
- GCP/Firebase project: `pew-ideathon` · region: `asia-south1`
- GitHub repo: `Tamil-vcoders/pew` (WIF trust is pinned to this exact string)
- Cloud Run services: `pew-web` (Next.js), `pew-api` (FastAPI)
- Gemini via AI Studio key in Secret Manager (`gemini-api-key`); never in code, env files, or the browser

## Process
- Work strictly phase by phase (devspec §10). Never start phase N+1 work
  while phase N exit criteria are unmet. State which phase a change belongs to.
- One branch per phase; small commits; open PRs with `gh pr create`.
- Scope cuts in devspec §1.2 / PRD §5.2 are final — do not reintroduce
  (no Celery, no delete-anywhere, no BYO keys, no invitations, no multi-provider,
  no scheduled rescoring, one active cycle at a time).

## Architecture invariants (violating these = wrong, even if it works)
- `api/app/domain/` is pure Python: ZERO `google.*` or `firebase_admin` imports.
  Ports in `app/ports/`, adapters in `app/adapters/`, wiring only in `deps.py`.
- Versions are append-only; auditLogs append-only. No update/delete paths exist.
- Budget projection is checked BEFORE an iteration starts (AC-9.5), never mid-run.
- Cycle state lives in its Firestore doc — any instance must be able to resume it.
- RBAC is enforced in API routes via `require(role)`; UI gating is cosmetic only.
- `web/`: pages in `app/` only compose features from `web/features/*`;
  `onSnapshot` lives in feature hooks; the browser NEVER writes Firestore directly.
- Every Gemini call goes through the `LLMProvider` port; graders use temperature 0
  and structured JSON output.

## Privacy (hard rule)
Never log prompt text, dataset/case content, model outputs, or grader reasoning —
IDs, counts, costs, durations, statuses only. Use the log helper, not raw logging.

## Verification (run after every change, before claiming done)
- api: `cd api && ruff check . && mypy app && pytest`
- web: `cd web && npm run lint && npx tsc --noEmit && npx vitest run`
- Firestore-dependent tests: `firebase emulators:exec --only firestore,auth "pytest tests/integration"`
- Never mark a phase complete from code review alone — its devspec exit criteria
  must be demonstrable on the deployed URL.

## Testing conventions
- New domain logic ships with unit tests in the same PR (cycle transitions,
  blending, validation rules, estimates — PRD ACs become assertions).
- Use `FakeLLMProvider` in tests; never spend real Gemini tokens in CI.

## Don'ts
- Don't edit `.github/workflows/*` or `firestore.rules` casually — call out any
  change to them explicitly in the PR description.
- Don't add dependencies without stating why in the commit message.
- Don't "improve" the prototype's UX during porting; parity first, polish in Phase 5.