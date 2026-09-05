# Devspec — Prompt Evaluation Workbench v1 (ideathon build)

**Version:** 1.0 · **Status:** ready for build · **Target:** Google Gen AI Academy APAC Cohort 3 ideathon

**Source documents:** `prompt-eval-workbench-v2.md` (PRD, authoritative for behaviour), `prompt-eval-workbench.jsx` (interactive prototype, authoritative for UI and interaction design), and the architecture decision from the design session (two Cloud Run services, hexagonal API, Firestore realtime).

This devspec turns those into a buildable plan: concrete repository layout, working reference code, a phase-by-phase schedule with exit criteria, and a CI/CD pipeline that auto-deploys to Cloud Run from the first day.

---

## 1. Scope

### 1.1 What v1 ships

A production-ready, authenticated web application where a signed-in user organises prompts into projects, edits a prompt with live static validation, maintains a private test dataset per prompt, runs Gemini-powered evaluations that stream results into the UI, receives evidence-linked improvement suggestions (one technique each), and drives a capped improvement cycle (target score, iteration cap, budget cap, per-stage pausing, recorded end reasons). Versions are immutable and append-only. Roles (viewer / contributor / maintainer / administrator) are enforced server-side on every endpoint.

### 1.2 v1 non-goals (deliberate cuts, do not silently reintroduce)

