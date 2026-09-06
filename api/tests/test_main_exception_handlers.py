"""Unit test for the LLMCallError -> clean-JSON exception handler wired in app/main.py —
proves an uncaught LLMCallError (or its LLMQuotaExceededError subclass) becomes a
structured 503 response instead of an unhandled-exception stack trace. Uses a throwaway
FastAPI app + route rather than the real one, so this doesn't need Firestore/Auth
emulators."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import llm_call_error_handler
from app.ports.llm import LLMCallError, LLMQuotaExceededError


def _make_app(exc: Exception) -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(LLMCallError, llm_call_error_handler)

    @app.get("/boom")
    async def boom() -> None:
        raise exc

    return app


def test_llm_call_error_becomes_a_clean_503_not_a_stack_trace():
    client = TestClient(_make_app(LLMCallError("Gemini call failed after 3 attempts: boom")))
    resp = client.get("/boom")
    assert resp.status_code == 503
    assert "detail" in resp.json()
    assert "Traceback" not in resp.text


def test_llm_quota_exceeded_error_is_also_caught_by_the_same_handler():
    client = TestClient(
        _make_app(LLMQuotaExceededError("Gemini API quota exhausted after 3 attempts — wait a few minutes before retrying."))
    )
    resp = client.get("/boom")
    assert resp.status_code == 503
    assert "quota" in resp.json()["detail"].lower()
