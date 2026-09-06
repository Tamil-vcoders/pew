"""Dev/Phase-3 task execution: schedules work on FastAPI's own BackgroundTasks so it runs
in-process, after the triggering response is sent — no external queue. `InlineTaskQueue`
below is the default `TaskQueue` (app/ports/tasks.py) adapter for local dev/tests;
`adapters/cloud_tasks.py` implements the same port for deployed Cloud Run.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import BackgroundTasks

if TYPE_CHECKING:
    # Only needed for the type hint below — a real top-level import would cycle, since
    # app.services.cycles itself imports this module for the auto-mode pacing helpers.
    from app.services.cycles import CycleDeps


def schedule[**P](
    background_tasks: BackgroundTasks, fn: Callable[P, Awaitable[object]], *args: P.args, **kwargs: P.kwargs
) -> None:
    """Fire-and-forget: whatever `fn` returns is discarded (BackgroundTasks has no result
    channel back to the request), so `fn`'s return type is unconstrained beyond Awaitable."""
    background_tasks.add_task(fn, *args, **kwargs)


@dataclass
class InlineTaskQueue:
    """Zero behavior change from Phase 3/4: `enqueue_iteration` just schedules
    `run_iteration_task` on the same BackgroundTasks the request already carries — exactly
    what `confirm_iteration` did directly before this port existed. Needs a reference to the
    very `CycleDeps` it belongs to (not just its own repos) so the auto-chain
    `run_iteration_task` re-enters (_advance_after_score -> _propose_suggestions_step -> …)
    has working repos/background_tasks; see deps.py::build_task_queue's two-step
    construction note for why that isn't circular."""

    background_tasks: BackgroundTasks
    deps: CycleDeps

    async def enqueue_iteration(self, *, cycle_id: str, iteration: int) -> None:
        # Local import: avoids the same module cycle the TYPE_CHECKING guard above avoids.
        from app.services.cycles import run_iteration_task

        schedule(self.background_tasks, run_iteration_task, cycle_id=cycle_id, iteration=iteration, deps=self.deps)
