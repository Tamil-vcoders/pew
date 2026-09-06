"""Dev/Phase-3 task execution: schedules work on FastAPI's own BackgroundTasks so it runs
in-process, after the triggering response is sent — no external queue. Phase 5's
`cloud_tasks.py` swaps in behind the same `schedule()` call site in app/routes/runs.py.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import BackgroundTasks


def schedule[**P](
    background_tasks: BackgroundTasks, fn: Callable[P, Awaitable[None]], *args: P.args, **kwargs: P.kwargs
) -> None:
    background_tasks.add_task(fn, *args, **kwargs)
