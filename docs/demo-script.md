# Demo script — submission video

A literally-followable, one-take walkthrough of the app. Every quoted button/tab/label
below is verified against the actual rendered source (see "Source of truth" under each
beat) — **not** guessed. If a live run of this script ever shows different text, the
source file has changed since this doc was written and this doc is wrong, not the app.

Two recording variants are called out explicitly wherever they diverge, per the Phase 6
task brief:

- **Rehearsal** — local stack with `USE_FAKE_LLM=true` (same setup `web/e2e/happy-path.spec.ts`
  requires: Firestore + Auth emulators running, `pew-api` running with `USE_FAKE_LLM=true
  FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
  FIREBASE_PROJECT_ID=demo-pew-test`, the seed script run once against that project id, and
  `npm run dev` (web) with `NEXT_PUBLIC_USE_EMULATOR=true`). `FakeLLMProvider`'s scores are a
  deterministic hash, not a real quality signal — this variant exists to guarantee a one-take
  win on camera, not to demonstrate real model quality.
- **Real take** — the actual submission recording, against real Gemini
  (`gemini-3.1-pro-preview` execution / `gemini-3.6-flash` grading — see
  `api/scripts/seed.py`'s `MODEL_REGISTRY` comment: the devspec's originally-pinned
  `gemini-2.5-pro`/`flash` 404 on the current key, these are the confirmed-working
  replacements).

Seeded accounts (`api/scripts/seed.py`, `DEMO_ACCOUNTS` / `DEMO_PASSWORD`), all with password
**`correct horse battery staple`**:

| Name | Email | Role |
|---|---|---|
| Asha Rao | `asha@acme.dev` | administrator |
| Vikram Iyer | `vikram@acme.dev` | maintainer |
| Meera Krishnan | `meera@acme.dev` | contributor |
| Dev Patel | `dev@acme.dev` | viewer |

---

## Beat 1 — Sign in

**Source of truth:** `web/e2e/happy-path.spec.ts` lines 18-21; `web/features/auth/LoginCard.tsx`.

1. Go to `/login`.
2. Fill the **Email** field with `asha@acme.dev`.
3. Fill the **Password** field with `correct horse battery staple`.
4. Click **Sign in**.

**Expect:** redirect to `/`; the workspace tree loads showing the two seeded projects,
**"Support automation"** and **"Marketing copy"** (`api/scripts/seed.py`'s two
`_upsert_project` calls).

---

## Beat 2 — Tree

**Source of truth:** `web/features/workspace/ProjectTree.tsx`.

1. In the left tree, find the **"Support automation"** project row (project names render
   as an editable, uppercase heading for admins/maintainers).
2. Under it, point out the prompt rows: **"Ticket triage"** (tags `triage`, `prod`) and
   **"Reply drafter"** (tags `replies`, `experiment`) — from `_upsert_prompt`'s tag lists in
   `seed.py`.
3. Point out the search box — placeholder **`name or tag…`**, `aria-label` "Search prompts
   by name or tag" — type `triage` to show it filtering the list down to "Ticket triage" by
   tag, then clear it.

> **Discrepancy note (brief vs. verified UI):** the task brief describes this beat as also
> showing a "best-score badge" and a "cycle-pulse dot if a cycle is active elsewhere" on
> each prompt row. Those exist in `docs/prototype.jsx` (the pre-port prototype, lines
> ~1205-1225 — `pew-pulse` dot, `bestScoreOf()`) but were **not carried into the shipped
> `ProjectTree.tsx`** — there is no per-row score badge or pulse indicator in the current
> tree UI (confirmed by reading the full component: only project name, a "+" new-prompt
> button, and prompt rows with up to 3 tag chips). Do not gesture at or describe either of
> those in the recording — say only what beat 2 above lists. (The "cycle active elsewhere"
> concept IS implemented, but as a banner+link inside the prompt page — see the
> `elsewhereLabel` block in `web/app/(workspace)/p/[promptId]/page.tsx` — not as a tree dot.)

---

## Beat 3 — Editor + validation

**Source of truth:** `web/e2e/happy-path.spec.ts` line 24-27; `api/app/domain/validation.py`;
`web/features/validation/rules.ts` (verified byte-identical rule catalogue); `api/scripts/seed.py`'s
`TRIAGE_PROMPT`.