Single organisation only. No invitation flow (first signed-up user becomes administrator; admins change roles in-app). One active improvement cycle at a time, globally. Gemini is the only provider (the port makes others possible later). No scheduled re-scoring, no BYO user API keys (org key from Secret Manager only — the prototype's "Your API keys" panel ships as a disabled preview), no prompt moves between projects, no delete anywhere (archive only).

### 1.3 Ideathon compliance (hard requirements)

| Rule | How this build satisfies it |
|---|---|
| Deployed on **Cloud Run** | Two services: `pew-web` (Next.js) and `pew-api` (FastAPI), both Cloud Run |
| **Firebase Authentication** | Email/password + Google sign-in on the client; ID token verified by the API on every request |
| **Firestore** | All workspace data; also the realtime channel (`onSnapshot`) for streaming run results |
| **Gemini API (AI Studio)** | `gemini-2.5-pro` for prompt execution, `gemini-2.5-flash` for grading, suggestions, dataset generation; AI Studio key in Secret Manager |
| Public deployment URL | `pew-web` service URL (custom domain optional) |
| Public repo | Monorepo on GitHub, MIT licence, README with architecture diagram |
| Social post | Recorded walkthrough of the deployed URL, posted with `#AccelerateAIwithCloudRun` |
| Brief description | §16 contains the submission paragraph template |

---

## 2. Google Cloud service map

| Service | Role in this system |
|---|---|
| **Cloud Run** | Hosts both services. `pew-web`: 512 MiB, concurrency 80, timeout 60 s. `pew-api`: 1 GiB, concurrency 40, timeout 900 s (covers an in-request iteration). Min instances 0 (scale to zero). |
| **Firebase Authentication** | Identity only. Email/password + Google providers. Roles are **not** stored in custom claims (stale up to 1 h); they live in Firestore `users/{uid}` and are read fresh per request. |
| **Firestore (Native mode)** | System of record and realtime transport. Clients hold read-only access via security rules; all writes go through the API. |
| **Secret Manager** | `GEMINI_API_KEY` (AI Studio). Mounted into `pew-api` as an env var at deploy time. Never in the repo, never sent to the browser. |
| **Artifact Registry** | Docker images for both services, one repository `pew`. |
| **Cloud Tasks** | Durable execution of cycle iterations from Phase 5 onward (see §8). Queue `cycle-iterations`, OIDC-authenticated push to an internal API endpoint. |
| **Cloud Logging / Error Reporting** | Structured JSON logs. **Prompt text, dataset content, model outputs, and grader reasoning are never logged** (PRD privacy rule) — log IDs, counts, costs, durations, statuses only. |
| **Cloud Build** *(optional)* | CI runs in GitHub Actions; keep Cloud Build as the fallback runner if Actions minutes run out. |

Firebase project and GCP project are the same project (`pew-ideathon`), so Firestore, Auth, and Cloud Run share IAM.

---

## 3. Architecture and design patterns

```
Browser (Next.js + Firebase Auth SDK)
   │  static/SSR                 │ Bearer <ID token>          ▲ onSnapshot (read-only,
   ▼                             ▼                            │  rules-scoped)
Cloud Run · pew-web        Cloud Run · pew-api ──────────► Firestore
(Next.js SSR)              (FastAPI, hexagonal)               ▲
                              │            ▲                  │ per-case writes
                              ▼            │ key              │ during a run
                          Gemini API   Secret Manager ────────┘
```

The API is **hexagonal (ports and adapters)**. The domain layer is pure Python with zero `google.*` imports — it is the part of the product that carries the PRD's logic and it must stay unit-testable without emulators.

| Pattern | Where | Why |
|---|---|---|
| **Ports & adapters** | `api/app/domain` vs `api/app/adapters` | Gemini is a competition constraint, not an identity; `LLMProvider` port preserves the PRD's provider abstraction (US-8) |
| **Strategy** | Validation rules (`RULES`), graders (code / model / human), suggestion fixers | Same registry shape as the prototype; adding a rule or grader is additive |
| **State machine** | Improvement cycle: `dataset → preview → running → grading → checking → suggesting → ended(reason)` | Cloud Run is stateless — the machine's current state is **persisted in the `cycles/{id}` document** and re-hydrated on every request/task |
| **Repository** | One repo class per aggregate (projects, prompts, versions, runs, cycles, audit) | Firestore details never leak into domain code |
| **Snapshot config** | Cycle copies project cfg at start | Comparability tuple (dataset version, grader config, model, temperature) stays fixed mid-cycle even if a maintainer edits the project |

End reasons are a closed enum, verbatim from the PRD/prototype: `target-met`, `iteration-cap`, `budget-cap`, `user-stopped`, `no-suggestions`, `not-converging`.

Two invariants inherited from the design sessions, restated because they are easy to lose in implementation: the **budget check runs before an iteration is started, never mid-iteration** (spend-with-no-score is the worst outcome), and **iteration-cap endings identify the best version across all iterations and offer "new cycle from best"** (AC-9.4).

---

## 4. Repository layout (monorepo)

```
pew/
├── web/                        # Next.js 14+ (App Router, TypeScript) — see §5
├── api/                        # FastAPI (Python 3.12) — see §6
├── firestore.rules
├── firestore.indexes.json
├── .github/workflows/
│   ├── ci.yml                  # lint + typecheck + test on every PR
│   └── deploy.yml              # build → push → deploy on main
├── docs/
│   ├── architecture.md         # diagram + this spec's §3
│   └── demo-script.md
├── LICENSE                     # MIT
└── README.md                   # setup, deploy, submission links
```

---

## 5. `web/` — Next.js, feature-based structure

App Router with a thin `app/` routing shell; all real code lives under `features/`. A feature owns its components, hooks, client API calls, and types. Nothing imports from another feature's internals — cross-feature needs go through `shared/` or the feature's public `index.ts`.

```
web/
├── app/
│   ├── layout.tsx                    # fonts, theme, AuthProvider
│   ├── (auth)/login/page.tsx         # → features/auth
│   ├── (workspace)/
│   │   ├── layout.tsx                # header + project tree shell
│   │   ├── p/[promptId]/page.tsx     # editor + tabs (composes features)
│   │   └── settings/page.tsx         # → features/settings-global
│   └── api/healthz/route.ts
├── features/
│   ├── auth/                 # LoginCard, useAuth, guards; Firebase signIn/signUp/Google/reset
│   ├── workspace/            # ProjectTree, search, tags, archive toggle, new prompt/project
│   ├── editor/               # PromptEditor, VersionHistory, DiffBlock, revert
│   ├── validation/           # ValidationPanel — client-side mirror of the rule catalogue (display only; server result is authoritative)
│   ├── dataset/              # DatasetTab, CaseRow, generate-with-AI, lock states
│   ├── runs/                 # RunTab, ScoreSummary, CaseResultRow, ManualGradeInput,
│   │                         #   useRunStream (onSnapshot subscription)
│   ├── suggestions/          # SuggestionCard, candidate selection, apply/dismiss
│   ├── cycle/                # CycleBanner (per-stage), CycleStatusChip, CycleLog,
│   │                         #   EstimateTable, useCycle
│   ├── setup/                # per-project Setup tab: cfg form, weights, models, start cycle
│   ├── settings-global/      # Profile, Security, Model registry, Privacy, Danger zone
│   └── members/              # admin member list + role select + audit trail
├── shared/
│   ├── api/client.ts         # fetch wrapper: attaches ID token, maps errors
│   ├── firebase/client.ts    # app init from NEXT_PUBLIC_FIREBASE_* env
│   ├── ui/                   # Btn, Field, Tab, ScoreBadge, RoleBadge, Section (ported from prototype)
│   ├── rbac/permissions.ts   # role → capability map (UI gating only; server re-checks)
│   └── types/                # zod schemas shared with API response shapes
├── Dockerfile
└── package.json
```

Feature rules: (1) a page in `app/` may only compose feature components; (2) Firestore `onSnapshot` subscriptions live in feature hooks (`useRunStream`, `useCycle`), never in pages; (3) every mutation goes through `shared/api/client.ts` to the FastAPI service — the web client **never writes Firestore directly**.

Reference hook — this is the realtime pattern the whole UI leans on:

```ts
// features/runs/useRunStream.ts
"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/shared/firebase/client";
import type { CaseResult, RunDoc } from "@/shared/types/runs";

export function useRunStream(projectId: string, promptId: string, runId: string) {
  const [run, setRun] = useState<RunDoc | null>(null);
  const [cases, setCases] = useState<CaseResult[]>([]);

  useEffect(() => {
    if (!runId) return;
    const base = `projects/${projectId}/prompts/${promptId}/runs/${runId}`;
    const unsubRun = onSnapshot(doc(db, base), (s) => setRun(s.data() as RunDoc));
    const unsubCases = onSnapshot(
      query(collection(db, `${base}/cases`), orderBy("index")),
      (snap) => setCases(snap.docs.map((d) => d.data() as CaseResult)),
    );
    return () => { unsubRun(); unsubCases(); };
  }, [projectId, promptId, runId]);

  return { run, cases }; // cases arrive one by one as the API writes them
}
```

The prototype (`prompt-eval-workbench.jsx`) is the UI contract: layout (tree / editor+validation / tabs), the four tabs (Setup, Dataset, Run, Suggestions), stage banners with continue/edit/stop, the estimate table shown **before** every spend, the cycle status chip always visible in the header (AC-9.6), diff rendering for suggestions, role-gated controls with "requires X role" captions, and the Global settings sections. Port components rather than reinventing them; replace the seeded RNG simulation with real API calls and `onSnapshot` data.

---

## 6. `api/` — FastAPI, hexagonal

```
api/
├── app/
│   ├── main.py                 # FastAPI app, routers, CORS, error handlers
│   ├── deps.py                 # auth dependency, RBAC dependency, repo/provider wiring
│   ├── config.py               # pydantic-settings: env vars
│   ├── domain/                 # PURE python — no google imports
│   │   ├── models.py           # dataclasses: Project, Prompt, Version, Case, Run, Cycle…
│   │   ├── validation.py       # rule catalogue (static, model-free — AC-1.4)
│   │   ├── scoring.py          # graders + weighted blend (human weight only on graded cases)
│   │   ├── suggestions.py      # rule → technique mapping; one technique per suggestion (AC-5.5)
│   │   ├── estimate.py         # §7.2 token arithmetic; refined by count_tokens at runtime
│   │   └── cycle.py            # state machine: transitions, cap checks, end reasons
│   ├── ports/
│   │   ├── llm.py              # LLMProvider protocol
│   │   ├── repos.py            # repository protocols
│   │   └── tasks.py            # TaskQueue protocol (enqueue_iteration)
│   ├── adapters/
│   │   ├── gemini.py           # google-genai implementation
│   │   ├── firestore_repos.py  # firestore-admin implementation
│   │   ├── cloud_tasks.py      # Cloud Tasks implementation of TaskQueue
│   │   └── inline_tasks.py     # dev/Phase-3 implementation: runs in-request
│   ├── services/
│   │   ├── runs.py             # execute+grade an evaluation run (bounded concurrency)
│   │   └── cycles.py           # orchestrates the state machine around repos/queue
│   └── routes/
│       ├── auth.py             # /me (bootstrap user doc, first user → administrator)
│       ├── projects.py         # CRUD + cfg (maintainer)
│       ├── prompts.py          # CRUD, tags, archive, versions (immutable append)
│       ├── datasets.py         # case CRUD, generate (locked while cycle ≥ iter 1)
│       ├── runs.py             # POST run, GET estimate
│       ├── cycles.py           # start / approve-dataset / confirm-iteration / continue / stop
│       ├── suggestions.py      # generate, apply-as-version
│       ├── admin.py            # members, role changes (+ audit), model registry
│       └── internal.py         # /internal/iterations — Cloud Tasks target (OIDC-only)
├── tests/                      # domain unit tests + emulator integration tests
├── Dockerfile
└── pyproject.toml              # fastapi, uvicorn, firebase-admin, google-genai,
                                # google-cloud-tasks, pydantic-settings; dev: pytest, ruff, mypy
```

### 6.1 Auth + RBAC (working reference)

```python
# app/deps.py
from fastapi import Depends, Header, HTTPException
from firebase_admin import auth as fb_auth
from app.adapters.firestore_repos import UserRepo

ROLE_LEVEL = {"viewer": 0, "contributor": 1, "maintainer": 2, "administrator": 3}

async def current_user(authorization: str = Header(...), users: UserRepo = Depends(get_user_repo)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        decoded = fb_auth.verify_id_token(authorization.removeprefix("Bearer "))
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = await users.get_or_bootstrap(uid=decoded["uid"],
                                        email=decoded.get("email"),
                                        name=decoded.get("name"))
    return user  # role read fresh from Firestore — never from token claims

def require(min_role: str):
    async def guard(user=Depends(current_user)):
        if ROLE_LEVEL[user.role] < ROLE_LEVEL[min_role]:
            raise HTTPException(403, f"Requires {min_role} role")
        return user
    return guard

# usage: @router.post("/projects", dependencies=[Depends(require("maintainer"))])
```

`get_or_bootstrap` creates `users/{uid}` on first sight; if the `users` collection is empty, the first user is created as `administrator` (v1 replacement for an invite flow) and the event is written to `auditLogs`.

Permission matrix (identical to the prototype's gating — the UI hides/disables, the API enforces):

| Capability | viewer | contributor | maintainer | administrator |
|---|---|---|---|---|
| Read everything in the org | ✓ | ✓ | ✓ | ✓ |
| Edit prompts, run evals, drive cycles, grade, apply suggestions, tags, new prompts | | ✓ | ✓ | ✓ |
| Project cfg (models/weights/caps), create projects, archive, model registry | | | ✓ | ✓ |
| Member roles (audit-logged), org-level admin | | | | ✓ |

### 6.2 LLM port and Gemini adapter (working reference)

```python
# app/ports/llm.py
from typing import Protocol
from app.domain.models import GraderVerdict, SuggestionDraft

class LLMProvider(Protocol):
    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]: ...
    async def grade(self, prompt: str, output: str, expected: str, model: str) -> GraderVerdict: ...
    async def suggest(self, prompt: str, technique: str, evidence: str, model: str) -> SuggestionDraft: ...
    async def generate_cases(self, prompt: str, n: int, model: str) -> list[dict]: ...
    async def count_tokens(self, text: str, model: str) -> int: ...
```

```python
# app/adapters/gemini.py
from google import genai
from google.genai import types
from app.domain.models import GraderVerdict

GRADER_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    required=["score", "weakness", "reasoning"],
    properties={
        "score": types.Schema(type=types.Type.NUMBER, description="1-10"),
        "weakness": types.Schema(type=types.Type.STRING, nullable=True,
                                 description="dominant weakness category or null"),
        "reasoning": types.Schema(type=types.Type.STRING),
    },
)

class GeminiProvider:
    def __init__(self, api_key: str):
        self._client = genai.Client(api_key=api_key)  # AI Studio key from Secret Manager

    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]:
        r = await self._client.aio.models.generate_content(model=model, contents=prompt)
        u = r.usage_metadata
        return r.text, u.prompt_token_count, u.candidates_token_count

    async def grade(self, prompt, output, expected, model) -> GraderVerdict:
        grading_prompt = (
            "You are grading a model output against an expectation.\n"
            f"<prompt>{prompt}</prompt>\n<output>{output}</output>\n"
            f"<expected>{expected}</expected>\n"
            "Score 1-10 for correctness, format compliance, and completeness."
        )
        r = await self._client.aio.models.generate_content(
            model=model,
            contents=grading_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GRADER_SCHEMA,
                temperature=0,                      # graders are deterministic
            ),
        )
        return GraderVerdict.model_validate_json(r.text)

    async def count_tokens(self, text: str, model: str) -> int:
        r = await self._client.aio.models.count_tokens(model=model, contents=text)
        return r.total_tokens
```

Per-stage default models (project cfg, editable by maintainers): execution `gemini-2.5-pro`; grading, suggestions, dataset generation `gemini-2.5-flash`. Static validation remains model-free by design (AC-1.4) — surface that in the UI exactly as the prototype does ("static · no model · $0"). Add tenacity-style retry (3 attempts, exponential backoff, jitter) around every Gemini call; a case that fails all retries records `status: "error"` and is excluded from the composite with a visible marker, never a silent zero.

### 6.3 Evaluation run service (working reference — bounded concurrency + streaming writes)

```python
# app/services/runs.py
import asyncio
from app.ports.llm import LLMProvider
from app.ports.repos import RunRepo
from app.domain.scoring import code_grade, blend

MAX_CONCURRENCY = 3  # PRD: ≤3 concurrent model calls

async def execute_run(run_id, prompt_text, cases, cfg, llm: LLMProvider, runs: RunRepo):
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def one(idx, case):
        async with sem:
            output, tin, tout = await llm.execute(render(prompt_text, case.input),
                                                  cfg.models.execution)
            verdict = await llm.grade(prompt_text, output, case.expected, cfg.models.grading)
            result = {
                "index": idx, "caseId": case.id,
                "output": output,
                "codeScore": code_grade(output, prompt_text),
                "modelScore": verdict.score,
                "weakness": verdict.weakness,
                "tokensIn": tin, "tokensOut": tout,
                "status": "done",
            }
            await runs.write_case(run_id, case.id, result)   # ← browser sees it via onSnapshot

    await asyncio.gather(*(one(i, c) for i, c in enumerate(cases)))
    await runs.finalize(run_id)  # composite, cost, status: "complete"
```

Cost accounting: estimate before the run with `count_tokens` on the rendered prompts plus §7.2 output constants; record actuals from `usage_metadata` after. The pre-check gate (budget) always uses the estimate; the ledger uses actuals.

---

## 7. Firestore data model and security rules

```
users/{uid}                          name, email, role, createdAt
projects/{pid}                       name, cfg{target,maxIter,budget,nSug,auto,
                                         weights{code,model,human},
                                         models{execution,grading,suggestions,datasetGen}}
projects/{pid}/prompts/{promptId}    name, tags[], archived, bestScore, latestVersion   ← denormalized
  …/versions/{n}                     text, note, technique, createdBy, createdAt        ← append-only
  …/dataset/{caseId}                 input, expected, order, source(manual|generated)
  …/runs/{runId}                     versionN, status, composite, codeAvg, modelAvg,
                                     costEstimate, costActual, startedBy, startedAt
      …/cases/{caseId}               (see §6.3 result shape) + humanScore
cycles/{cycleId}                     promptId, projectId, status, stage, iteration, spent,
                                     scores[], endReason, bestN, warnedFlat,
                                     configSnapshot{…}, log[], startedBy
modelRegistry/{modelId}              label, ratesInPer1M, ratesOutPer1M, enabled
auditLogs/{entryId}                  actor, action, subject, before, after, ts           ← append-only
```

Denormalisation is the read-path strategy: the sidebar renders from a single `prompts` query because `bestScore` and `latestVersion` are updated transactionally whenever a run finalises or a version is created. There are no joins in Firestore — do not design as if there were.

Security rules — clients are **read-only** (that is what powers `onSnapshot`), membership-scoped; all writes come from the API service account, which bypasses rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function isMember() {
      return signedIn()
        && exists(/databases/$(db)/documents/users/$(request.auth.uid));
    }
    match /users/{uid}         { allow read: if signedIn() && request.auth.uid == uid; allow write: if false; }
    match /projects/{p}        { allow read: if isMember(); allow write: if false;
      match /{document=**}     { allow read: if isMember(); allow write: if false; } }
    match /cycles/{c}          { allow read: if isMember(); allow write: if false; }
    match /modelRegistry/{m}   { allow read: if isMember(); allow write: if false; }
    match /auditLogs/{e}       { allow read: if isMember(); allow write: if false; }
  }
}
```

`allow write: if false` everywhere is the whole point: version immutability, append-only audit, and RBAC all reduce to "only the API writes, and the API checks roles". Required composite index: `cycles` on (`status`, `startedAt`) — enforcing "one active cycle" is a transaction that queries `status == "active"` before creating.

---

## 8. Long-running execution — recommendation (requirement 7)

**Do not use Celery on Cloud Run.** Celery assumes an always-on broker (Redis/RabbitMQ → Memorystore, which has no free tier and no scale-to-zero) plus long-lived worker processes — the opposite of Cloud Run's request-scoped, scale-to-zero model. CPU is only guaranteed during request handling, so background Celery workers inside a Cloud Run container are throttled or killed. Celery becomes the right answer only if this system later moves to GKE or always-on VMs.

**Recommended: Cloud Tasks + the persisted state machine**, phased:

| Phase | Mechanism | Why it's enough |
|---|---|---|
| 3–4 | `inline_tasks.py`: iteration executes inside the API request (`asyncio`, semaphore 3), 900 s timeout | A 20-case iteration ≈ 2–4 min; simplest thing that works, streaming still via Firestore writes |
| 5+ | `cloud_tasks.py`: `POST /cycles/{id}/confirm` performs the budget pre-check, marks `stage: "running"`, and **enqueues** a Cloud Task → OIDC-authenticated `POST /internal/iterations` executes it | Survives client disconnects and instance restarts; retries are safe because the handler is idempotent; auto mode chains iterations by enqueuing the next task at the end of `checking` |

Both implement the same `TaskQueue` port, so the switch is a wiring change in `deps.py`, not a rewrite.

```python
# app/adapters/cloud_tasks.py
import json
from google.cloud import tasks_v2

