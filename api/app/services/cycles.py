"""Cycle orchestration — one function per app/routes/cycles.py action. State transitions
happen only in app/domain/cycle.py; this module re-hydrates from the cycle doc on every
call (no in-memory cycle state anywhere), calls domain/cycle.py for the decision, and drives
the existing Phase 3 run/suggestion services through app.adapters.inline_tasks (no Cloud
Tasks — that's Phase 5). See docs/devspec.md §10 and Appendix B.
"""
from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import cast

from fastapi import BackgroundTasks

from app.adapters import inline_tasks
from app.domain import cycle as cyc
from app.domain.estimate import TOK, build_estimate, call_cost, cycle_estimate_rows
from app.domain.models import (
    Case,
    Cycle,
    CycleConfigSnapshot,
    CycleEndReason,
    CycleLogEntry,
    ModelRates,
    Project,
    Prompt,
)
from app.domain.rendering import render
from app.domain.suggestions import build_suggestions
from app.ports.llm import LLMProvider
from app.ports.repos import (
    CycleRepo,
    DatasetRepo,
    ModelRegistryRepo,
    PromptRepo,
    RunRepo,
    VersionRepo,
)
from app.services.runs import execute_run
from app.services.suggestions import draft_suggestions

_AUTO_DELAY_S = 0.7
_AUTO_SUGGEST_DELAY_S = 0.9


@dataclass
class CycleDeps:
    """Bundles the repos/ports every cycle action needs — avoids re-threading the same
    seven parameters through a dozen functions, several of which call each other."""

    cycles: CycleRepo
    prompts: PromptRepo
    versions: VersionRepo
    dataset: DatasetRepo
    runs: RunRepo
    registry: ModelRegistryRepo
    llm: LLMProvider
    background_tasks: BackgroundTasks


def _with_log(cycle: Cycle, messages: Sequence[str]) -> Cycle:
    if not messages:
        return cycle
    now = datetime.now(UTC)
    return replace(cycle, log=[*cycle.log, *(CycleLogEntry(ts=now, message=m) for m in messages)])


async def _save_and_log(deps: CycleDeps, cycle: Cycle, messages: Sequence[str]) -> Cycle:
    """CycleRepo.save appends `messages` to the Firestore doc's log via ArrayUnion, but the
    `cycle` object passed in is unaware of that append (domain functions never touch `log`
    themselves). Mirror the same append onto the returned object so callers — including the
    HTTP response this ultimately serializes into — see exactly what was just persisted,
    rather than a snapshot that's stale by exactly the messages just written."""
    await deps.cycles.save(cycle, new_log_messages=messages)
    return _with_log(cycle, messages)


async def _load_active(cycles: CycleRepo, cycle_id: str) -> Cycle:
    cycle = await cycles.get(cycle_id)
    if cycle is None:
        raise LookupError("Cycle not found")
    if cycle.status != "active":
        raise ValueError("Cycle is not active")
    return cycle


def _config_snapshot(project: Project) -> CycleConfigSnapshot:
    cfg = project.cfg
    return CycleConfigSnapshot(
        target=cfg.target, max_iter=cfg.max_iter, budget=cfg.budget, n_sug=cfg.n_sug,
        auto=cfg.auto, weights=cfg.weights, models=cfg.models,
    )


async def start_cycle(*, project: Project, prompt: Prompt, user_uid: str, user_name: str, deps: CycleDeps) -> Cycle:
    config = _config_snapshot(project)
    fresh = cyc.start(cycle_id="", prompt_id=prompt.id, project_id=project.id, config=config, started_by=user_uid)
    created = await deps.cycles.create(fresh)  # raises ValueError -> 409 (one active cycle)
    created = await _save_and_log(
        deps, created,
        [(f'Cycle started on "{prompt.name}" by {user_name} — target {config.target:.1f}, '
         f'max {config.max_iter} iterations, budget ${config.budget:.2f}, '
         f'{"auto" if config.auto else "attended"} mode.')],
    )
    if config.auto:
        inline_tasks.schedule(deps.background_tasks, _auto_approve_after_delay, cycle_id=created.id, deps=deps)
    return created


