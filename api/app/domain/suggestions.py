"""Static (non-model) suggestion fixers — one technique per failing validation rule.

Ported verbatim from docs/prototype.jsx's FIXERS. Gemini-drafted rewrites are Phase 3;
this module stays as free of google.*/firebase_admin imports as domain/validation.py.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.domain.validation import validate

_HEDGE_PHRASES = re.compile(
    r"\b(try to|maybe|kind of|if possible|somewhat|perhaps|i guess)\b", re.IGNORECASE
)


def fix_clear(text: str) -> str:
    text = re.sub(
        r"\bTry to be helpful and use your best judgement\.?",
        "Follow the instructions exactly.",
        text, count=1, flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bTry to sound nice\.?", "Use a warm, professional tone.",
        text, count=1, flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bTry to make it catchy if possible\.?", "Make it catchy.",
        text, count=1, flags=re.IGNORECASE,
    )
    return _HEDGE_PHRASES.sub("", text)


def fix_specific(text: str) -> str:
    if re.search(r"respond only with valid json", text, re.IGNORECASE):
        return text
    schema = (
        '{"summary": string, "urgency": one of urgency_levels}'
        if re.search(r"urgency", text, re.IGNORECASE)
        else '{"output": string}'
    )
    return text.strip() + f"\n\nRespond only with valid JSON matching this schema: {schema}."


_SPECIFIC_WRAPS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Ticket:\s*{{\s*ticket_text\s*}}", re.IGNORECASE), "<ticket>\n{{ticket_text}}\n</ticket>"),
    (
        re.compile(r"Urgency levels:\s*{{\s*urgency_levels\s*}}", re.IGNORECASE),
        "<urgency_levels>\n{{urgency_levels}}\n</urgency_levels>",
    ),
    (re.compile(r"Tone guide:\s*{{\s*tone\s*}}", re.IGNORECASE), "<tone>\n{{tone}}\n</tone>"),
    (
        re.compile(r"Product notes:\s*{{\s*product_notes\s*}}", re.IGNORECASE),
        "<product_notes>\n{{product_notes}}\n</product_notes>",
    ),
    (
        re.compile(r"Brand voice:\s*{{\s*brand_voice\s*}}", re.IGNORECASE),
        "<brand_voice>\n{{brand_voice}}\n</brand_voice>",
    ),
]
_GENERIC_WRAP = re.compile(r"(^|\n)(?!<)([^\n<]{0,20}){{\s*([\w.]+)\s*}}")
_LEAD_HAS_OPEN_TAG = re.compile(r"<[\w-]+>\s*$")


def fix_xml(text: str) -> str:
    out = text
    for pattern, replacement in _SPECIFIC_WRAPS:
        out = pattern.sub(replacement, out, count=1)

    def _wrap_generic(m: re.Match[str]) -> str:
        pre, lead, name = m.group(1), m.group(2), m.group(3)
        if _LEAD_HAS_OPEN_TAG.search(lead):
            return m.group(0)
        return f"{pre}<{name}>\n" + "{{" + name + "}}" + f"\n</{name}>"

    return _GENERIC_WRAP.sub(_wrap_generic, out)


def fix_examples(text: str) -> str:
    if re.search(r"urgency", text, re.IGNORECASE):
        return (
            text.strip()
            + "\n\n<example>\n<ticket>\nMy invoice was double-charged this month, please help ASAP\n"
              '</ticket>\n→ {"summary": "Customer reports duplicate billing charge", '
              '"urgency": "high"}\n</example>'
        )
    return (
        text.strip()
        + "\n\n<example>\n<input>\nLightweight titanium water bottle, keeps drinks cold for 24 hours\n"
          '</input>\n→ {"output": "The bottle that outlasts your day — ice-cold from sunrise to '
          'last train home."}\n</example>'
    )


FIXERS: dict[str, Callable[[str], str]] = {
    "clear": fix_clear,
    "specific": fix_specific,
    "xml": fix_xml,
    "examples": fix_examples,
}


@dataclass(frozen=True)
class Suggestion:
    rule_id: str
    technique: str
    evidence: str
    old_text: str
    new_text: str


def build_suggestions(text: str) -> list[Suggestion]:
    """One suggestion per currently-failing rule (AC-5.5: never bundles two techniques).

    Evidence is the failed rule's own reason string.
    """
    return [
        Suggestion(
            rule_id=result.id,
            technique=result.name,
            evidence=result.reason,
            old_text=text,
            new_text=FIXERS[result.id](text),
        )
        for result in validate(text)
        if result.status == "fail"
    ]