class CloudTasksQueue:
    def __init__(self, project, location, queue, api_url, invoker_sa):
        self._client = tasks_v2.CloudTasksClient()
        self._parent = self._client.queue_path(project, location, queue)
        self._url, self._sa = api_url, invoker_sa

    def enqueue_iteration(self, cycle_id: str, iteration: int):
        task = {
            "name": f"{self._parent}/tasks/{cycle_id}-{iteration}",  # dedup: at-most-once per iteration
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"{self._url}/internal/iterations",
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"cycleId": cycle_id, "iteration": iteration}).encode(),
                "oidc_token": {"service_account_email": self._sa},
            },
        }
        self._client.create_task(request={"parent": self._parent, "task": task})
```

Idempotency contract for `/internal/iterations`: reload the cycle doc; if `iteration` already recorded in `scores[]` or `status != "active"`, return 200 and do nothing. The endpoint accepts only OIDC tokens from the invoker service account (verified with `google.auth` ID-token validation) — it is not reachable with user tokens. Alternatives considered: Pub/Sub push (equivalent, but Tasks gives named-task dedup and rate control for free) and Cloud Run Jobs (right for future batch re-scoring, wrong for interactive iterations).

---

## 9. Feature inventory (from the prototype) mapped to phases

| # | Feature (prototype reference) | Phase |
|---|---|---|
| F1 | Login page: email/password + Google, sign-up, reset, validation errors | 1 |
| F2 | Workspace tree: projects → prompts, collapse, search (name+tag), tags, archive+show-archived, new prompt/project, best-score badges, cycle pulse | 1 (tree/CRUD), 4 (badges/pulse) |
| F3 | Prompt editor: draft vs versions, dirty indicator, revert, immutable version history with notes/techniques | 2 |
| F4 | Live static validation panel (4-rule catalogue, advisory, $0) | 2 |
| F5 | Suggestions: evidence-linked, one technique each, line diff, apply-as-version, dismiss | 2 (static evidence), 3 (Gemini-drafted rewrite) |
| F6 | Dataset tab: case CRUD, generate-with-AI, lock during cycle, private-per-prompt notice | 3 |
| F7 | Run tab: pre-run cost estimate table, streaming case results, composite/code/model/human summary, expandable case detail, manual grades blending as third grader | 3 |
| F8 | Setup tab: per-project cycle defaults, weights, per-stage models, estimate + "budget covers ~X of Y iterations" warning, start cycle | 3 |
| F9 | Improvement cycle: full state machine, stage banners (approve dataset / confirm iteration+projection / grade pause / candidate select / flat-score warning), attended + auto mode, caps, end reasons, cycle-ended card, "new cycle from best", cycle log, one-cycle-at-a-time note | 4 |
| F10 | RBAC gating across all of the above (captions on disabled controls) | 1 (skeleton), enforced per feature as it lands |
| F11 | Global settings: profile, security (password change/reset via Firebase), model registry (rates+enable feeding estimators), privacy (retention selector UI, locked analytics exclusion), danger zone (account deletion) | 5 |
| F12 | Members + append-only audit trail (admin) | 5 |
| F13 | "Your API keys" panel | shipped disabled with "coming soon" note (scope cut) |

---

## 10. Phase plan

Each phase ends deployed to the production URL (the pipeline exists from Phase 0), with its exit criteria demonstrable on that URL.

**Phase 0 — Bootstrap (repo, cloud, pipeline).** Create GCP/Firebase project; enable Auth (email + Google), Firestore, Artifact Registry, Cloud Run, Secret Manager, Cloud Tasks. Monorepo scaffold: hello-world Next.js + FastAPI `/healthz`, Dockerfiles, both GitHub Actions workflows, Workload Identity Federation (no JSON keys), deploy of `firestore.rules`. **Exit:** merging to `main` auto-deploys both services; public URLs respond; CI green on a PR.

**Phase 1 — Auth, RBAC skeleton, workspace CRUD.** Firebase Auth on the client (login page per prototype); `current_user` + `require()` on the API; first-user-becomes-admin bootstrap; projects/prompts CRUD with unique-name-per-project and archive; workspace tree UI with search and tags; security rules v1; seed script (the two demo projects and three prompts from the prototype). **Exit:** two users with different roles see correctly gated UI *and* the API returns 403 when the viewer's token calls a contributor endpoint (tested, not assumed).

**Phase 2 — Editor, static validation, versions, static suggestions.** Editor with draft/dirty/revert; `POST /versions` append-only (attempted update rejected by rules); validation catalogue in `domain/validation.py` with the client mirror for live feedback; suggestions tab with diff view and apply-as-version. **Exit:** the prototype's editor demo path works end-to-end against real data: fail 4 rules → apply fixes → version history shows techniques.

**Phase 3 — Datasets, real Gemini runs, estimates, manual grades.** Dataset CRUD + Gemini-generated cases; run service (§6.3) behind `inline_tasks`; estimate endpoint using `count_tokens` + registry rates, rendered in the pre-run table; `useRunStream` streaming; manual grade writes with blended composite; suggestions upgraded to Gemini-drafted rewrites (evidence = failed rule, one technique each). **Exit:** "Run once" on the seeded triage prompt streams case-by-case results on the deployed URL and records estimate vs actual cost.

**Phase 4 — Improvement cycle.** `domain/cycle.py` state machine persisted in Firestore; all stage banners; attended and auto modes; budget projection before each iteration; flat-score warning (auto mode → `not-converging` stop); end reasons; cycle-ended card with best version and "new cycle from best"; header status chip; one-active-cycle transaction. **Exit:** scripted demo — start a cycle with a small budget, watch it end `budget-cap` with the projection message; start another that ends `target-met`.

**Phase 5 — Global settings, members, Cloud Tasks, polish.** Global settings sections (F11) with model registry live-feeding estimates; members + audit (F12); switch cycle execution to Cloud Tasks; empty states, error toasts, mobile-width pass on the tree. **Exit:** role change by admin appears in audit log and takes effect on the target's next request; a cycle survives closing the browser mid-iteration.

**Phase 6 — Hardening + submission.** Load a 30-case dataset; retry/backoff verification (kill a Gemini call, see `error` case marker); log audit for content leakage; Lighthouse + a11y pass on login and workspace; README with architecture diagram; record walkthrough video **on the deployed URL**; social post with `#AccelerateAIwithCloudRun`; submission form. **Exit:** every item in §16 checked.

