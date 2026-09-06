# api/app/ports/tasks.py
from __future__ import annotations

from typing import Protocol


class TaskQueue(Protocol):
    """Enqueues execution of one cycle iteration. Both adapters (InlineTaskQueue for local
    dev/tests, CloudTasksQueue for deployed Cloud Run) fulfil this with the same contract:
    the iteration eventually runs through app.services.cycles.run_iteration_task, which is
    idempotent — see devspec §8's redelivery contract."""

    async def enqueue_iteration(self, *, cycle_id: str, iteration: int) -> None: ...