1. Click the **"Ticket triage"** link to open it.
2. Point out the **Prompt** editor (the draft textarea) showing the seeded triage prompt
   text (mentions "Try to be helpful and use your best judgement", raw `{{ticket_text}}` /
   `{{urgency_levels}}` template vars, no format instruction, no example).
3. Point out the **"Static validation"** panel below it, and name each of the 4 catalogue
   rules — all fail on this draft:
   - **"Clear and direct"** — fails: `Hedging language ("try to") leaves the task
     underspecified.` (matches `page.getByText(/Hedging language/i)` in the e2e spec)
   - **"Be specific"** — fails: `No explicit output format — the model is left to choose.`
   - **"XML structure"** — fails: `2 of 2 variable(s) not wrapped in a tag.` (both
     `{{ticket_text}}` and `{{urgency_levels}}` are bare, not `<tag>{{var}}</tag>`)
   - **"Provide examples"** — fails: `No worked example — tone and format are left to
     inference.`

---

## Beat 4 — Run streaming

**Source of truth:** `web/e2e/happy-path.spec.ts` lines 29-34; `web/features/runs/RunTab.tsx`;
`web/features/runs/EstimateTable.tsx`.

1. Click the **"Run"** tab.
2. Click **"Run once"**.
3. Point out the pre-run estimate panel, titled **"Single run — projected cost"**, with the
   estimate table's columns: `stage`, `model`, `tokens in`, `tokens out`, `est. $`, and a
   totals row `Per run (3 cases)` (the seeded `TRIAGE_DATASET` has 3 cases).
4. Click **"Confirm & run"**.
5. Point out the live stats row appearing (`composite`, `code grader`, `model grader`,
   `manual grades`, `cost`, `cases`) and the note "≤3 concurrent model calls · streaming as
   cases complete" while running.
6. Wait until `cases` reads **3 / 3** and the `composite` score badge has a value.

---

## Beat 5 — Suggestion diff

**Source of truth:** `web/e2e/happy-path.spec.ts` lines 36-38; `web/features/suggestions/SuggestionCard.tsx`.

1. Click the **"Suggestions"** tab.
2. Wait for suggestion cards to populate (each shows a technique name, an "Evidence: …"
   line, and a diff block).
3. Pick one candidate, point out the diff block (old text struck through / new text
   highlighted, via `DiffBlock`).
4. Click **"Apply as new version"** (use `.first()` if more than one card is present, as the
   e2e spec does) — this creates a new prompt version from that suggestion.

---

## Beat 6 — Cycle to target-met

**Source of truth:** `web/e2e/happy-path.spec.ts` lines 40-57; `web/features/setup/SetupTab.tsx`;
`web/features/cycle/CycleBanner.tsx`; `web/features/cycle/CycleEndedCard.tsx` +
`web/features/cycle/endReasons.ts`; `api/scripts/seed.py`'s `DEFAULT_CFG`.

1. Click the **"Setup"** tab.
2. Set the cycle config fields (exact field labels): **"Target score"**, **"Max
   iterations"**, **"Budget cap ($)"**. State both variants explicitly on camera:
   - **Rehearsal (FakeLLMProvider, guaranteed one-take win):** on **"Ticket triage"**, set
     Target score `0.4`, Max iterations `2` (exactly what `happy-path.spec.ts` does —
     `FakeLLMProvider`'s deterministic composite floor guarantees this converges on the
     first iteration).
   - **Real take (against real Gemini):** on **"Reply drafter"**, use the seeded
     `DEFAULT_CFG` defaults as-is — Target score `8`, Max iterations `4`, Budget cap
     `0.5` — expected to converge within 2-3 iterations (this expectation is stated in
     `seed.py`'s comment above `REPLY_PROMPT`; it is **not** asserted by any automated test,
     since `FakeLLMProvider` can't stand in for real quality — it's verified live in Task 12).
3. Click **`Start cycle on "Ticket triage"`** (or `"Reply drafter"` for the real take — button
   text is `Start cycle on "<promptName>"`).