Dependency notes: 2 and 3 can overlap (validation is pure-domain while Gemini wiring lands); 4 strictly follows 3; 5's Cloud Tasks switch strictly follows 4.

---

## 11. CI/CD (requirement 3)

GitHub Actions with **Workload Identity Federation** (keyless — no service-account JSON in secrets). Two workflows.

`ci.yml` — every PR: web (`npm ci && npm run lint && tsc --noEmit && vitest run`) and api (`ruff check . && mypy app && pytest`) in parallel; api tests that need Firestore run against the emulator (`firebase emulators:exec`).

`deploy.yml` — every merge to `main`:

```yaml
name: deploy
on: { push: { branches: [main] } }
permissions: { contents: read, id-token: write }   # WIF
env:
  PROJECT: pew-ideathon
  REGION: asia-south1
  REPO: asia-south1-docker.pkg.dev/pew-ideathon/pew
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: deployer@pew-ideathon.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker asia-south1-docker.pkg.dev -q

      - name: Build and push api
        run: |
          docker build -t $REPO/api:${{ github.sha }} api/
          docker push $REPO/api:${{ github.sha }}
      - name: Deploy api
        run: |
          gcloud run deploy pew-api --image $REPO/api:${{ github.sha }} \
            --region $REGION --allow-unauthenticated \
            --memory 1Gi --timeout 900 --concurrency 40 \
            --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
            --set-env-vars FIREBASE_PROJECT_ID=$PROJECT,TASKS_QUEUE=cycle-iterations

      - name: Build and push web
        run: |
          docker build -t $REPO/web:${{ github.sha }} \
            --build-arg NEXT_PUBLIC_API_URL=${{ vars.API_URL }} \
            --build-arg NEXT_PUBLIC_FIREBASE_CONFIG='${{ vars.FIREBASE_WEB_CONFIG }}' web/
          docker push $REPO/web:${{ github.sha }}
      - name: Deploy web
        run: |
          gcloud run deploy pew-web --image $REPO/web:${{ github.sha }} \
            --region $REGION --allow-unauthenticated --memory 512Mi

      - name: Deploy Firestore rules and indexes
        run: |
          npm i -g firebase-tools
          firebase deploy --only firestore:rules,firestore:indexes --project $PROJECT
```