async def approve_dataset_action(cycle_id: str, *, deps: CycleDeps) -> Cycle:
    cycle = await _load_active(deps.cycles, cycle_id)
    approved = cyc.approve_dataset(cycle)  # raises ValueError -> 409 on wrong stage
    n_cases = len(await deps.dataset.list_by_prompt(cycle.project_id, cycle.prompt_id))
    approved = await _save_and_log(
        deps, approved, [f"Dataset approved — {n_cases} cases, frozen for this cycle."]
    )
    if approved.config.auto:
        inline_tasks.schedule(deps.background_tasks, _auto_confirm_after_delay, cycle_id=cycle_id, deps=deps)
    return approved


async def confirm_iteration(cycle_id: str, *, text: str, actor_uid: str, deps: CycleDeps) -> Cycle:
    cycle = await _load_active(deps.cycles, cycle_id)
    prompt = await deps.prompts.get(cycle.project_id, cycle.prompt_id)
    if prompt is None:
        raise LookupError("Prompt not found")

    cases = await deps.dataset.list_by_prompt(cycle.project_id, cycle.prompt_id)
    rates = await deps.registry.get_all()
    exec_tokens_in = 0
    for case in cases:
        exec_tokens_in += await deps.llm.count_tokens(render(text, case.input), cycle.config.models["execution"])
    rows = cycle_estimate_rows(cycle.config.models, len(cases), cycle.config.n_sug, exec_tokens_in=exec_tokens_in)
    estimate = build_estimate(rows, rates)

    ok, reason = cyc.can_start_iteration(cycle, estimate.total_cost)
    if not ok:
        assert reason is not None  # can_start_iteration always names a reason when ok is False
        ended = cyc.end(cycle, reason)
        ended = await _save_and_log(
            deps, ended,
            [(f"Projected next iteration (${estimate.total_cost:.4f}) exceeds remaining budget "
             f"(${cycle.config.budget - cycle.spent:.4f}) — not started."),
             f"Cycle ended — {reason}. ${ended.spent:.4f} spent, all iterations retained."],
        )
        return ended

    version_n = await _create_or_reuse_version(deps, cycle, prompt, text, actor_uid)
    run_id = await deps.runs.create_run(cycle.project_id, cycle.prompt_id, version_n=version_n, started_by=actor_uid)
    started = cyc.begin_iteration(cycle, run_id=run_id)
    started = await _save_and_log(deps, started, [f"Iteration {started.iteration}: running evaluation…"])

    inline_tasks.schedule(
        deps.background_tasks, _run_iteration_and_advance,
        cycle_id=cycle_id, project_id=cycle.project_id, prompt_id=cycle.prompt_id,
        run_id=run_id, version_n=version_n, prompt_text=text, cases=cases, deps=deps,
    )
    return started


async def _create_or_reuse_version(deps: CycleDeps, cycle: Cycle, prompt: Prompt, text: str, actor_uid: str) -> int:
    """Same reuse rule as routes/runs.py::start_run: don't append a no-op version when the
    submitted text is identical to the prompt's current version."""
    current = (
        await deps.versions.get(cycle.project_id, cycle.prompt_id, prompt.latest_version)
        if prompt.latest_version
        else None
    )
    if current is not None and text == current.text:
        return prompt.latest_version
    created = await deps.versions.create(
        cycle.project_id, cycle.prompt_id, text=text, note="Manual edit", technique=None, created_by=actor_uid,
    )
    return created.n


