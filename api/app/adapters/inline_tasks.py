"""Dev/Phase-3 task execution: schedules work on FastAPI's own BackgroundTasks so it runs
in-process, after the triggering response is sent — no external queue. Phase 5's
`cloud_tasks.py` swaps in behind the same `schedule()` call site in app/routes/runs.py.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import BackgroundTasks


def schedule[**P](
    background_tasks: BackgroundTasks, fn: Callable[P, Awaitable[object]], *args: P.args, **kwargs: P.kwargs
) -> None:
    """Fire-and-forget: whatever `fn` returns is discarded (BackgroundTasks has no result
    channel back to the request), so `fn`'s return type is unconstrained beyond Awaitable."""
    background_tasks.add_task(fn, *args, **kwargs)