Notes: `NEXT_PUBLIC_FIREBASE_CONFIG` is the public web config (not a secret); the Gemini key is injected only into `pew-api` via `--set-secrets`; the deployer SA holds `run.admin`, `artifactregistry.writer`, `iam.serviceAccountUser` (on the runtime SAs), and `firebaserules.admin` — nothing broader. Cloud Run keeps prior revisions, so rollback is `gcloud run services update-traffic pew-api --to-revisions PREV=100`. Region `asia-south1` (Mumbai) for APAC latency; keep Firestore and Tasks in the same region.

Dockerfiles (reference):

```dockerfile
# api/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

```dockerfile
# web/Dockerfile  (Next.js standalone output)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FIREBASE_CONFIG
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_FIREBASE_CONFIG=$NEXT_PUBLIC_FIREBASE_CONFIG
RUN npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
CMD ["node", "server.js"]
```

---

## 12. Environments and configuration

Local dev: Firebase emulators (Auth + Firestore) via `firebase emulators:start`; `web/.env.local` points at emulators and `http://localhost:8000`; the API uses `FIRESTORE_EMULATOR_HOST` and a real (personal) Gemini key or the `FakeLLMProvider` test double. One shared cloud environment (`pew-ideathon`) serves as production for the competition; a staging project is optional post-submission.

