"""Static prompt-validation rule catalogue.

Ported rule-for-rule from docs/prototype.jsx's RULES/validate (same ids, regexes, and
reason strings). Pure Python: zero google.*/firebase_admin imports, zero network calls,
so this always completes well inside AC-1.4's 500ms p95 budget.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

Status = Literal["pass", "fail", "n/a"]


@dataclass(frozen=True)
class RuleResult:
    id: str
    name: str
    status: Status
    reason: str


_HEDGING = re.compile(
    r"\b(try to|maybe|kind of|if possible|best judgement|your judgement|somewhat|perhaps|"
    r"i guess|sound nice)\b",
    re.IGNORECASE,
)


def _check_clear(text: str) -> tuple[Status, str]:
    hit = _HEDGING.search(text)
    if hit:
        return "fail", f'Hedging language ("{hit.group(0)}") leaves the task underspecified.'
    return "pass", "No hedging or vague qualifiers found."


_FORMAT_HINT = re.compile(r"\b(json|schema|respond only with|format:|return only)\b", re.IGNORECASE)


def _check_specific(text: str) -> tuple[Status, str]:
    if _FORMAT_HINT.search(text):
        return "pass", "An explicit output format is specified."
    return "fail", "No explicit output format — the model is left to choose."


_TEMPLATE_VAR = re.compile(r"{{\s*[\w.]+\s*}}")
_OPEN_TAG_BEFORE = re.compile(r"<[\w-]+>\s*$")
_CLOSE_TAG_AFTER = re.compile(r"^\s*</[\w-]+>")


def _check_xml(text: str) -> tuple[Status, str]:
    matches = list(_TEMPLATE_VAR.finditer(text))
    if not matches:
        return "n/a", "No template variables to wrap."
    wrapped = 0
    for m in matches:
        before = text[max(0, m.start() - 40) : m.start()]
        after = text[m.end() : m.end() + 40]
        if _OPEN_TAG_BEFORE.search(before) and _CLOSE_TAG_AFTER.search(after):
            wrapped += 1
    if wrapped == len(matches):
        return "pass", "All template variables are wrapped in a descriptive XML tag."
    return "fail", f"{len(matches) - wrapped} of {len(matches)} variable(s) not wrapped in a tag."


_EXAMPLE_HINT = re.compile(r"<example|\bfor example\b|\be\.g\.\b", re.IGNORECASE)


def _check_examples(text: str) -> tuple[Status, str]:
    if _EXAMPLE_HINT.search(text):
        return "pass", "A worked example anchors the expected output."
    return "fail", "No worked example — tone and format are left to inference."


_RULES: list[tuple[str, str, Callable[[str], tuple[Status, str]]]] = [
    ("clear", "Clear and direct", _check_clear),
    ("specific", "Be specific", _check_specific),
    ("xml", "XML structure", _check_xml),
    ("examples", "Provide examples", _check_examples),
]


def validate(text: str) -> list[RuleResult]:
    """Run the static validation rule catalogue against prompt text."""
    return [
        RuleResult(id=rule_id, name=name, status=status, reason=reason)
        for rule_id, name, check in _RULES
        for status, reason in [check(text)]
    ]
