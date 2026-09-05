# api/tests/test_seed_guard.py
"""Unit tests for scripts.seed.run()'s environment guard (Critical #3 of the whole-branch
review): nothing should be able to run the seed script against a real, non-emulator
Firestore project by accident and hand out a fixed, publicly-known password to a fresh
administrator account. These run without any Firestore/Auth emulator — the guard must
raise before any network call is made."""
from __future__ import annotations

import pytest

from scripts import seed


async def test_run_refuses_to_seed_without_emulator_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    with pytest.raises(RuntimeError, match="non-emulator"):
        await seed.run()


async def test_run_force_true_bypasses_the_emulator_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)

    class _PastTheGuard(Exception):
        """Raised by the stubbed get_firestore_client to prove the guard let us through
        without actually touching a real Firestore project."""

    async def _boom() -> None:
        raise _PastTheGuard

    monkeypatch.setattr(seed, "get_firestore_client", _boom)
    with pytest.raises(_PastTheGuard):
        await seed.run(force=True)


async def test_run_proceeds_when_emulator_host_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "localhost:8080")

    class _PastTheGuard(Exception):
        pass

    async def _boom() -> None:
        raise _PastTheGuard

    monkeypatch.setattr(seed, "get_firestore_client", _boom)
    with pytest.raises(_PastTheGuard):
        await seed.run()
