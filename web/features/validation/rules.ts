// TS mirror of api/app/domain/validation.py — same ids, names, regexes, reasons.
// Display-only: this runs on every keystroke with zero network calls; the server result
// (returned via the suggestions endpoint) is authoritative.
export type ValidationStatus = "pass" | "fail" | "n/a";

export interface ValidationResult {
  id: string;
  name: string;
  status: ValidationStatus;
  reason: string;
}

const HEDGING =
  /\b(try to|maybe|kind of|if possible|best judgement|your judgement|somewhat|perhaps|i guess|sound nice)\b/i;

function checkClear(text: string): ValidationResult {
  const hit = text.match(HEDGING);
  return hit
    ? {
        id: "clear", name: "Clear and direct", status: "fail",
        reason: `Hedging language ("${hit[0]}") leaves the task underspecified.`,
      }
    : { id: "clear", name: "Clear and direct", status: "pass", reason: "No hedging or vague qualifiers found." };
}

const FORMAT_HINT = /\b(json|schema|respond only with|format:|return only)\b/i;

function checkSpecific(text: string): ValidationResult {
  return FORMAT_HINT.test(text)
    ? { id: "specific", name: "Be specific", status: "pass", reason: "An explicit output format is specified." }
    : {
        id: "specific", name: "Be specific", status: "fail",
        reason: "No explicit output format — the model is left to choose.",
      };
}

const TEMPLATE_VAR = /{{\s*[\w.]+\s*}}/g;

function checkXml(text: string): ValidationResult {
  const vars = [...text.matchAll(TEMPLATE_VAR)];
  if (vars.length === 0) {
    return { id: "xml", name: "XML structure", status: "n/a", reason: "No template variables to wrap." };
  }
  const wrapped = vars.filter((m) => {
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 40), index);
    const after = text.slice(index + m[0].length, index + m[0].length + 40);
    return /<[\w-]+>\s*$/.test(before) && /^\s*<\/[\w-]+>/.test(after);
  });
  return wrapped.length === vars.length
    ? { id: "xml", name: "XML structure", status: "pass", reason: "All template variables are wrapped in a descriptive XML tag." }
    : {
        id: "xml", name: "XML structure", status: "fail",
        reason: `${vars.length - wrapped.length} of ${vars.length} variable(s) not wrapped in a tag.`,
      };
}

const EXAMPLE_HINT = /<example|\bfor example\b|\be\.g\.\b/i;

function checkExamples(text: string): ValidationResult {
  return EXAMPLE_HINT.test(text)
    ? { id: "examples", name: "Provide examples", status: "pass", reason: "A worked example anchors the expected output." }
    : {
        id: "examples", name: "Provide examples", status: "fail",
        reason: "No worked example — tone and format are left to inference.",
      };
}

export function validateText(text: string): ValidationResult[] {
  return [checkClear(text), checkSpecific(text), checkXml(text), checkExamples(text)];
}
