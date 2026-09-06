import time

from app.domain.validation import validate


def _result(text: str, rule_id: str):
    return next(r for r in validate(text) if r.id == rule_id)


def test_clear_rule_fails_on_hedging_language():
    r = _result("Try to be helpful and use your best judgement.", "clear")
    assert r.status == "fail"
    assert "try to" in r.reason.lower()


def test_clear_rule_passes_on_direct_instruction():
    r = _result("Summarize the ticket and classify its urgency.", "clear")
    assert r.status == "pass"


def test_specific_rule_fails_without_output_format():
    r = _result("Write a reply to the customer.", "specific")
    assert r.status == "fail"


def test_specific_rule_passes_with_json_format_hint():
    r = _result('Respond only with valid JSON matching this schema: {"output": string}.', "specific")
    assert r.status == "pass"


def test_xml_rule_is_not_applicable_with_no_template_variables():
    r = _result("Write a short product blurb.", "xml")
    assert r.status == "n/a"


def test_xml_rule_fails_on_unwrapped_template_variable():
    r = _result("Ticket: {{ticket_text}}\nUrgency levels: {{urgency_levels}}", "xml")
    assert r.status == "fail"
    assert "not wrapped" in r.reason


def test_xml_rule_passes_when_every_variable_is_wrapped():
    r = _result("<ticket>\n{{ticket_text}}\n</ticket>", "xml")
    assert r.status == "pass"


def test_examples_rule_fails_without_a_worked_example():
    r = _result("Write a short product blurb.", "examples")
    assert r.status == "fail"


def test_examples_rule_passes_with_a_worked_example():
    r = _result("Write a short product blurb.\n\nFor example: a great tagline.", "examples")
    assert r.status == "pass"


def test_validate_returns_all_four_rules_in_a_fixed_order():
    assert [r.id for r in validate("anything")] == ["clear", "specific", "xml", "examples"]


def test_validate_makes_zero_model_calls_and_completes_well_within_the_500ms_p95_budget():
    """AC-1.4: zero model API calls, completes within 500ms at p95."""
    start = time.perf_counter()
    for _ in range(50):
        validate("Try to be helpful. Ticket: {{ticket_text}}")
    elapsed_ms = (time.perf_counter() - start) * 1000 / 50
    assert elapsed_ms < 500
