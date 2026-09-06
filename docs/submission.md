# Submission package — Prompt Evaluation Workbench (pew)

Drafted in Phase 6 (Task 10) per `docs/devspec.md` §16. This document collects everything
that can be drafted **before** the deployed URL is confirmed and the walkthrough video is
recorded — those two items, and anything downstream of them (the social post link), are
called out as explicit placeholders below rather than fabricated. Fill them in as part of
Task 12 (live verification) and the actual recording/posting step, then remove this note.

---

## 1. Brief description

Adapted from devspec §16's template. Tightened to name only what Phases 0–6 actually
shipped, and using the **real** deployed Gemini model names — `gemini-2.5-pro` /
`gemini-2.5-flash` (the devspec's original template) return 404 "no longer available to new
users" on this project's AI Studio key; the confirmed-working replacements are
`gemini-3.1-pro-preview` and `gemini-3.6-flash` (see `api/app/domain/models.py`'s comment
and `api/scripts/seed.py`'s `MODEL_REGISTRY`). This is the same paragraph `README.md` carries
(Task 8), reproduced here as the submission-form copy:

> Prompt Evaluation Workbench is a production-ready web app for validating, grading, and
> iteratively improving LLM prompts. **Firebase Authentication** (email + Google) signs users
> in; roles (viewer / contributor / maintainer / administrator) are enforced server-side on
> every endpoint. **Firestore** stores the entire workspace — projects, immutable prompt
> versions, private per-prompt test datasets, runs, and improvement cycles — and doubles as
> the realtime channel: evaluation results stream into the browser via `onSnapshot` as each
> test case completes. Two stateless services run on **Cloud Run**: a Next.js frontend
> (`pew-web`) and a FastAPI evaluation engine (`pew-api`) that executes prompts with
> **Gemini 3.1 Pro Preview**, grades outputs and drafts evidence-linked improvement
> suggestions with **Gemini 3.6 Flash** using structured JSON output — all inside budget- and
> iteration-capped improvement cycles whose cost is estimated with the Gemini `count_tokens`
> API before a single token is spent, and whose state persists in Firestore so a cycle
> survives a page refresh, a client disconnect, or an instance restart. Built for the Google
> Gen AI Academy APAC Cohort 3 ideathon.

Nothing here claims a cut feature (devspec §1.2 / §5.2): no multi-organisation, no invitation
flow, no BYO API keys, no multi-provider support, no scheduled re-scoring, no delete
anywhere, and only one active improvement cycle at a time — all deliberate v1 non-goals, not
mentioned above.

---

## 2. Social post text

Tweet-length, ends with the required hashtag, links the (placeholder) video and the
(placeholder) deployed URL:

> Built Prompt Evaluation Workbench for the Google Gen AI Academy APAC Cohort 3 ideathon —
> sign in, get live static validation on a prompt, run it against Gemini 3.1 Pro (graded by
> Gemini 3.6 Flash) with results streaming from Firestore in real time, then drive a
> budget-capped improvement cycle to a target score. Two Cloud Run services, zero servers to
> babysit.
> Watch: [PLACEHOLDER — video URL after recording]
> Try it: [PLACEHOLDER — pew-web deployed URL]
> #AccelerateAIwithCloudRun

---

## 3. Mandatory-rule checklist (devspec §1.3)

| Rule | Status / evidence |
|---|---|
| Deployed on **Cloud Run** | Two services, `pew-web` (Next.js) and `pew-api` (FastAPI), auto-deploy on every merge to `main` via `.github/workflows/deploy.yml` (in place since Phase 0). Live service URLs: `[PLACEHOLDER — fill in after deployment/recording]` |
| **Firebase Authentication** | Email/password + Google sign-in implemented client-side (`web/features/auth/LoginCard.tsx`); every API request verifies the Firebase ID token server-side (`api/app/deps.py::current_user`), and roles are read fresh from Firestore per request, never from token claims. Screenshot: `[PLACEHOLDER — fill in after deployment/recording]` |
| **Firestore** | System of record for the entire workspace (projects, immutable versions, datasets, runs, cycles, `auditLogs` — devspec §7) and the realtime transport for streaming run/cycle updates via `onSnapshot` (`web/features/runs/useRunStream.ts`, `web/features/cycle/useCycle.ts`). Security rules (`firestore.rules`) deny all client writes — only the API's service account writes. |
| **Gemini API (AI Studio)** | `pew-api`'s `GeminiProvider` (`api/app/adapters/gemini.py`) calls the AI Studio API with a Secret-Manager-held key (`gemini-api-key`, never in the repo/env files/browser). Real deployed model names — not the devspec template's stale `gemini-2.5-pro`/`gemini-2.5-flash`, which 404 on this key — execution: `gemini-3.1-pro-preview`; grading, suggestions, dataset generation: `gemini-3.6-flash` (`api/app/domain/models.py`, `api/scripts/seed.py`). |
| Public deployment URL | `pew-web` Cloud Run service URL. `[PLACEHOLDER — fill in after deployment/recording]` |
| Public repo | `https://github.com/Tamil-vcoders/pew` — MIT licence (`LICENSE`), README with architecture diagram, local setup, and deploy instructions (`README.md`). |
| Social post | Posted with `#AccelerateAIwithCloudRun`, linking the walkthrough video. Post link: `[PLACEHOLDER — add link after recording/posting]`. Video itself: script ready (`docs/demo-script.md`, Task 9), not yet recorded — `[PLACEHOLDER — add video URL after recording]`. |
| Brief description | See "1. Brief description" above. |

---

## Notes for whoever fills in the placeholders

- Deployed URLs: read off the Cloud Run console or `gcloud run services describe pew-web
  --region asia-south1 --format='value(status.url)'` (and `pew-api` likewise) once Phase 6
  has been deployed to `pew-ideathon`.
- Video: record per `docs/demo-script.md`'s beat-by-beat script against the deployed URL
  (the "real take" variant, using real Gemini calls — see that doc's intro for the
  rehearsal-vs-real-take distinction).
- Social post: post after the video is uploaded, linking it, then paste the post URL back
  into the table above.
