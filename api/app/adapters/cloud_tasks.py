# api/app/adapters/cloud_tasks.py
"""Cloud Tasks implementation of the TaskQueue port (app/ports/tasks.py) — devspec §8's
Phase 5+ adapter. Named tasks give at-most-once dedup per (cycle, iteration) for free, so a
retried/duplicate enqueue is not an error. `CloudTasksClient.create_task` is a blocking gRPC
call; it is pushed onto a thread so `enqueue_iteration` stays a real `async def`, satisfying
the same TaskQueue protocol as InlineTaskQueue without blocking the event loop.
"""
from __future__ import annotations

import asyncio
import json

from google.api_core.exceptions import AlreadyExists
from google.cloud import tasks_v2


class CloudTasksQueue:
    def __init__(self, *, project: str, location: str, queue: str, api_url: str, invoker_sa: str) -> None:
        self._client = tasks_v2.CloudTasksClient()
        self._parent = self._client.queue_path(project, location, queue)
        self._api_url = api_url
        self._invoker_sa = invoker_sa

    async def enqueue_iteration(self, *, cycle_id: str, iteration: int) -> None:
        task = {
            "name": f"{self._parent}/tasks/{cycle_id}-{iteration}",  # dedup: at-most-once per iteration
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"{self._api_url}/internal/iterations",
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"cycleId": cycle_id, "iteration": iteration}).encode(),
                "oidc_token": {"service_account_email": self._invoker_sa},
            },
        }
        try:
            await asyncio.to_thread(
                self._client.create_task, request={"parent": self._parent, "task": task}
            )
        except AlreadyExists:
            pass  # a redelivered/duplicate enqueue for the same (cycle, iteration) — not an error