| Variable | Service | Source |
|---|---|---|
| `GEMINI_API_KEY` | api | Secret Manager |
| `FIREBASE_PROJECT_ID`, `TASKS_QUEUE`, `TASKS_LOCATION`, `INTERNAL_INVOKER_SA`, `API_PUBLIC_URL` | api | env vars at deploy |
| `NEXT_PUBLIC_FIREBASE_CONFIG`, `NEXT_PUBLIC_API_URL` | web | build args (public) |

---

## 13. Testing strategy

Domain-first: `domain/` is pure, so cycle transitions (every end reason), blending (human weight applied only to graded cases), validation rules, and estimate arithmetic get exhaustive unit tests with no cloud dependencies — this is where the PRD's acceptance criteria become assertions (e.g. *AC-9.5: budget projection checked before iteration start* is a unit test on `cycle.can_start_iteration`). Adapters get integration tests against the Firestore emulator (immutability: updating a version raises). `FakeLLMProvider` returns deterministic outputs keyed on input hash — the prototype's seeded-RNG trick reused as a test double — so run/cycle services are testable without spending tokens. One Playwright happy path against a preview deploy: sign in → edit → run → apply suggestion → start cycle → target met. CI gate: domain coverage ≥ 90 %, everything green before deploy runs.

## 14. Observability, privacy, security checklist

