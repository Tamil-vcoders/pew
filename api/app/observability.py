# api/app/observability.py
"""Structured logging — devspec §14's privacy rule enforced at the call site: only
whitelisted keys ever reach a log line. Prompt text, dataset/case content, model output,
and grader reasoning must never pass through log_event, even accidentally — passing an
unlisted key raises immediately instead of silently logging it. This is the ONLY module
`api/app` code may import `logging` from directly (enforced by ruff's TID251 rule, see
pyproject.toml) — everything else must call `log_event`.
"""
from __future__ import annotations

import json
import logging
import sys
from typing import TextIO

_ALLOWED_KEYS = frozenset({
    "event", "run_id", "cycle_id", "project_id", "prompt_id", "uid", "case_id", "index",
    "status", "reason", "stage", "iteration", "cost", "spent", "case_count", "error_count",
    "n_cases", "model",
})


class _LiveStdoutHandler(logging.StreamHandler[TextIO]):
    """Re-resolves sys.stdout on every emit (rather than binding it once at construction,
    which is what plain StreamHandler(sys.stdout) does) — needed because this module is
    imported once at process/test-collection start, before pytest's capsys fixture has
    swapped sys.stdout for a given test; binding early means capsys can never see this
    handler's output otherwise."""

    def emit(self, record: logging.LogRecord) -> None:
        self.stream = sys.stdout
        super().emit(record)


_logger = logging.getLogger("pew")
if not _logger.handlers:
    _handler = _LiveStdoutHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)


def log_event(event: str, **fields: object) -> None:
    unknown = set(fields) - _ALLOWED_KEYS
    if unknown:
        raise ValueError(f"log_event: keys not on the privacy whitelist: {sorted(unknown)}")
    _logger.info(json.dumps({"event": event, **fields}, default=str))
