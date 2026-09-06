"""Template rendering — devspec's Case schema carries a single input/expected pair (no
per-variable dataset), so every {{var}} placeholder in the prompt text is substituted with
the same case.input value (matches the devspec's single-arg `render(prompt_text,
case.input)` reference signature)."""
from __future__ import annotations

import re

_TEMPLATE_VAR = re.compile(r"{{\s*[\w.]+\s*}}")


def render(prompt_text: str, case_input: str) -> str:
    return _TEMPLATE_VAR.sub(case_input, prompt_text)