4. Click the **"Dataset"** tab. A banner titled **"Paused: review the dataset"** appears.
   Click **"Approve dataset & continue"**.
5. Click the **"Run"** tab. A banner titled **"Iteration 1 — projected cost before it
   starts"** appears with the estimate table and remaining-budget line. Click **"Confirm &
   run iteration"**.
6. Wait for the run to finish, then for the grading-pause banner titled **"Paused: review
   grades"**. Click **"Continue to checks"**.
7. Click the **"Setup"** tab. The cycle-ended card appears, titled `Cycle ended — Ticket
   triage` (or the active prompt's name), with reason label **"Target met"**
   (`END_REASONS["target-met"].label`, `web/features/cycle/endReasons.ts`).

> **Discrepancy note (brief vs. verified e2e spec):** the brief's beat 6 also lists a
> "suggestion selection" stage banner as something to walk through on the way to
> target-met. The verified `happy-path.spec.ts` flow (rehearsal variant) does **not** hit
> that banner — after "Continue to checks" the cycle's checking stage finds the target
> already met and ends the cycle directly, skipping the suggesting stage entirely. Favor
> the verified spec here: for the rehearsal take, do **not** promise a suggestion-selection
> banner between "Continue to checks" and the ended card. For the real take (2-3 iterations
> expected), a suggestion-selection banner most likely WILL appear between iterations that
> don't yet meet target — titled `Paused: N candidate(s) — select one to continue`, pick a
> candidate card and click **"Apply selected & continue"** (or **"Continue with my edits"**
> to keep manual edits instead) before the next iteration's projected-cost banner. Call
> this out live as "if a candidate-selection screen appears here, pick one and continue" so
> the script survives either outcome without being a defect either way.

---

## Beat 7 — Budget-cap ending (second beat)

**Source of truth:** `api/tests/integration/test_cycles.py::test_budget_cap_ends_the_cycle_before_starting_the_iteration_and_creates_no_run`;
`web/features/cycle/CycleBanner.tsx`; `web/features/cycle/endReasons.ts`.

Only one cycle may be active at a time, so this starts a **second, separate** cycle on the
*other* seeded prompt from beat 6 — **"Reply drafter"** if beat 6 rehearsed on "Ticket
triage", or **"Ticket triage"** if beat 6's real take used "Reply drafter".

1. Open that other prompt, click the **"Setup"** tab.
2. Set **"Budget cap ($)"** to an artificially tiny value: `0.001` (the brief's suggested
   value; the integration test above uses an even smaller `0.0001` — either works, since
   registry rates are $/1M tokens and a single-case iteration costs cents, far above either
   value). Leave Target score / Max iterations at their seeded defaults — the cap is what
   forces the ending, not the target.
3. Click `Start cycle on "<promptName>"`.
4. Click the **"Dataset"** tab, click **"Approve dataset & continue"**.
5. Click the **"Run"** tab. The **"Iteration 1 — projected cost before it starts"** banner
   appears with its estimate table.
6. Click **"Confirm & run iteration"**. Per the integration test's exact pattern, this call
   itself detects the projected cost exceeds the remaining budget and ends the cycle
   immediately — no iteration/run is ever created (`iteration` stays `0`).
7. Click the **"Setup"** tab. The cycle-ended card shows reason label **"Budget cap — next
   iteration not started"** (`END_REASONS["budget-cap"].label`).

---

## Cross-check summary

Every quoted button/tab name above was checked against `web/e2e/happy-path.spec.ts`'s actual
Playwright selectors (`getByRole("button", { name: ... })`, `getByLabel(...)`) where that
flow covers it (beats 1, 3-6), and against the underlying component source directly for
beats/elements the spec doesn't touch (tree beat 2, model-registry/pricing detail in beat 6,
all of beat 7's budget-cap-specific banners) — `SetupTab.tsx`, `CycleBanner.tsx`,
`CycleEndedCard.tsx`, `endReasons.ts`, `SuggestionsPanel.tsx`/`SuggestionCard.tsx`,
`RunTab.tsx`/`EstimateTable.tsx`, `ProjectTree.tsx`, `LoginCard.tsx`,
`app/(workspace)/p/[promptId]/page.tsx`.