Structured JSON logs with `runId`/`cycleId`/`uid` correlation; **never** prompt text, case content, outputs, or grader reasoning (PRD privacy rule — enforce with a lint-style log helper that only accepts whitelisted keys). Error Reporting on unhandled exceptions. A daily-spend guard in the API (sum of `costActual` today vs `DAILY_HARD_CAP` env var) refuses **new** runs when exceeded but lets in-flight work complete (AC-10.3 behaviour). Security: rules deny all client writes; `/internal/*` OIDC-only; CORS restricted to the web origin; no secrets in the browser bundle (verify with `next build` output grep); dependencies pinned; `npm audit`/`pip-audit` in CI as non-blocking warnings.

## 15. Risks and mitigations

Gemini rate limits on free-tier keys during demos → keep datasets ≤ 10 cases in seed data, retries with backoff, and a `FakeLLMProvider` flag for rehearsals. Cloud Run cold starts making the demo feel slow → set `min-instances=1` on both services for the judging window only. In-request iteration hitting the 900 s ceiling on big datasets → cap dataset size at 30 in v1 and land the Cloud Tasks switch in Phase 5. Firestore listener costs → listeners are scoped to the open run/cycle only, unsubscribed on tab change (the hooks already do this). Scope creep from the prototype's breadth → §9's phase column is the contract; anything not listed is post-submission.

