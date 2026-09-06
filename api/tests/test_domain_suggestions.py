from app.domain.suggestions import (
    build_suggestions,
    fix_clear,
    fix_examples,
    fix_specific,
    fix_xml,
)
from app.domain.validation import validate

TRIAGE_PROMPT = (
    "Summarize the support ticket and figure out how urgent it is. "
    "Try to be helpful and use your best judgement.\n\n"
    "Ticket: {{ticket_text}}\nUrgency levels: {{urgency_levels}}\n\nGive me an answer."
)

FULLY_PASSING_PROMPT = (
    "Summarize the ticket and classify its urgency.\n\n"
    "<ticket>\n{{ticket_text}}\n</ticket>\n"
    'Respond only with valid JSON matching this schema: {"output": string}.\n\n'
    'For example: {"output": "high"}.'
)


def _status(text: str, rule_id: str) -> str:
    return next(r.status for r in validate(text) if r.id == rule_id)


def test_fix_clear_removes_hedging_and_revalidates_as_pass():
    assert _status(TRIAGE_PROMPT, "clear") == "fail"
    assert _status(fix_clear(TRIAGE_PROMPT), "clear") == "pass"


def test_fix_specific_adds_a_json_schema_and_revalidates_as_pass():
    text = "Write a reply to the customer.\n\nAnswer:"
    assert _status(text, "specific") == "fail"
    assert _status(fix_specific(text), "specific") == "pass"


def test_fix_xml_wraps_template_variables_and_revalidates_as_pass():
    text = "Ticket: {{ticket_text}}\nUrgency levels: {{urgency_levels}}"
    assert _status(text, "xml") == "fail"
    assert _status(fix_xml(text), "xml") == "pass"


def test_fix_examples_appends_a_worked_example_and_revalidates_as_pass():
    text = "Write a short product blurb."
    assert _status(text, "examples") == "fail"
    assert _status(fix_examples(text), "examples") == "pass"


def test_build_suggestions_returns_one_suggestion_per_failing_rule():
    assert {s.rule_id for s in build_suggestions(TRIAGE_PROMPT)} == {
        "clear", "specific", "xml", "examples",
    }


def test_build_suggestions_never_bundles_two_techniques_in_one_suggestion():
    """AC-5.5: each suggestion names exactly one technique, evidence is the failed rule."""
    results_by_id = {r.id: r for r in validate(TRIAGE_PROMPT)}
    for s in build_suggestions(TRIAGE_PROMPT):
        assert s.technique == results_by_id[s.rule_id].name
        assert s.evidence == results_by_id[s.rule_id].reason
        assert s.old_text == TRIAGE_PROMPT
        assert s.new_text != TRIAGE_PROMPT


def test_build_suggestions_returns_nothing_once_every_rule_passes():
    for rule_id in ("clear", "specific", "xml", "examples"):
        assert _status(FULLY_PASSING_PROMPT, rule_id) in ("pass", "n/a")
    assert build_suggestions(FULLY_PASSING_PROMPT) == []