async def _run_iteration_and_advance(
    *,
    cycle_id: str,
    project_id: str,
    prompt_id: str,
    run_id: str,
    version_n: int,
    prompt_text: str,
    cases: list[Case],
    deps: CycleDeps,
) -> None:
    rates = await deps.registry.get_all()
    cycle = await deps.cycles.get(cycle_id)
    if cycle is None or cycle.status != "active":
        return  # stopped before the run even started running
    stats, cost_actual = await execute_run(
        project_id=project_id, prompt_id=prompt_id, run_id=run_id, prompt_text=prompt_text,
        cases=cases, models=cycle.config.models, weights=cycle.config.weights, rates=rates,
        llm=deps.llm, runs=deps.runs,
    )
    cycle = await deps.cycles.get(cycle_id)  # reload — may have been stopped mid-run
    if cycle is None or cycle.status != "active":
        return
    advanced = cyc.mark_running_complete(cycle, cost_actual=cost_actual, version_n=version_n)
    msg = f"v{version_n} run complete (cost ${cost_actual:.4f})."
    if advanced.config.auto:
        advanced = await _save_and_log(deps, advanced, [msg])
        # A run with every case errored has no composite (RunStats.composite is None) — treat
        # it as the worst possible score rather than crashing the cycle; infra failure should
        # end the cycle via the normal scoring logic, not get stuck with no way to continue.
        composite = stats.composite if stats.composite is not None else 0.0
        await _advance_after_score(advanced, composite, deps=deps)
    else:
        await _save_and_log(
            deps, advanced, [msg, "Paused: add manual grades if you want, then continue."]
        )


async def continue_cycle(cycle_id: str, *, deps: CycleDeps) -> Cycle:
    cycle = await _load_active(deps.cycles, cycle_id)

    if cycle.stage == "grading":
        if cycle.current_version_n is None or cycle.current_run_id is None:
            raise ValueError("No scored run to continue from")
        run = await deps.runs.get(cycle.project_id, cycle.prompt_id, cycle.current_run_id)
        if run is None or run.composite is None:
            raise ValueError("Run is not finalized yet")
        return await _advance_after_score(cycle, run.composite, deps=deps)

    if cycle.stage == "checking" and cycle.warned_flat:
        if cycle.current_version_n is None:
            raise ValueError("No current version to continue from")
        version = await deps.versions.get(cycle.project_id, cycle.prompt_id, cycle.current_version_n)
        if version is None:
            raise LookupError("Current version not found")
        return await _propose_suggestions_step(cycle, text=version.text, deps=deps)

    raise ValueError(f"Cannot continue from stage {cycle.stage!r}")


async def _advance_after_score(cycle: Cycle, composite: float, *, deps: CycleDeps) -> Cycle:
    scored, decision = cyc.after_score(cycle, composite)
    msg = f"v{scored.current_version_n} composite {composite:.2f}."

    if decision.startswith("end:"):
        reason = cast(CycleEndReason, decision.removeprefix("end:"))
        ended = cyc.end(scored, reason)
        return await _save_and_log(
            deps, ended,
            [msg, f"Cycle ended — {reason}. ${ended.spent:.4f} spent, all iterations retained."],
        )

    if decision == "warn:flat":
        return await _save_and_log(
            deps, scored, [msg, "Score did not improve — cycle may not be converging."]
        )

    # decision == "suggest"
    scored = await _save_and_log(deps, scored, [msg])
    assert scored.current_version_n is not None
    version = await deps.versions.get(scored.project_id, scored.prompt_id, scored.current_version_n)
    text = version.text if version is not None else ""
    return await _propose_suggestions_step(scored, text=text, deps=deps)


async def _propose_suggestions_step(cycle: Cycle, *, text: str, deps: CycleDeps) -> Cycle:
    failing = build_suggestions(text)
    # Slice BEFORE drafting: only the candidates that will actually be shown are worth a
    # Gemini call — matches the prototype's failing.slice(0, nSug) exactly.
    picked = failing[: cycle.config.n_sug]
    model = cycle.config.models["suggestions"]
    drafted = await draft_suggestions(picked, model, deps.llm)

    rates = await deps.registry.get_all()
    rate: ModelRates = rates[model]
    cost = len(picked) * call_cost(rate.rate_in_per_1m, rate.rate_out_per_1m, TOK["suggest"]["in"], TOK["suggest"]["out"])

    proposed, decision = cyc.propose_suggestions(cycle, candidates=drafted, cost=cost)
    if decision == "end:no-suggestions":
        ended = cyc.end(proposed, "no-suggestions")
        return await _save_and_log(
            deps, ended,
            ["Every catalogue rule passes — no suggestion to generate.",
             f"Cycle ended — no-suggestions. ${ended.spent:.4f} spent, all iterations retained."],
        )

    proposed = await _save_and_log(deps, proposed, [f"{len(picked)} suggestion(s) generated (${cost:.4f})."])
    if proposed.config.auto:
        inline_tasks.schedule(deps.background_tasks, _auto_apply_top_after_delay, cycle_id=proposed.id, deps=deps)
    return proposed


