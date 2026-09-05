import { describe, expect, it } from "vitest";
import { validateText } from "../features/validation/rules";

describe("validateText", () => {
  it("returns all four rules in order with ids clear/specific/xml/examples", () => {
    const results = validateText("anything");
    expect(results.map((r) => r.id)).toEqual(["clear", "specific", "xml", "examples"]);
  });

  it("fails 'clear' on hedging language", () => {
    const r = validateText("Try to be helpful and use your best judgement.")[0];
    expect(r.status).toBe("fail");
  });

  it("passes 'clear' on a direct instruction", () => {
    const r = validateText("Summarize the ticket and classify its urgency.")[0];
    expect(r.status).toBe("pass");
  });

  it("fails 'specific' without an output format hint", () => {
    const r = validateText("Write a reply to the customer.")[1];
    expect(r.status).toBe("fail");
  });

  it("passes 'specific' with a JSON format hint", () => {
    const r = validateText('Respond only with valid JSON matching this schema: {"output": string}.')[1];
    expect(r.status).toBe("pass");
  });

  it("marks 'xml' not-applicable with no template variables", () => {
    const r = validateText("Write a short product blurb.")[2];
    expect(r.status).toBe("n/a");
  });

  it("fails 'xml' on an unwrapped template variable", () => {
    const r = validateText("Ticket: {{ticket_text}}")[2];
    expect(r.status).toBe("fail");
  });

  it("passes 'xml' when every variable is wrapped", () => {
    const r = validateText("<ticket>\n{{ticket_text}}\n</ticket>")[2];
    expect(r.status).toBe("pass");
  });

  it("fails 'examples' without a worked example", () => {
    const r = validateText("Write a short product blurb.")[3];
    expect(r.status).toBe("fail");
  });

  it("passes 'examples' with a worked example", () => {
    const r = validateText("Write a short product blurb.\n\nFor example: a great tagline.")[3];
    expect(r.status).toBe("pass");
  });
});