## 16. Submission package checklist

Deployed URL (`pew-web`) responding with the login page · walkthrough video recorded against the deployed URL (script in `docs/demo-script.md`: sign-in → tree → editor+validation → run streaming → suggestion diff → cycle to `target-met` → cycle ended card) · social post with `#AccelerateAIwithCloudRun` linking the video · public GitHub repo with README (architecture diagram, local setup, deploy instructions) · brief description, template:

> *Prompt Evaluation Workbench is a production-ready web app for validating, grading, and iteratively improving LLM prompts. **Firebase Authentication** (email + Google) signs users in; roles are enforced server-side on every endpoint. **Firestore** stores the entire workspace — projects, immutable prompt versions, private test datasets, runs, and improvement cycles — and doubles as the realtime channel: evaluation results stream into the browser via `onSnapshot` as each test case completes. Two stateless services run on **Cloud Run**: a Next.js frontend and a FastAPI evaluation engine that executes prompts with **Gemini 2.5 Pro**, grades outputs with **Gemini 2.5 Flash** using structured JSON output, and generates evidence-linked improvement suggestions — all inside budget- and iteration-capped cycles whose cost is estimated with the Gemini `count_tokens` API before a single token is spent.*

---

## Appendix A — API endpoint table

| Method + path | Min role | Notes |
|---|---|---|
| `GET /me` | signed-in | bootstraps user doc; first user → administrator |
| `GET/POST /projects`, `PATCH /projects/{id}` | read: viewer · create/cfg: maintainer | cfg locked while a cycle is active in the project |
| `GET/POST /projects/{id}/prompts`, `PATCH …/{pid}` | read: viewer · write: contributor · archive: maintainer | name uniqueness per project |
| `POST …/prompts/{pid}/versions` | contributor | append-only; no PATCH/DELETE exists |
| `GET/POST/PATCH/DELETE …/dataset` | contributor | 409 while owning cycle iteration ≥ 1 |
| `POST …/dataset/generate` | contributor | Gemini `datasetGen` model; cost recorded |
| `GET …/estimate` | viewer | count_tokens + registry rates |
| `POST …/runs` | contributor | 409 if any cycle active |
| `PUT …/runs/{rid}/cases/{cid}/human-grade` | contributor | |
| `POST …/suggestions` / `POST …/suggestions/apply` | contributor | one technique each |
| `POST /cycles` · `POST /cycles/{id}/approve-dataset` · `/confirm-iteration` · `/continue` · `/select-candidate` · `/stop` | contributor | transaction enforces one active cycle |
| `GET/PUT /admin/members/{uid}/role` | administrator | writes auditLogs |
| `GET/PATCH /admin/model-registry` | read: viewer · write: maintainer | |
| `POST /internal/iterations` | Cloud Tasks OIDC only | idempotent |

## Appendix B — Cycle state machine (domain reference)

```python
# app/domain/cycle.py (excerpt)
END = {"target-met", "iteration-cap", "budget-cap", "user-stopped",
       "no-suggestions", "not-converging"}

def can_start_iteration(cycle, est_cost: float) -> tuple[bool, str | None]:
    if cycle.spent + est_cost > cycle.config.budget:
        return False, "budget-cap"          # checked BEFORE any spend (AC-9.5)
    return True, None

def after_score(cycle, composite: float) -> str:
    cycle.scores.append({"n": cycle.current_version, "score": composite})
    if composite >= cycle.config.target:
        return "end:target-met"
    if cycle.iteration >= cycle.config.max_iter:
        return "end:iteration-cap"          # UI then offers new-cycle-from-best (AC-9.4)
    if len(cycle.scores) >= 2 and cycle.scores[-1]["score"] <= cycle.scores[-2]["score"] \
       and not cycle.warned_flat:
        return "end:not-converging" if cycle.config.auto else "warn:flat"  # AC-F.11
    return "suggest"
```

## Appendix C — What ports over from the prototype verbatim

The validation rule catalogue and reasons; the fixer→technique names; blending math (ungraded cases blend code+model only); the estimate-table layout and "budget covers ~X of Y iterations" copy; every stage-banner text; end-reason labels and colours; the role captions on disabled controls; the tree/search/tag interactions. Treat `prompt-eval-workbench.jsx` as the acceptance reference: if the built UI and the prototype disagree on behaviour the PRD doesn't settle, the prototype wins.