async def select_candidate(
    cycle_id: str, *, index: int, override_text: str | None, actor_uid: str, deps: CycleDeps
) -> Cycle:
    cycle = await _load_active(deps.cycles, cycle_id)
    if cycle.pending is None:
        raise ValueError("No pending suggestions to select from")
    if not (0 <= index < len(cycle.pending.candidates)):
        raise ValueError(f"Candidate index {index} out of range")
    candidate = cycle.pending.candidates[index]
    text = override_text if override_text is not None else candidate.new_text

    created = await deps.versions.create(
        cycle.project_id, cycle.prompt_id, text=text,
        note=f"Applied: {candidate.technique}", technique=candidate.technique, created_by=actor_uid,
    )
    applied = cyc.apply_candidate(cycle, index=index, version_n=created.n)
    applied = await _save_and_log(deps, applied, [f'v{created.n} created from "{candidate.technique}".'])
    if applied.config.auto:
        inline_tasks.schedule(deps.background_tasks, _auto_confirm_after_delay, cycle_id=cycle_id, deps=deps)
    return applied


async def stop_cycle_action(cycle_id: str, *, deps: CycleDeps) -> Cycle:
    cycle = await deps.cycles.get(cycle_id)
    if cycle is None:
        raise LookupError("Cycle not found")
    stopped = cyc.stop(cycle)
    if stopped is not cycle and cycle.status == "active":
        stopped = await _save_and_log(
            deps, stopped, [f"Cycle ended — user-stopped. ${stopped.spent:.4f} spent, all iterations retained."]
        )
    return stopped


# ---------- auto-mode pacing ----------
# Each leg re-loads the cycle and re-checks it is still active and at the expected stage
# before acting — a Stop (or a process restart, per the accepted Phase-4 limitation
# documented in the implementation plan) may have intervened during the sleep.


async def _auto_approve_after_delay(*, cycle_id: str, deps: CycleDeps) -> None:
    await asyncio.sleep(_AUTO_DELAY_S)
    cycle = await deps.cycles.get(cycle_id)
    if cycle is None or cycle.status != "active" or cycle.stage != "dataset":
        return
    await approve_dataset_action(cycle_id, deps=deps)


async def _auto_confirm_after_delay(*, cycle_id: str, deps: CycleDeps) -> None:
    await asyncio.sleep(_AUTO_DELAY_S)
    cycle = await deps.cycles.get(cycle_id)
    if cycle is None or cycle.status != "active" or cycle.stage != "preview":
        return
    prompt = await deps.prompts.get(cycle.project_id, cycle.prompt_id)
    if prompt is None:
        return
    version = await deps.versions.get(cycle.project_id, cycle.prompt_id, prompt.latest_version)
    text = version.text if version is not None else ""
    await confirm_iteration(cycle_id, text=text, actor_uid=cycle.started_by, deps=deps)


async def _auto_apply_top_after_delay(*, cycle_id: str, deps: CycleDeps) -> None:
    await asyncio.sleep(_AUTO_SUGGEST_DELAY_S)
    cycle = await deps.cycles.get(cycle_id)
    if cycle is None or cycle.status != "active" or cycle.stage != "suggesting" or cycle.pending is None:
        return
    await select_candidate(
        cycle_id, index=cycle.pending.selected, override_text=None, actor_uid=cycle.started_by, deps=deps
    )
