import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Play, CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronRight,
  Wand2, GitBranch, Loader2, RotateCcw, Sparkles, Braces, Repeat,
  Square, AlertTriangle, Flag, Pause, Settings, Lock, Plus, Trash2,
  Bot, User, Zap, Search, Archive, ArchiveRestore, X, FileText,
  Folder, FolderOpen, LogOut, Shield, KeyRound, Mail, Eye, EyeOff,
  UserCircle, CreditCard, Globe, ArrowLeft
} from "lucide-react";

const T = `
  .pew { font-family: 'Inter', system-ui, sans-serif; color: #ECEAE4; }
  .pew-mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  .pew-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .pew-scroll::-webkit-scrollbar-thumb { background: #33384380; border-radius: 4px; }
  @keyframes pewPulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .pew-pulse { animation: pewPulse 1.1s ease-in-out infinite; }
  @keyframes pewIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  .pew-case-in { animation: pewIn .3s ease-out; }
  .pew-name-input { background: transparent; border: none; outline: none; color: #ECEAE4; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; padding: 0; width: 100%; }
  .pew-name-input:focus { border-bottom: 1px solid #7C93F0; }
  .pew-proj-input { background: transparent; border: none; outline: none; color: #9498A3; font-size: 11px; font-weight: 600; font-family: 'Inter', sans-serif; padding: 0; text-transform: uppercase; letter-spacing: .04em; width: 100%; }
`;

const COLORS = {
  bg: "#14161B", surface: "#1B1E25", surface2: "#22262F",
  border: "#2E323C", text: "#ECEAE4", muted: "#9498A3", faint: "#5B606C",
  accent: "#7C93F0", accentDim: "#7C93F026",
  good: "#6FBF8B", goodDim: "#6FBF8B1F",
  mid: "#D9A441", midDim: "#D9A4411F",
  bad: "#DB6B5A", badDim: "#DB6B5A1F",
};
function scoreColor(s) { return s >= 7 ? COLORS.good : s >= 4 ? COLORS.mid : COLORS.bad; }
function scoreDim(s) { return s >= 7 ? COLORS.goodDim : s >= 4 ? COLORS.midDim : COLORS.badDim; }

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- roles ----------
const ROLE_LEVEL = { viewer: 0, contributor: 1, maintainer: 2, administrator: 3 };
const ROLE_COLOR = { viewer: COLORS.faint, contributor: COLORS.good, maintainer: COLORS.mid, administrator: COLORS.accent };
const MOCK_USERS = [
  { name: "Asha Rao", email: "asha@acme.dev", role: "administrator" },
  { name: "Vikram Iyer", email: "vikram@acme.dev", role: "maintainer" },
  { name: "Meera Krishnan", email: "meera@acme.dev", role: "contributor" },
  { name: "Dev Patel", email: "dev@acme.dev", role: "viewer" },
];

// ---------- models & token arithmetic ----------
const MODELS = {
  "haiku-4.5": { label: "Haiku 4.5", provider: "Anthropic", in: 1, out: 5 },
  "sonnet-5": { label: "Sonnet 5", provider: "Anthropic", in: 3, out: 15 },
  "opus-5": { label: "Opus 5", provider: "Anthropic", in: 5, out: 25 },
  "fable-5.1": { label: "Fable 5.1", provider: "Anthropic", in: 10, out: 50 },
};
const TOK = {
  exec: { in: 1500, out: 700 },
  grade: { in: 2800, out: 400 },
  suggest: { in: 5000, out: 1500 },
  datasetGen: { in: 3000, out: 250 },
};
function callCost(modelId, tin, tout, rates) { const m = rates[modelId]; return (tin * m.in + tout * m.out) / 1e6; }
function estimateIteration(models, nCases, nSug, rates) {
  const rows = [
    { stage: "Execution", model: models.execution, tin: TOK.exec.in * nCases, tout: TOK.exec.out * nCases },
    { stage: "Model grading", model: models.grading, tin: TOK.grade.in * nCases, tout: TOK.grade.out * nCases },
    { stage: `Suggestions (×${nSug})`, model: models.suggestions, tin: TOK.suggest.in * nSug, tout: TOK.suggest.out * nSug },
  ].map((r) => ({ ...r, cost: callCost(r.model, r.tin, r.tout, rates) }));
  return {
    rows,
    totalIn: rows.reduce((s, r) => s + r.tin, 0),
    totalOut: rows.reduce((s, r) => s + r.tout, 0),
    totalCost: rows.reduce((s, r) => s + r.cost, 0),
  };
}
const fmt$ = (v) => "$" + v.toFixed(3);
const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v));

// ---------- static validation ----------
const RULES = [
  {
    id: "clear", name: "Clear and direct",
    check: (text) => {
      const hit = text.match(/\b(try to|maybe|kind of|if possible|best judgement|your judgement|somewhat|perhaps|i guess|sound nice)\b/i);
      return hit
        ? { status: "fail", reason: `Hedging language ("${hit[0]}") leaves the task underspecified.` }
        : { status: "pass", reason: "No hedging or vague qualifiers found." };
    },
  },
  {
    id: "specific", name: "Be specific",
    check: (text) => /\b(json|schema|respond only with|format:|return only)\b/i.test(text)
      ? { status: "pass", reason: "An explicit output format is specified." }
      : { status: "fail", reason: "No explicit output format — the model is left to choose." },
  },
  {
    id: "xml", name: "XML structure",
    check: (text) => {
      const vars = [...text.matchAll(/{{\s*[\w.]+\s*}}/g)];
      if (vars.length === 0) return { status: "n/a", reason: "No template variables to wrap." };
      const wrapped = vars.filter((m) => {
        const before = text.slice(Math.max(0, m.index - 40), m.index);
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
        return /<[\w-]+>\s*$/.test(before) && /^\s*<\/[\w-]+>/.test(after);
      });
      return wrapped.length === vars.length
        ? { status: "pass", reason: "All template variables are wrapped in a descriptive XML tag." }
        : { status: "fail", reason: `${vars.length - wrapped.length} of ${vars.length} variable(s) not wrapped in a tag.` };
    },
  },
  {
    id: "examples", name: "Provide examples",
    check: (text) => /<example|\bfor example\b|\be\.g\.\b/i.test(text)
      ? { status: "pass", reason: "A worked example anchors the expected output." }
      : { status: "fail", reason: "No worked example — tone and format are left to inference." },
  },
];
function validate(text) { return RULES.map((r) => ({ id: r.id, name: r.name, ...r.check(text) })); }

// ---------- fixers ----------
function fixClear(text) {
  return text.replace(/\bTry to be helpful and use your best judgement\.?/i, "Follow the instructions exactly.")
    .replace(/\bTry to sound nice\.?/i, "Use a warm, professional tone.")
    .replace(/\bTry to make it catchy if possible\.?/i, "Make it catchy.")
    .replace(/\b(try to|maybe|kind of|if possible|somewhat|perhaps|i guess)\b/gi, "");
}
function fixSpecific(text) {
  if (/respond only with valid json/i.test(text)) return text;
  const schema = /urgency/i.test(text)
    ? `{"summary": string, "urgency": one of urgency_levels}`
    : `{"output": string}`;
  return text.trim() + `\n\nRespond only with valid JSON matching this schema: ${schema}.`;
}
function fixXml(text) {
  let out = text;
  out = out.replace(/Ticket:\s*{{\s*ticket_text\s*}}/i, "<ticket>\n{{ticket_text}}\n</ticket>");
  out = out.replace(/Urgency levels:\s*{{\s*urgency_levels\s*}}/i, "<urgency_levels>\n{{urgency_levels}}\n</urgency_levels>");
  out = out.replace(/Tone guide:\s*{{\s*tone\s*}}/i, "<tone>\n{{tone}}\n</tone>");
  out = out.replace(/Product notes:\s*{{\s*product_notes\s*}}/i, "<product_notes>\n{{product_notes}}\n</product_notes>");
  out = out.replace(/Brand voice:\s*{{\s*brand_voice\s*}}/i, "<brand_voice>\n{{brand_voice}}\n</brand_voice>");
  out = out.replace(/(^|\n)(?!<)([^\n<]{0,20}){{\s*([\w.]+)\s*}}/g, (m, pre, lead, name) => {
    if (/<[\w-]+>\s*$/.test(lead)) return m;
    return `${pre}<${name}>\n{{${name}}}\n</${name}>`;
  });
  return out;
}
function fixExamples(text) {
  if (/urgency/i.test(text)) {
    return text.trim() + `\n\n<example>\n<ticket>\nMy invoice was double-charged this month, please help ASAP\n</ticket>\n→ {"summary": "Customer reports duplicate billing charge", "urgency": "high"}\n</example>`;
  }
  return text.trim() + `\n\n<example>\n<input>\nLightweight titanium water bottle, keeps drinks cold for 24 hours\n</input>\n→ {"output": "The bottle that outlasts your day — ice-cold from sunrise to last train home."}\n</example>`;
}
const FIXERS = { clear: fixClear, specific: fixSpecific, xml: fixXml, examples: fixExamples };

// ---------- diff ----------
function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: "same", v: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", v: A[i] }); i++; }
    else { out.push({ t: "add", v: B[j] }); j++; }
  }
  while (i < n) { out.push({ t: "del", v: A[i] }); i++; }
  while (j < m) { out.push({ t: "add", v: B[j] }); j++; }
  return out;
}

// ---------- simulation ----------
function simulateRun(text, dataset, actualCost) {
  const results = validate(text);
  const passCount = results.filter((r) => r.status === "pass").length;
  const rng = mulberry32(hashStr(text + "|" + dataset.map((d) => d.id).join(",")));
  const cases = dataset.map((c, idx) => {
    const jitter = (rng() - 0.5) * 1.6;
    const composite = Math.max(0.4, Math.min(9.8, 1.6 + passCount * 1.75 + jitter));
    const code = passCount >= 2 ? (rng() < 0.85 ? 10 : 0) : (rng() < 0.25 ? 10 : 0);
    const model = Math.max(1, Math.min(10, composite * 2 - code));
    const failing = results.filter((r) => r.status === "fail");
    const weakness = composite < 6.5 && failing.length ? failing[idx % failing.length].name : null;
    return { ...c, code: Math.round(code), model: Math.round(model * 10) / 10, weakness };
  });
  return { cases, cost: Math.round(actualCost * 1000) / 1000 };
}
function blendCase(c, human, w) {
  const parts = [[w.code, c.code], [w.model, c.model]];
  if (human != null && human !== "") parts.push([w.human, +human]);
  const den = parts.reduce((s, [wi]) => s + wi, 0);
  return den ? parts.reduce((s, [wi, v]) => s + wi * v, 0) / den : 0;
}
function blendedStats(run, humanMap, w) {
  const scores = run.cases.map((c) => blendCase(c, humanMap?.[c.id], w));
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  return {
    composite: Math.round(avg * 100) / 100,
    codeAvg: Math.round((run.cases.reduce((s, c) => s + c.code, 0) / run.cases.length) * 10) / 10,
    modelAvg: Math.round((run.cases.reduce((s, c) => s + c.model, 0) / run.cases.length) * 10) / 10,
    humanCount: run.cases.filter((c) => humanMap?.[c.id] != null && humanMap[c.id] !== "").length,
  };
}
function bestScoreOf(p, w) {
  let best = null;
  for (const [n, run] of Object.entries(p.runsByVersion)) {
    const s = blendedStats(run, p.humanGrades[n], w).composite;
    if (best == null || s > best) best = s;
  }
  return best;
}

// ---------- seed data ----------
const GEN_POOL = [
  { input: "Your billing page shows my subscription as cancelled but I was still charged.", expected: "high" },
  { input: "Two-factor codes arrive 10 minutes late, locking me out of urgent work.", expected: "high" },
  { input: "The exported PDF cuts off the last column of the table.", expected: "medium" },
  { input: "Site is completely down for our whole team, error 503 on every page.", expected: "critical" },
  { input: "Feature request: dark mode for the reports screen.", expected: "low" },
  { input: "Can you add more font choices to the editor?", expected: "low" },
];
let CASE_SEQ = 100;
const mkCase = (input, expected) => ({ id: "c" + (++CASE_SEQ), input, expected });

const TRIAGE_PROMPT = `Summarize the support ticket and figure out how urgent it is. Try to be helpful and use your best judgement.

Ticket: {{ticket_text}}
Urgency levels: {{urgency_levels}}

Give me an answer.`;
const REPLY_PROMPT = `Write a reply to the customer. Try to sound nice.

Ticket: {{ticket_text}}
Tone guide: {{tone}}

Answer:`;
const BLURB_PROMPT = `Write a short product blurb. Try to make it catchy if possible.

Product notes: {{product_notes}}
Brand voice: {{brand_voice}}

Blurb:`;

let PROMPT_SEQ = 0;
function makePrompt(projectId, name, text, dataset, tags) {
  const id = "p" + (++PROMPT_SEQ);
  return {
    id, projectId, name, tags: tags || [], archived: false,
    versions: [{ n: 1, text, note: "Initial draft", technique: null }],
    draft: text, dataset,
    runsByVersion: {}, humanGrades: {}, dismissedSug: [], dsLog: [],
  };
}
const DEFAULT_CFG = () => ({
  target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
  weights: { code: 1, model: 1, human: 1 },
  models: { execution: "sonnet-5", grading: "haiku-4.5", suggestions: "haiku-4.5", datasetGen: "haiku-4.5" },
});
let PROJ_SEQ = 0;
function makeProject(name, cfg) {
  return { id: "j" + (++PROJ_SEQ), name, cfg: cfg || DEFAULT_CFG(), collapsed: false };
}
const projA = makeProject("Support automation");
const projB = makeProject("Marketing copy", {
  ...DEFAULT_CFG(),
  target: 7.5, maxIter: 3, budget: 1.0,
  models: { execution: "opus-5", grading: "haiku-4.5", suggestions: "sonnet-5", datasetGen: "haiku-4.5" },
});
const pA1 = makePrompt(projA.id, "Ticket triage", TRIAGE_PROMPT, [
  mkCase("My invoice was charged twice this month, please refund the duplicate charge.", "high"),
  mkCase("How do I export my data to CSV?", "low"),
  mkCase("The app crashes every time I try to upload a photo larger than 5MB.", "medium"),
  mkCase("I can't log in — password reset email never arrives, and I have a client demo in 20 minutes.", "critical"),
  mkCase("Just wanted to say the new dashboard redesign looks great!", "low"),
  mkCase("Getting a 500 error on checkout intermittently, losing about 2% of orders.", "high"),
], ["triage", "prod"]);
const pA2 = makePrompt(projA.id, "Reply drafter", REPLY_PROMPT, [
  mkCase("My invoice was charged twice this month, please refund the duplicate charge.", "high"),
  mkCase("The app crashes every time I try to upload a photo larger than 5MB.", "medium"),
  mkCase("Just wanted to say the new dashboard redesign looks great!", "low"),
  mkCase("Site is completely down for our whole team, error 503 on every page.", "critical"),
], ["replies", "experiment"]);
const pB1 = makePrompt(projB.id, "Product blurb writer", BLURB_PROMPT, [
  mkCase("Lightweight titanium water bottle, keeps drinks cold for 24 hours.", "playful"),
  mkCase("Noise-cancelling earbuds with 30-hour battery and wireless charging case.", "premium"),
  mkCase("Compostable phone case made from plant starch, ships plastic-free.", "earnest"),
  mkCase("Mechanical keyboard with hot-swappable switches and per-key RGB.", "playful"),
], ["marketing", "experiment"]);
const INITIAL_PROJECTS = { [projA.id]: projA, [projB.id]: projB };
const INITIAL_PROJ_ORDER = [projA.id, projB.id];
const INITIAL_PROMPTS = { [pA1.id]: pA1, [pA2.id]: pA2, [pB1.id]: pB1 };
const INITIAL_ORDER = [pA1.id, pA2.id, pB1.id];

const END_REASONS = {
  "target-met": { label: "Target met", color: COLORS.good },
  "iteration-cap": { label: "Iteration cap reached", color: COLORS.mid },
  "budget-cap": { label: "Budget cap — next iteration not started", color: COLORS.mid },
  "user-stopped": { label: "Stopped by user", color: COLORS.muted },
  "no-suggestions": { label: "No open suggestions left", color: COLORS.muted },
  "not-converging": { label: "Auto-stopped: not converging", color: COLORS.mid },
};

// ---------- atoms ----------
function StatusIcon({ status }) {
  if (status === "pass") return <CheckCircle2 size={15} color={COLORS.good} />;
  if (status === "fail") return <XCircle size={15} color={COLORS.bad} />;
  return <MinusCircle size={15} color={COLORS.faint} />;
}
function ScoreBadge({ value, size = "sm" }) {
  const c = scoreColor(value); const big = size === "lg";
  return (
    <span className="pew-mono" style={{
      color: c, background: scoreDim(value), border: `0.5px solid ${c}55`, borderRadius: 6,
      padding: big ? "4px 10px" : "1px 7px", fontSize: big ? 20 : 12, fontWeight: 600,
    }}>{value.toFixed(1)}</span>
  );
}
function RoleBadge({ role }) {
  return (
    <span className="pew-mono" style={{ fontSize: 10, color: ROLE_COLOR[role], border: `0.5px solid ${ROLE_COLOR[role]}55`, borderRadius: 4, padding: "1px 6px" }}>
      {role}
    </span>
  );
}
function Tab({ active, onClick, children, count, dot, icon }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: "none",
      borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
      color: active ? COLORS.text : COLORS.muted, padding: "10px 4px",
      fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
    }}>
      {icon}{children}
      {dot && <span style={{ width: 7, height: 7, borderRadius: 4, background: COLORS.accent }} />}
      {count != null && (
        <span className="pew-mono" style={{
          fontSize: 11, color: active ? COLORS.accent : COLORS.faint,
          background: active ? COLORS.accentDim : "#2E323C60", borderRadius: 10, padding: "1px 6px",
        }}>{count}</span>
      )}
    </button>
  );
}
function DiffBlock({ oldText, newText, maxHeight = 200 }) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  return (
    <div className="pew-mono pew-scroll" style={{
      fontSize: 12, lineHeight: 1.65, background: "#0F1116",
      border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 0",
      maxHeight, overflow: "auto",
    }}>
      {lines.map((l, idx) => (
        <div key={idx} style={{
          padding: "1px 12px", whiteSpace: "pre-wrap",
          background: l.t === "add" ? "#6FBF8B14" : l.t === "del" ? "#DB6B5A14" : "transparent",
          color: l.t === "add" ? COLORS.good : l.t === "del" ? COLORS.bad : COLORS.muted,
          borderLeft: `2px solid ${l.t === "add" ? COLORS.good : l.t === "del" ? COLORS.bad : "transparent"}`,
        }}>
          <span style={{ opacity: 0.55, marginRight: 8 }}>{l.t === "add" ? "+" : l.t === "del" ? "−" : " "}</span>
          {l.v || "\u00A0"}
        </div>
      ))}
    </div>
  );
}
function Btn({ onClick, children, tone = "primary", disabled, small, title }) {
  const styles = {
    primary: { background: COLORS.accent, color: "#12141A", border: "none" },
    ghost: { background: "transparent", color: COLORS.muted, border: `0.5px solid ${COLORS.border}` },
    danger: { background: "transparent", color: COLORS.bad, border: `0.5px solid ${COLORS.bad}66` },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      ...styles, borderRadius: 6, padding: small ? "4px 9px" : "6px 12px", fontSize: small ? 11 : 12, fontWeight: 600,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
      display: "flex", alignItems: "center", gap: 5,
    }}>{children}</button>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 90 }}>
      <span style={{ fontSize: 10.5, color: COLORS.faint }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  background: "#0F1116", color: "#ECEAE4", border: "0.5px solid #2E323C",
  borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", width: "100%",
};
function Section({ icon, title, children, note }) {
  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 14, background: COLORS.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        {icon}<span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>
      {children}
      {note && <div style={{ fontSize: 10.5, color: COLORS.faint, marginTop: 8, lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
}
function EstimateTable({ est, nCases }) {
  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .8fr .8fr .7fr", fontSize: 10.5, color: COLORS.faint, padding: "6px 10px", background: COLORS.surface2 }}>
        <span>stage</span><span>model</span><span>tokens in</span><span>tokens out</span><span style={{ textAlign: "right" }}>est. $</span>
      </div>
      {est.rows.map((r) => (
        <div key={r.stage} className="pew-mono" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .8fr .8fr .7fr", fontSize: 11.5, color: COLORS.muted, padding: "6px 10px", borderTop: `0.5px solid ${COLORS.border}55` }}>
          <span style={{ fontFamily: "Inter, sans-serif" }}>{r.stage}</span>
          <span>{MODELS[r.model].label}</span>
          <span>{fmtK(r.tin)}</span><span>{fmtK(r.tout)}</span>
          <span style={{ textAlign: "right" }}>{fmt$(r.cost)}</span>
        </div>
      ))}
      <div className="pew-mono" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .8fr .8fr .7fr", fontSize: 11.5, color: COLORS.text, padding: "6px 10px", borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.surface2 }}>
        <span style={{ fontFamily: "Inter, sans-serif" }}>Per iteration ({nCases} cases)</span>
        <span>—</span><span>{fmtK(est.totalIn)}</span><span>{fmtK(est.totalOut)}</span>
        <span style={{ textAlign: "right" }}>{fmt$(est.totalCost)}</span>
      </div>
    </div>
  );
}

// ---------- login page (mock UI sample — no real authentication) ----------
function LoginScreen({ onLogin, members }) {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  function resolveUser(emailIn, nameIn) {
    const known = members.find((m) => m.email.toLowerCase() === emailIn.toLowerCase());
    if (known) return known;
    const display = nameIn?.trim() || emailIn.split("@")[0].replace(/[._]/g, " ");
    return { name: display.charAt(0).toUpperCase() + display.slice(1), email: emailIn, role: "contributor" };
  }
  function submit() {
    setErr(null); setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter a valid email address.");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (mode === "signup" && pw !== pw2) return setErr("Passwords do not match.");
    onLogin(resolveUser(email, name), mode === "signup");
  }
  function google() {
    onLogin(resolveUser("meera@acme.dev"), false, "google");
  }
  function reset() {
    setErr(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter your email above first, then click reset.");
    setMsg(`Password reset email sent to ${email} (mock — nothing was actually sent).`);
  }

  return (
    <div className="pew" style={{ background: COLORS.bg, borderRadius: 14, border: `0.5px solid ${COLORS.border}`, minHeight: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{T}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      <div style={{ width: 380, maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 12, background: COLORS.accentDim, border: `0.5px solid ${COLORS.accent}44`, marginBottom: 12 }}>
            <KeyRound size={19} color={COLORS.accent} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Prompt Evaluation Workbench</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
            {mode === "signin" ? "Sign in to Acme Corp workspace" : "Create your account"}
          </div>
        </div>

        <div style={{ display: "flex", background: COLORS.surface2, borderRadius: 8, padding: 3, marginBottom: 14 }}>
          {["signin", "signup"].map((m) => (
            <button key={m} onClick={() => { setMode(m); setErr(null); setMsg(null); }} style={{
              flex: 1, background: mode === m ? COLORS.surface : "transparent",
              border: mode === m ? `0.5px solid ${COLORS.border}` : "none",
              borderRadius: 6, padding: "7px 0", fontSize: 12, fontWeight: 600,
              color: mode === m ? COLORS.text : COLORS.faint, cursor: "pointer",
            }}>{m === "signin" ? "Sign in" : "Sign up"}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {mode === "signup" && (
            <div style={{ position: "relative" }}>
              <UserCircle size={13} color={COLORS.faint} style={{ position: "absolute", left: 9, top: 9 }} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                style={{ ...inputStyle, paddingLeft: 28 }} />
            </div>
          )}
          <div style={{ position: "relative" }}>
            <Mail size={13} color={COLORS.faint} style={{ position: "absolute", left: 9, top: 9 }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
              autoComplete="off" style={{ ...inputStyle, paddingLeft: 28 }} />
          </div>
          <div style={{ position: "relative" }}>
            <Lock size={13} color={COLORS.faint} style={{ position: "absolute", left: 9, top: 9 }} />
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password"
              type={showPw ? "text" : "password"} autoComplete="new-password"
              style={{ ...inputStyle, paddingLeft: 28, paddingRight: 30 }} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 8, top: 7, background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 0 }}>
              {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {mode === "signup" && (
            <div style={{ position: "relative" }}>
              <Lock size={13} color={COLORS.faint} style={{ position: "absolute", left: 9, top: 9 }} />
              <input value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password"
                type={showPw ? "text" : "password"} autoComplete="new-password"
                style={{ ...inputStyle, paddingLeft: 28 }} />
            </div>
          )}
          {err && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{err}</div>}
          {msg && <div style={{ fontSize: 11.5, color: COLORS.good }}>{msg}</div>}
          <Btn onClick={submit}>{mode === "signin" ? "Sign in" : "Create account"}</Btn>
          {mode === "signin" && (
            <button onClick={reset} style={{ background: "none", border: "none", color: COLORS.accent, fontSize: 11.5, cursor: "pointer", textAlign: "left", padding: 0 }}>
              Forgot password?
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
          <div style={{ flex: 1, height: 0.5, background: COLORS.border }} />
          <span style={{ fontSize: 10.5, color: COLORS.faint }}>or</span>
          <div style={{ flex: 1, height: 0.5, background: COLORS.border }} />
        </div>

        <button onClick={google} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: COLORS.surface, border: `0.5px solid ${COLORS.border}`, borderRadius: 8,
          padding: "9px 0", fontSize: 12.5, fontWeight: 600, color: COLORS.text, cursor: "pointer",
        }}>
          <span style={{ width: 17, height: 17, borderRadius: 9, background: "#fff", color: "#4285F4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>G</span>
          Continue with Google
        </button>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 6 }}>Quick demo accounts (for role testing):</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {members.map((u) => (
              <button key={u.email} onClick={() => onLogin(u, false)} style={{
                background: COLORS.surface, border: `0.5px solid ${COLORS.border}`, borderRadius: 6,
                padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ fontSize: 10.5, color: COLORS.muted }}>{u.name.split(" ")[0]}</span>
                <RoleBadge role={u.role} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 10, color: COLORS.faint, lineHeight: 1.6, marginTop: 14, textAlign: "center" }}>
          Prototype only — no real authentication happens and nothing is stored or sent, so please
          don't enter real credentials. In production this page is Firebase Auth (email/password +
          Google); roles and grants live in Postgres, enforced by the API on every endpoint.
        </div>
      </div>
    </div>
  );
}

// ---------- global settings ----------
function GlobalSettings({ user, members, changeMemberRole, audit, can, rates, setRates, enabled, setEnabled, apiKeys, setApiKeys, privacy, setPrivacy, onClose, onDeleteAccount, syncName }) {
  const [pwCur, setPwCur] = useState(""); const [pwNew, setPwNew] = useState(""); const [pwConf, setPwConf] = useState("");
  const [secMsg, setSecMsg] = useState(null);
  const [keyDraft, setKeyDraft] = useState({ Anthropic: "", "OpenAI-compatible": "" });
  const [delConfirm, setDelConfirm] = useState("");

  function changePw() {
    setSecMsg(null);
    if (pwNew.length < 8) return setSecMsg({ t: "err", m: "New password must be at least 8 characters." });
    if (pwNew !== pwConf) return setSecMsg({ t: "err", m: "New passwords do not match." });
    setPwCur(""); setPwNew(""); setPwConf("");
    setSecMsg({ t: "ok", m: "Password updated (mock — nothing was stored)." });
  }
  const mask = (k) => (k ? k.slice(0, 5) + "…" + k.slice(-3) : "");

  return (
    <div style={{ padding: 20, maxWidth: 720, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }} className="pew-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={onClose} style={{ background: "transparent", border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 7px", color: COLORS.muted, cursor: "pointer", display: "flex" }}>
          <ArrowLeft size={13} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Global settings</span>
        <span style={{ fontSize: 11, color: COLORS.faint }}>account-level — applies across all projects</span>
      </div>

      <Section icon={<UserCircle size={14} color={COLORS.accent} />} title="Profile">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Display name">
            <input value={user.name} onChange={(e) => syncName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Email (identity — managed by the auth provider)">
            <input value={user.email} readOnly style={{ ...inputStyle, color: COLORS.faint }} />
          </Field>
          <Field label="Role (assigned by an administrator)">
            <div style={{ paddingTop: 6 }}><RoleBadge role={user.role} /></div>
          </Field>
        </div>
      </Section>

      <Section icon={<Lock size={14} color={COLORS.accent} />} title="Security"
        note="Mock — nothing is stored. In production: Firebase updatePassword / sendPasswordResetEmail; accounts signed in with Google manage their password with Google. Sensitive changes also revoke refresh tokens.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Current password"><input type="password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} autoComplete="new-password" style={inputStyle} /></Field>
          <Field label="New password"><input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" style={inputStyle} /></Field>
          <Field label="Confirm new password"><input type="password" value={pwConf} onChange={(e) => setPwConf(e.target.value)} autoComplete="new-password" style={inputStyle} /></Field>
        </div>
        {secMsg && <div style={{ fontSize: 11.5, color: secMsg.t === "ok" ? COLORS.good : COLORS.bad, marginTop: 8 }}>{secMsg.m}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn onClick={changePw}>Update password</Btn>
          <Btn tone="ghost" onClick={() => setSecMsg({ t: "ok", m: `Password reset email sent to ${user.email} (mock).` })}>Send reset email</Btn>
        </div>
      </Section>

      <Section icon={<KeyRound size={14} color={COLORS.accent} />} title="Your API keys"
        note="Keys here are held in memory only for this prototype and never sent anywhere. In production, provider credentials are stored server-side, envelope-encrypted under a managed key service, never returned to the browser, never logged, and rotatable.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.keys(keyDraft).map((prov) => (
            <div key={prov} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, width: 130 }}>{prov}</span>
              {apiKeys[prov] ? (
                <>
                  <span className="pew-mono" style={{ fontSize: 11.5, color: COLORS.muted, flex: 1 }}>{mask(apiKeys[prov])}</span>
                  <Btn tone="ghost" small onClick={() => setApiKeys({ ...apiKeys, [prov]: "" })}>Remove</Btn>
                </>
              ) : (
                <>
                  <input type="password" value={keyDraft[prov]} onChange={(e) => setKeyDraft({ ...keyDraft, [prov]: e.target.value })}
                    placeholder={prov === "Anthropic" ? "sk-ant-…" : "sk-…"} autoComplete="new-password"
                    className="pew-mono" style={{ ...inputStyle, flex: 1, fontSize: 11.5 }} />
                  <Btn small onClick={() => { if (keyDraft[prov].trim()) { setApiKeys({ ...apiKeys, [prov]: keyDraft[prov].trim() }); setKeyDraft({ ...keyDraft, [prov]: "" }); } }}>Save</Btn>
                </>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<CreditCard size={14} color={COLORS.accent} />} title="Model registry"
        note={can.settings ? "Rates feed every project's estimator. Disabled models disappear from per-stage dropdowns (existing assignments keep working but are flagged)." : "Maintainer role required to edit rates or availability — shown read-only."}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(MODELS).map(([id, m]) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: COLORS.surface2, fontSize: 12 }}>
              <span style={{ flex: 1 }}>{m.label} <span className="pew-mono" style={{ fontSize: 10, color: COLORS.faint }}>{m.provider}</span></span>
              <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint }}>$/1M in</span>
              <input type="number" step="0.5" min="0" disabled={!can.settings} value={rates[id].in}
                onChange={(e) => setRates({ ...rates, [id]: { ...rates[id], in: +e.target.value } })}
                className="pew-mono" style={{ ...inputStyle, width: 62, padding: "3px 6px", fontSize: 11 }} />
              <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint }}>out</span>
              <input type="number" step="0.5" min="0" disabled={!can.settings} value={rates[id].out}
                onChange={(e) => setRates({ ...rates, [id]: { ...rates[id], out: +e.target.value } })}
                className="pew-mono" style={{ ...inputStyle, width: 62, padding: "3px 6px", fontSize: 11 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: COLORS.muted, cursor: can.settings ? "pointer" : "default" }}>
                <input type="checkbox" checked={enabled[id]} disabled={!can.settings}
                  onChange={(e) => setEnabled({ ...enabled, [id]: e.target.checked })} />
                enabled
              </label>
            </div>
          ))}
        </div>
      </Section>

      {can.admin && (
        <Section icon={<Shield size={14} color={COLORS.accent} />} title="Members (administrator only)"
          note="Role changes are audit-logged (AC-18.1). In production, a role change also revokes the member's Firebase refresh tokens so stale claims can't linger.">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {members.map((m) => (
              <div key={m.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: COLORS.surface2, fontSize: 12 }}>
                <span style={{ flex: 1 }}>{m.name} <span className="pew-mono" style={{ fontSize: 10, color: COLORS.faint }}>{m.email}</span></span>
                <select value={m.role} onChange={(e) => changeMemberRole(m.email, e.target.value)} className="pew-mono" style={{ ...inputStyle, width: 130, padding: "4px 6px", fontSize: 11 }}>
                  {Object.keys(ROLE_LEVEL).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
          {audit.length > 0 && (
            <div className="pew-mono pew-scroll" style={{ fontSize: 10.5, color: COLORS.faint, lineHeight: 1.7, marginTop: 8, maxHeight: 80, overflow: "auto" }}>
              {audit.map((a, i) => <div key={i}>{a}</div>)}
            </div>
          )}
        </Section>
      )}

      <Section icon={<Globe size={14} color={COLORS.accent} />} title="Privacy"
        note="Per the PRD: prompt text, test case content, model output, and grader reasoning are excluded from logs and analytics — that exclusion is not configurable. Scores and metadata are retained indefinitely.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, flex: 1 }}>Run artifact retention (then hard-deleted on schedule)</span>
            <select value={privacy.retention} onChange={(e) => setPrivacy({ ...privacy, retention: e.target.value })} className="pew-mono" style={{ ...inputStyle, width: 110, padding: "4px 6px", fontSize: 11 }}>
              <option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, flex: 1 }}>Prompt &amp; output content in analytics</span>
            <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint, display: "flex", alignItems: "center", gap: 4 }}><Lock size={10} /> always excluded</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <span style={{ fontSize: 12, flex: 1 }}>Share anonymous usage metrics (counts and costs only)</span>
            <input type="checkbox" checked={privacy.telemetry} onChange={(e) => setPrivacy({ ...privacy, telemetry: e.target.checked })} />
          </label>
        </div>
      </Section>

      <Section icon={<AlertTriangle size={14} color={COLORS.bad} />} title="Danger zone"
        note="Mock: removes your membership and signs you out. In production this is a two-step server-side flow — revoke sessions, delete the Firebase user, and anonymise the Postgres User row while retaining audit entries, which are append-only by design.">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="Type DELETE to confirm"
            className="pew-mono" style={{ ...inputStyle, width: 190, fontSize: 11.5 }} />
          <Btn tone="danger" disabled={delConfirm !== "DELETE"} onClick={onDeleteAccount}><Trash2 size={12} /> Delete my account</Btn>
        </div>
      </Section>
    </div>
  );
}

// ---------- main ----------
export default function PromptEvalWorkbench() {
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState(MOCK_USERS.map((u) => ({ ...u })));
  const [audit, setAudit] = useState([]);
  const [showGlobal, setShowGlobal] = useState(false);
  const [rates, setRates] = useState(Object.fromEntries(Object.entries(MODELS).map(([id, m]) => [id, { in: m.in, out: m.out }])));
  const [enabled, setEnabled] = useState(Object.fromEntries(Object.keys(MODELS).map((id) => [id, true])));
  const [apiKeys, setApiKeys] = useState({ Anthropic: "", "OpenAI-compatible": "" });
  const [privacy, setPrivacy] = useState({ retention: "90", telemetry: true });
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [projOrder, setProjOrder] = useState(INITIAL_PROJ_ORDER);
  const [prompts, setPrompts] = useState(INITIAL_PROMPTS);
  const [order, setOrder] = useState(INITIAL_ORDER);
  const [activeId, setActiveId] = useState(INITIAL_ORDER[0]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tab, setTab] = useState("setup");
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [runningCost, setRunningCost] = useState(0);
  const [expandedCase, setExpandedCase] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [manualPreview, setManualPreview] = useState(false);

  const runTimer = useRef(null);
  const autoTimer = useRef(null);
  const promptsRef = useRef(prompts);
  const projectsRef = useRef(projects);
  const cycleRef = useRef(cycle);
  const ratesRef = useRef(rates);
  const lastRunRef = useRef(null);
  useEffect(() => { promptsRef.current = prompts; }, [prompts]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { cycleRef.current = cycle; }, [cycle]);
  useEffect(() => { ratesRef.current = rates; }, [rates]);
  useEffect(() => () => { clearInterval(runTimer.current); clearTimeout(autoTimer.current); }, []);

  const lvl = user ? ROLE_LEVEL[user.role] : -1;
  const can = { edit: lvl >= 1, settings: lvl >= 2, admin: lvl >= 3 };

  const getP = (pid) => promptsRef.current[pid];
  const getJ = (jid) => projectsRef.current[jid];
  function patchP(pid, patch) {
    setPrompts((prev) => {
      const cur = prev[pid];
      const next = { ...prev, [pid]: { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) } };
      promptsRef.current = next;
      return next;
    });
  }
  function patchJ(jid, patch) {
    setProjects((prev) => {
      const cur = prev[jid];
      const next = { ...prev, [jid]: { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) } };
      projectsRef.current = next;
      return next;
    });
  }
  function updateCycle(patch) {
    setCycle((c) => { const next = typeof patch === "function" ? patch(c) : c ? { ...c, ...patch } : c; cycleRef.current = next; return next; });
  }
  function log(msg) { updateCycle((c) => c ? { ...c, log: [...c.log, msg] } : c); }

  const p = prompts[activeId];
  const proj = projects[p.projectId];
  const cfg = proj.cfg;
  const setCfg = (next) => patchJ(proj.id, { cfg: next });
  const currentV = p.versions[p.versions.length - 1];
  const isDirty = p.draft !== currentV.text;
  const liveValidation = useMemo(() => validate(p.draft), [p.draft]);
  const activeRun = p.runsByVersion[currentV.n];
  const cycleActive = cycle && cycle.status !== "ended";
  const cycleIsHere = cycleActive && cycle.promptId === activeId;
  const cyclePrompt = cycle ? prompts[cycle.promptId] : null;
  const datasetLocked = (cycleIsHere && cycle.iteration >= 1) || !can.edit;
  const est = useMemo(() => estimateIteration(cfg.models, p.dataset.length, cfg.nSug, rates), [cfg.models, p.dataset.length, cfg.nSug, rates]);
  const iterationsAffordable = Math.floor(cfg.budget / est.totalCost);
  const w = cycleActive ? cycle.config.weights : cfg.weights;
  const noKeys = !apiKeys["Anthropic"] && !apiKeys["OpenAI-compatible"];

  function createVersion(pid, text, note, technique) {
    const pr = getP(pid);
    const n = pr.versions[pr.versions.length - 1].n + 1;
    patchP(pid, { versions: [...pr.versions, { n, text, note, technique: technique || null }], draft: text });
    return n;
  }

  // ---------- evaluation run ----------
  function runEvaluation(pid, textParam) {
    const pr = getP(pid);
    const jcfg = getJ(pr.projectId).cfg;
    const text = textParam ?? pr.draft;
    let targetN = pr.versions[pr.versions.length - 1].n;
    if (text !== pr.versions[pr.versions.length - 1].text) targetN = createVersion(pid, text, "Manual edit", null);
    setTab("run");
    setRunning(true); setRevealed(0); setRunningCost(0); setExpandedCase(null);
    const e = estimateIteration(jcfg.models, pr.dataset.length, 0, ratesRef.current);
    const jit = 0.92 + mulberry32(hashStr(text))() * 0.16;
    const actualCost = (e.rows[0].cost + e.rows[1].cost) * jit;
    const result = simulateRun(text, getP(pid).dataset, actualCost);
    lastRunRef.current = { promptId: pid, result, versionN: targetN, text };
    let i = 0;
    clearInterval(runTimer.current);
    runTimer.current = setInterval(() => {
      i++;
      setRevealed(i);
      setRunningCost((c) => c + result.cost / result.cases.length);
      if (i >= result.cases.length) {
        clearInterval(runTimer.current);
        setRunning(false);
        patchP(pid, (cur) => ({ runsByVersion: { ...cur.runsByVersion, [targetN]: result } }));
        onRunComplete(result, targetN);
      }
    }, 360);
  }

  // ---------- cycle state machine ----------
  function startCycle() {
    const pid = activeId;
    const jcfg = getJ(getP(pid).projectId).cfg;
    const c = {
      promptId: pid, projectId: getP(pid).projectId, status: "active", stage: "dataset", iteration: 0, spent: 0,
      scores: [], endReason: null, bestN: null, pending: null, warnedFlat: false,
      config: { ...jcfg, weights: { ...jcfg.weights }, models: { ...jcfg.models } },
      log: [],
    };
    setCycle(c); cycleRef.current = c;
    log(`Cycle started on "${getP(pid).name}" by ${user.name} — target ${c.config.target.toFixed(1)}, max ${c.config.maxIter} iterations, budget ${fmt$(c.config.budget)}, ${c.config.auto ? "auto" : "attended"} mode.`);
    setTab("dataset");
    if (c.config.auto) {
      log("Auto mode: dataset auto-approved.");
      autoTimer.current = setTimeout(() => approveDataset(), 700);
    }
  }
  function approveDataset() {
    const c = cycleRef.current;
    if (!c || c.status !== "active") return;
    updateCycle({ stage: "preview" });
    setTab("run");
    log(`Dataset approved — ${getP(c.promptId).dataset.length} cases, frozen for this cycle.`);
    if (c.config.auto) autoTimer.current = setTimeout(() => confirmRun(), 700);
  }
  function confirmRun() {
    const c = cycleRef.current;
    if (!c || c.status !== "active") return;
    const e = estimateIteration(c.config.models, getP(c.promptId).dataset.length, c.config.nSug, ratesRef.current);
    if (c.spent + e.totalCost > c.config.budget) {
      log(`Projected next iteration (${fmt$(e.totalCost)}) exceeds remaining budget (${fmt$(c.config.budget - c.spent)}) — not started.`);
      return endCycle("budget-cap");
    }
    updateCycle((x) => ({ ...x, iteration: x.iteration + 1, stage: "running" }));
    log(`Iteration ${c.iteration + 1}: running evaluation…`);
    runEvaluation(c.promptId);
  }
  function onRunComplete(result, versionN) {
    const c = cycleRef.current;
    if (!c || c.status !== "active") return;
    updateCycle((x) => ({ ...x, spent: x.spent + result.cost }));
    log(`v${versionN} run complete (cost ${fmt$(result.cost)}).`);
    if (c.config.auto) doChecks();
    else { updateCycle({ stage: "grade" }); log("Paused: add manual grades if you want, then continue."); }
  }
  function doChecks() {
    const c = cycleRef.current;
    if (!c || c.status !== "active") return;
    const { result, versionN, text } = lastRunRef.current;
    const stats = blendedStats(result, getP(c.promptId).humanGrades[versionN], c.config.weights);
    const scores = [...c.scores, { n: versionN, score: stats.composite }];
    updateCycle((x) => ({ ...x, scores, stage: "checking" }));
    log(`v${versionN} composite ${stats.composite.toFixed(2)}${stats.humanCount ? ` (incl. ${stats.humanCount} manual grade${stats.humanCount > 1 ? "s" : ""})` : ""}.`);
    if (stats.composite >= c.config.target) {
      updateCycle({ bestN: versionN });
      log(`Score ${stats.composite.toFixed(2)} ≥ target ${c.config.target.toFixed(1)}.`);
      return endCycle("target-met");
    }
    if (c.iteration >= c.config.maxIter) {
      log("Iteration cap reached without meeting target.");
      return endCycle("iteration-cap");
    }
    if (scores.length >= 2 && scores[scores.length - 1].score <= scores[scores.length - 2].score && !c.warnedFlat) {
      if (c.config.auto) {
        log("Score did not improve — auto mode stops rather than spending unattended.");
        return endCycle("not-converging");
      }
      updateCycle({ stage: "flat-warning", warnedFlat: true });
      log("Score did not improve — cycle may not be converging.");
      return;
    }
    proposeSuggestions(text);
  }
  function proposeSuggestions(text) {
    const c = cycleRef.current;
    const failing = validate(text).filter((r) => r.status === "fail");
    if (failing.length === 0) {
      log("Every catalogue rule passes — no suggestion to generate.");
      return endCycle("no-suggestions");
    }
    const picked = failing.slice(0, c.config.nSug);
    const sugCost = picked.length * callCost(c.config.models.suggestions, TOK.suggest.in, TOK.suggest.out, ratesRef.current);
    const candidates = picked.map((r) => ({ ruleId: r.id, name: r.name, oldText: text, newText: FIXERS[r.id](text) }));
    updateCycle((x) => ({ ...x, spent: x.spent + sugCost, stage: "suggest", pending: { candidates, selected: 0 } }));
    log(`${picked.length} suggestion(s) generated (${fmt$(sugCost)}).`);
    setTab("suggestions");
    if (c.config.auto) {
      log(`Auto mode: applying top-ranked suggestion "${picked[0].name}".`);
      autoTimer.current = setTimeout(() => acceptSelected(), 900);
    }
  }
  function acceptSelected(overrideText) {
    const c = cycleRef.current;
    if (!c || c.status !== "active" || !c.pending) return;
    const cand = c.pending.candidates[c.pending.selected];
    const applied = overrideText ?? cand.newText;
    createVersion(c.promptId, applied, `Applied: ${cand.name}`, cand.name);
    updateCycle((x) => ({ ...x, pending: null, stage: "preview" }));
    log(`v${getP(c.promptId).versions[getP(c.promptId).versions.length - 1].n} created from "${cand.name}".`);
    setTab("run");
    if (c.config.auto) autoTimer.current = setTimeout(() => confirmRun(), 700);
  }
  function continueAfterWarning() { updateCycle({ stage: "checking" }); proposeSuggestions(getP(cycleRef.current.promptId).draft); }
  function endCycle(reason) {
    clearTimeout(autoTimer.current);
    const c = cycleRef.current;
    const best = c.scores.length ? c.scores.reduce((a, b) => (b.score > a.score ? b : a)) : null;
    updateCycle((x) => ({ ...x, status: "ended", stage: "ended", endReason: reason, bestN: x.bestN ?? (best ? best.n : null) }));
    log(`Cycle ended — ${END_REASONS[reason].label.toLowerCase()}. ${fmt$(cycleRef.current.spent)} spent, all iterations retained.`);
    setTab("setup");
  }
  function stopCycle() { if (cycleRef.current && cycleRef.current.status === "active") endCycle("user-stopped"); }
  function newCycleFromBest() {
    const c = cycleRef.current;
    const pr = getP(c.promptId);
    const bestV = pr.versions.find((v) => v.n === c.bestN);
    if (bestV && bestV.text !== pr.draft) patchP(c.promptId, { draft: bestV.text });
    setActiveId(c.promptId);
    setCycle(null); cycleRef.current = null;
  }

  // ---------- project & prompt management ----------
  function newProject() {
    const j = makeProject(`New project ${projOrder.length + 1}`);
    setProjects((prev) => { const next = { ...prev, [j.id]: j }; projectsRef.current = next; return next; });
    setProjOrder((o) => [...o, j.id]);
  }
  function newPrompt(jid) {
    const np = makePrompt(jid, `New prompt ${order.length + 1}`, TRIAGE_PROMPT, [
      mkCase("My invoice was charged twice this month, please refund the duplicate charge.", "high"),
      mkCase("How do I export my data to CSV?", "low"),
      mkCase("The app crashes every time I try to upload a photo larger than 5MB.", "medium"),
    ], []);
    setPrompts((prev) => { const next = { ...prev, [np.id]: np }; promptsRef.current = next; return next; });
    setOrder((o) => [...o, np.id]);
    setActiveId(np.id);
    setTab("setup");
  }
  function renamePrompt(pid, name) {
    const pr = getP(pid);
    const clash = Object.values(promptsRef.current).some((x) => x.id !== pid && x.projectId === pr.projectId && x.name.trim().toLowerCase() === name.trim().toLowerCase());
    patchP(pid, { name: clash ? name + " (2)" : name });
  }
  function toggleArchive(pid) { patchP(pid, (cur) => ({ archived: !cur.archived })); }
  function addTag(pid, t) {
    const tag = t.trim().toLowerCase();
    if (!tag) return;
    patchP(pid, (cur) => cur.tags.includes(tag) ? {} : { tags: [...cur.tags, tag] });
    setTagInput("");
  }
  function removeTag(pid, t) { patchP(pid, (cur) => ({ tags: cur.tags.filter((x) => x !== t) })); }
  function changeMemberRole(email, role) {
    const target = members.find((m) => m.email === email);
    setMembers((ms) => ms.map((m) => (m.email === email ? { ...m, role } : m)));
    setAudit((a) => [...a, `${user.name} changed ${target.name}: ${target.role} → ${role} · ${new Date().toLocaleTimeString()}`]);
    if (user.email === email) setUser((u) => ({ ...u, role }));
  }
  function handleLogin(u, isSignup, provider) {
    if (!members.some((m) => m.email.toLowerCase() === u.email.toLowerCase())) {
      setMembers((ms) => [...ms, u]);
      setAudit((a) => [...a, `${u.name} joined as ${u.role}${provider === "google" ? " (Google)" : isSignup ? " (sign-up)" : ""} · ${new Date().toLocaleTimeString()}`]);
    }
    setUser(u);
  }
  function syncName(name) {
    setUser((u) => ({ ...u, name }));
    setMembers((ms) => ms.map((m) => (m.email === user.email ? { ...m, name } : m)));
  }
  function deleteAccount() {
    setAudit((a) => [...a, `${user.name} deleted their account · ${new Date().toLocaleTimeString()}`]);
    setMembers((ms) => ms.filter((m) => m.email !== user.email));
    setShowGlobal(false);
    setUser(null);
  }

  // ---------- dataset ----------
  function updateCase(id, patch) { patchP(activeId, (cur) => ({ dataset: cur.dataset.map((c) => (c.id === id ? { ...c, ...patch } : c)) })); }
  function deleteCase(id) { patchP(activeId, (cur) => ({ dataset: cur.dataset.filter((c) => c.id !== id) })); }
  function addCase() { patchP(activeId, (cur) => ({ dataset: [...cur.dataset, mkCase("", "")] })); }
  function generateCases() {
    const pr = getP(activeId);
    const existing = new Set(pr.dataset.map((c) => c.input));
    const fresh = GEN_POOL.filter((g) => !existing.has(g.input)).slice(0, 3);
    if (fresh.length === 0) { patchP(activeId, (cur) => ({ dsLog: [...cur.dsLog, "Generation pool exhausted in this mock."] })); return; }
    const jcfg = getJ(pr.projectId).cfg;
    const cost = fresh.length * callCost(jcfg.models.datasetGen, TOK.datasetGen.in, TOK.datasetGen.out, ratesRef.current);
    patchP(activeId, (cur) => ({
      dataset: [...cur.dataset, ...fresh.map((g) => mkCase(g.input, g.expected))],
      dsLog: [...cur.dsLog, `Generated ${fresh.length} case(s) with ${MODELS[jcfg.models.datasetGen].label} · ${fmt$(cost)}`],
    }));
    if (cycleRef.current && cycleRef.current.status === "active" && cycleRef.current.promptId === activeId) {
      updateCycle((x) => ({ ...x, spent: x.spent + cost }));
      log(`Dataset generation: ${fresh.length} case(s), ${fmt$(cost)}.`);
    }
  }
  function applySuggestionManual(ruleId, techniqueName) {
    createVersion(activeId, FIXERS[ruleId](getP(activeId).draft), `Applied: ${techniqueName}`, techniqueName);
  }
  function setHuman(versionN, caseId, val) {
    patchP(activeId, (cur) => ({ humanGrades: { ...cur.humanGrades, [versionN]: { ...(cur.humanGrades[versionN] || {}), [caseId]: val } } }));
  }

  const failingRules = liveValidation.filter((r) => r.status === "fail" && !p.dismissedSug.includes(r.id));
  const runStats = activeRun ? blendedStats(activeRun, p.humanGrades[currentV.n], w) : null;
  const q = search.trim().toLowerCase();
  const matches = (x) => !q || x.name.toLowerCase().includes(q) || x.tags.some((t) => t.includes(q));
  const modelOptions = (currentId) => Object.entries(MODELS).filter(([id]) => enabled[id] || id === currentId);

  const stageBanner = (icon, title, body, buttons) => (
    <div style={{ border: `0.5px solid ${COLORS.accent}55`, borderRadius: 10, padding: 13, background: COLORS.accentDim, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: body ? 5 : 10 }}>
        {icon}<span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>
      {body && <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.6 }}>{body}</div>}
      {can.edit && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{buttons}</div>}
      {!can.edit && <div style={{ fontSize: 11, color: COLORS.faint }}>Viewer role — read-only. A contributor or above drives this stage.</div>}
    </div>
  );
  const elsewhereNote = cycleActive && !cycleIsHere && (
    <div style={{ fontSize: 12, color: COLORS.faint, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <Repeat size={12} color={COLORS.accent} />
      A cycle is running on "{cyclePrompt.name}" ({projects[cycle.projectId].name}) — one cycle at a time.
      <button onClick={() => setActiveId(cycle.promptId)} style={{ background: "none", border: "none", color: COLORS.accent, fontSize: 12, cursor: "pointer", padding: 0 }}>Go to it</button>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} members={members} />;

  return (
    <div className="pew" style={{ background: COLORS.bg, borderRadius: 14, border: `0.5px solid ${COLORS.border}`, overflow: "hidden" }}>
      <style>{T}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" />

      {/* header */}
      <div style={{ padding: "12px 20px", borderBottom: `0.5px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ minWidth: 220 }}>
          {showGlobal ? (
            <div style={{ fontSize: 15, fontWeight: 600, paddingTop: 6 }}>Account</div>
          ) : (
            <>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 2 }}>Project: {proj.name}</div>
              <input className="pew-name-input" value={p.name} readOnly={!can.edit} onChange={(e) => renamePrompt(activeId, e.target.value)} spellCheck={false} title={can.edit ? "Rename prompt" : "Viewer role — read-only"} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                {p.tags.map((t) => (
                  <span key={t} className="pew-mono" style={{ fontSize: 10, color: COLORS.muted, background: COLORS.surface2, borderRadius: 4, padding: "2px 6px", display: "flex", alignItems: "center", gap: 4 }}>
                    {t}
                    {can.edit && <button onClick={() => removeTag(activeId, t)} style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 0, display: "flex" }}><X size={9} /></button>}
                  </span>
                ))}
                {can.edit && (
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addTag(activeId, tagInput); }}
                    placeholder="+ tag" className="pew-mono"
                    style={{ background: "transparent", border: "none", outline: "none", color: COLORS.muted, fontSize: 10, width: 60 }} />
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {cycle && (
            <div className="pew-mono" style={{ fontSize: 11, color: COLORS.muted, border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 8 }}>
              {cycle.config.auto ? <Bot size={12} color={cycleActive ? COLORS.accent : COLORS.faint} /> : <User size={12} color={cycleActive ? COLORS.accent : COLORS.faint} />}
              {cyclePrompt.name} · iter {cycle.iteration}/{cycle.config.maxIter} · {fmt$(cycle.spent)}/{fmt$(cycle.config.budget)}
              {cycle.scores.length > 0 && <span>· {cycle.scores.map((s) => s.score.toFixed(1)).join(" → ")}</span>}
            </div>
          )}
          {cycleActive && can.edit && <Btn tone="danger" small onClick={stopCycle}><Square size={11} /> Stop</Btn>}
          {!showGlobal && (
            <>
              <div className="pew-mono" style={{ fontSize: 11.5, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5, border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 8px" }}>
                <GitBranch size={12} /> v{currentV.n}{isDirty ? " (unsaved)" : ""}
              </div>
              {can.settings && (
                <button onClick={() => toggleArchive(activeId)} disabled={cycleIsHere} title={p.archived ? "Unarchive prompt" : "Archive prompt"}
                  style={{ background: "transparent", border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 7px", color: COLORS.muted, cursor: cycleIsHere ? "default" : "pointer", opacity: cycleIsHere ? 0.4 : 1, display: "flex" }}>
                  {p.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                </button>
              )}
              <button
                onClick={() => { setManualPreview(true); setTab("run"); }}
                disabled={running || cycleActive || !can.edit}
                title={!can.edit ? "Viewer role — read-only" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: running || cycleActive || !can.edit ? COLORS.surface2 : COLORS.accent,
                  color: running || cycleActive || !can.edit ? COLORS.muted : "#12141A",
                  border: "none", borderRadius: 7, padding: "7px 14px",
                  fontSize: 13, fontWeight: 600, cursor: running || cycleActive || !can.edit ? "default" : "pointer",
                }}
              >
                {running ? <Loader2 size={14} className="pew-pulse" /> : <Play size={14} />}
                {cycleActive ? "Cycle active" : running ? "Running…" : "Run once"}
              </button>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, borderLeft: `0.5px solid ${COLORS.border}`, paddingLeft: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11.5, fontWeight: 500 }}>{user.name}</div>
              <RoleBadge role={user.role} />
            </div>
            <button onClick={() => setShowGlobal(!showGlobal)} title="Global settings"
              style={{ background: showGlobal ? COLORS.accentDim : "transparent", border: `0.5px solid ${showGlobal ? COLORS.accent + "66" : COLORS.border}`, borderRadius: 6, padding: "5px 7px", color: showGlobal ? COLORS.accent : COLORS.muted, cursor: "pointer", display: "flex" }}>
              <Settings size={13} />
            </button>
            <button onClick={() => setUser(null)} title="Sign out" style={{ background: "transparent", border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 7px", color: COLORS.muted, cursor: "pointer", display: "flex" }}>
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </div>

      {showGlobal ? (
        <GlobalSettings
          user={user} members={members} changeMemberRole={changeMemberRole}
          audit={audit} can={can} rates={rates} setRates={setRates} enabled={enabled} setEnabled={setEnabled}
          apiKeys={apiKeys} setApiKeys={setApiKeys} privacy={privacy} setPrivacy={setPrivacy}
          onClose={() => setShowGlobal(false)} onDeleteAccount={deleteAccount} syncName={syncName}
        />
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 1.15fr", minHeight: 580 }}>
        {/* project / prompt tree */}
        <div style={{ borderRight: `0.5px solid ${COLORS.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={11} color={COLORS.faint} style={{ position: "absolute", left: 8, top: 8 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or tag…"
                style={{ ...inputStyle, paddingLeft: 24, fontSize: 11.5, padding: "5px 6px 5px 24px" }} />
            </div>
            {can.settings && (
              <button onClick={newProject} title="New project" style={{ background: "transparent", border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: 5, color: COLORS.muted, cursor: "pointer", display: "flex" }}>
                <Folder size={13} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, overflow: "auto" }} className="pew-scroll">
            {projOrder.map((jid) => {
              const j = projects[jid];
              const projPrompts = order.map((id) => prompts[id]).filter((x) => x.projectId === jid)
                .filter((x) => (showArchived || !x.archived)).filter(matches);
              const expanded = q ? projPrompts.length > 0 : !j.collapsed;
              if (q && projPrompts.length === 0) return null;
              return (
                <div key={jid}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 4px" }}>
                    <button onClick={() => patchJ(jid, (cur) => ({ collapsed: !cur.collapsed }))} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, flex: 1, textAlign: "left" }}>
                      {expanded ? <FolderOpen size={12} color={COLORS.accent} /> : <Folder size={12} color={COLORS.faint} />}
                      {can.settings ? (
                        <input className="pew-proj-input" value={j.name} onClick={(e) => e.stopPropagation()} onChange={(e) => patchJ(jid, { name: e.target.value })} spellCheck={false} />
                      ) : (
                        <span className="pew-proj-input" style={{ display: "inline-block" }}>{j.name}</span>
                      )}
                    </button>
                    {cycleActive && cycle.projectId === jid && <span className="pew-pulse" style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.accent }} />}
                    {can.edit && (
                      <button onClick={() => newPrompt(jid)} title="New prompt in this project" style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 2, display: "flex" }}>
                        <Plus size={12} />
                      </button>
                    )}
                  </div>
                  {expanded && projPrompts.map((x) => {
                    const best = bestScoreOf(x, projects[x.projectId].cfg.weights);
                    const sel = x.id === activeId;
                    const cyc = cycleActive && cycle.promptId === x.id;
                    return (
                      <button key={x.id} onClick={() => setActiveId(x.id)} style={{
                        background: sel ? COLORS.accentDim : "transparent",
                        border: `0.5px solid ${sel ? COLORS.accent + "55" : "transparent"}`,
                        borderRadius: 7, padding: "7px 8px 7px 20px", cursor: "pointer", textAlign: "left", width: "100%",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <FileText size={11} color={sel ? COLORS.accent : COLORS.faint} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: x.archived ? COLORS.faint : COLORS.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: x.archived ? "line-through" : "none" }}>{x.name}</span>
                          {cyc && <span className="pew-pulse" style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.accent }} />}
                          {best != null && <ScoreBadge value={best} />}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 3, marginLeft: 17, flexWrap: "wrap" }}>
                          <span className="pew-mono" style={{ fontSize: 9.5, color: COLORS.faint }}>v{x.versions[x.versions.length - 1].n}</span>
                          {x.tags.slice(0, 3).map((t) => (
                            <span key={t} className="pew-mono" style={{ fontSize: 9.5, color: COLORS.muted, background: COLORS.surface2, borderRadius: 3, padding: "0 4px" }}>{t}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: COLORS.faint, cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            show archived
          </label>
          <div style={{ fontSize: 9.5, color: COLORS.faint, lineHeight: 1.5 }}>
            Setup, models and budgets are per-project. Scores are per-prompt — private datasets are not comparable across prompts.
          </div>
        </div>

        {/* editor + validation + history */}
        <div style={{ borderRight: `0.5px solid ${COLORS.border}`, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted }}>Prompt{!can.edit && " (read-only)"}</span>
              {isDirty && !cycleIsHere && can.edit && (
                <button onClick={() => patchP(activeId, { draft: currentV.text })} style={{ background: "none", border: "none", color: COLORS.faint, fontSize: 11.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <RotateCcw size={11} /> revert
                </button>
              )}
            </div>
            <textarea
              value={p.draft} readOnly={!can.edit}
              onChange={(e) => can.edit && patchP(activeId, { draft: e.target.value })} spellCheck={false}
              className="pew-mono pew-scroll"
              style={{
                width: "100%", minHeight: 190, resize: "vertical",
                background: "#0F1116", color: can.edit ? COLORS.text : COLORS.muted,
                border: `0.5px solid ${isDirty ? COLORS.accent + "80" : COLORS.border}`,
                borderRadius: 8, padding: 12, fontSize: 12.5, lineHeight: 1.6, outline: "none",
              }}
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted }}>Static validation</span>
              <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint }}>0 model calls · live</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {liveValidation.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 9, padding: "7px 8px", borderRadius: 6, background: COLORS.surface }}>
                  <div style={{ marginTop: 1 }}><StatusIcon status={r.status} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 1 }}>{r.reason}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 8 }}>Advisory only — static catalogue rules, never a model.</div>
          </div>

          {p.versions.length > 1 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Version history</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {[...p.versions].reverse().map((v) => (
                  <div key={v.n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, background: v.n === currentV.n && !isDirty ? COLORS.accentDim : "transparent" }}>
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>
                      <span className="pew-mono" style={{ color: COLORS.text }}>v{v.n}</span> · {v.note}
                      {cycle && cycle.promptId === activeId && cycle.bestN === v.n && cycle.status === "ended" && (
                        <span style={{ color: COLORS.good, marginLeft: 6 }}><Flag size={10} style={{ display: "inline" }} /> best</span>
                      )}
                    </div>
                    {p.runsByVersion[v.n] && <ScoreBadge value={blendedStats(p.runsByVersion[v.n], p.humanGrades[v.n], w).composite} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* tabs */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 14, borderBottom: `0.5px solid ${COLORS.border}`, marginBottom: 16, flexWrap: "wrap" }}>
            <Tab active={tab === "setup"} onClick={() => setTab("setup")} icon={<Settings size={13} />} dot={cycleActive && cycle.stage === "ended"}>Setup</Tab>
            <Tab active={tab === "dataset"} onClick={() => setTab("dataset")} count={p.dataset.length} dot={cycleIsHere && cycle.stage === "dataset"}>Dataset</Tab>
            <Tab active={tab === "run"} onClick={() => setTab("run")} dot={cycleIsHere && ["preview", "running", "grade", "flat-warning"].includes(cycle.stage)}>Run</Tab>
            <Tab active={tab === "suggestions"} onClick={() => setTab("suggestions")} count={cycleIsHere && cycle.pending ? cycle.pending.candidates.length : (failingRules.length || undefined)} dot={cycleIsHere && cycle.stage === "suggest"}>Suggestions</Tab>
          </div>

          {tab === "setup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {elsewhereNote}
              {cycle && cycle.status === "ended" && (
                <div style={{ border: `0.5px solid ${END_REASONS[cycle.endReason].color}55`, borderRadius: 10, padding: 14, background: COLORS.surface }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Flag size={14} color={END_REASONS[cycle.endReason].color} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Cycle ended — {cyclePrompt.name}</span>
                    <span className="pew-mono" style={{ fontSize: 11, color: END_REASONS[cycle.endReason].color, border: `0.5px solid ${END_REASONS[cycle.endReason].color}55`, borderRadius: 5, padding: "2px 7px" }}>
                      {END_REASONS[cycle.endReason].label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.7 }}>
                    {cycle.iteration} iteration{cycle.iteration === 1 ? "" : "s"} · {fmt$(cycle.spent)} spent · all iterations retained.
                    {cycle.bestN != null && (
                      <> Best: <span className="pew-mono" style={{ color: COLORS.text }}>v{cycle.bestN}</span> at{" "}
                        <span className="pew-mono" style={{ color: scoreColor((cycle.scores.find((s) => s.n === cycle.bestN) || { score: 0 }).score) }}>
                          {(cycle.scores.find((s) => s.n === cycle.bestN) || { score: 0 }).score.toFixed(2)}
                        </span>.</>
                    )}
                  </div>
                  {can.edit && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      {cycle.endReason === "iteration-cap" && cycle.bestN != null && (
                        <Btn onClick={newCycleFromBest}><Repeat size={12} /> New cycle from best version</Btn>
                      )}
                      <Btn tone="ghost" onClick={() => { setCycle(null); cycleRef.current = null; }}>Clear</Btn>
                    </div>
                  )}
                </div>
              )}

              {!can.settings && (
                <div style={{ fontSize: 11.5, color: COLORS.faint, display: "flex", alignItems: "center", gap: 6 }}>
                  <Shield size={12} /> Project setup requires the maintainer role — shown read-only.
                </div>
              )}

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Cycle defaults — {proj.name}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Field label="Target score"><input type="number" step="0.5" min="1" max="10" disabled={cycleActive || !can.settings} value={cfg.target} onChange={(e) => setCfg({ ...cfg, target: +e.target.value })} className="pew-mono" style={inputStyle} /></Field>
                  <Field label="Max iterations"><input type="number" min="1" max="10" disabled={cycleActive || !can.settings} value={cfg.maxIter} onChange={(e) => setCfg({ ...cfg, maxIter: +e.target.value })} className="pew-mono" style={inputStyle} /></Field>
                  <Field label="Budget cap ($)"><input type="number" step="0.05" min="0.01" disabled={cycleActive || !can.settings} value={cfg.budget} onChange={(e) => setCfg({ ...cfg, budget: +e.target.value })} className="pew-mono" style={inputStyle} /></Field>
                  <Field label="Suggestions / iteration"><input type="number" min="1" max="4" disabled={cycleActive || !can.settings} value={cfg.nSug} onChange={(e) => setCfg({ ...cfg, nSug: Math.max(1, Math.min(4, +e.target.value)) })} className="pew-mono" style={inputStyle} /></Field>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.muted, cursor: "pointer", marginTop: 10 }}>
                  <input type="checkbox" checked={cfg.auto} disabled={cycleActive || !can.settings} onChange={(e) => setCfg({ ...cfg, auto: e.target.checked })} />
                  <Zap size={12} color={cfg.auto ? COLORS.accent : COLORS.faint} />
                  Auto mode — no pauses: dataset auto-approved, manual grading skipped, top-ranked suggestion applied, stops if the score goes flat
                </label>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Grader weights (composite blend)</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Field label="Code grader"><input type="number" step="0.1" min="0" max="2" disabled={cycleActive || !can.settings} value={cfg.weights.code} onChange={(e) => setCfg({ ...cfg, weights: { ...cfg.weights, code: +e.target.value } })} className="pew-mono" style={inputStyle} /></Field>
                  <Field label="Model grader"><input type="number" step="0.1" min="0" max="2" disabled={cycleActive || !can.settings} value={cfg.weights.model} onChange={(e) => setCfg({ ...cfg, weights: { ...cfg.weights, model: +e.target.value } })} className="pew-mono" style={inputStyle} /></Field>
                  <Field label="Human grader"><input type="number" step="0.1" min="0" max="2" disabled={cycleActive || !can.settings} value={cfg.weights.human} onChange={(e) => setCfg({ ...cfg, weights: { ...cfg.weights, human: +e.target.value } })} className="pew-mono" style={inputStyle} /></Field>
                </div>
                <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 6 }}>Human grades only affect cases you actually grade; ungraded cases blend code + model only.</div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Models per stage — {proj.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, background: COLORS.surface, fontSize: 12 }}>
                    <Lock size={12} color={COLORS.faint} />
                    <span style={{ flex: 1 }}>Prompt validation</span>
                    <span className="pew-mono" style={{ fontSize: 11, color: COLORS.faint }}>static · no model · $0</span>
                  </div>
                  {[["execution", "Target execution"], ["datasetGen", "Dataset generation"], ["grading", "Model grading"], ["suggestions", "Suggestion generation"]].map(([key, label]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 6, background: COLORS.surface, fontSize: 12 }}>
                      <span style={{ flex: 1 }}>{label}{!enabled[cfg.models[key]] && <span style={{ color: COLORS.mid, fontSize: 10.5 }}> (assigned model disabled in registry)</span>}</span>
                      <select
                        value={cfg.models[key]} disabled={cycleActive || !can.settings}
                        onChange={(e) => setCfg({ ...cfg, models: { ...cfg.models, [key]: e.target.value } })}
                        className="pew-mono" style={{ ...inputStyle, width: 170, padding: "4px 6px", fontSize: 11.5 }}
                      >
                        {modelOptions(cfg.models[key]).map(([id, m]) => (
                          <option key={id} value={id}>{m.label} (${rates[id].in}/${rates[id].out}){!enabled[id] ? " — disabled" : ""}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 6 }}>
                  {noKeys ? "No personal API key saved — using org credentials (mock). Add yours in Global settings." : "Using your personal API key from Global settings (mock)."}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Estimated spend for "{p.name}" ({p.dataset.length} cases · planning figures, not quotes)</div>
                <EstimateTable est={est} nCases={p.dataset.length} />
                <div className="pew-mono" style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 8, lineHeight: 1.8 }}>
                  Full cycle ({cfg.maxIter} iterations): ~{fmt$(est.totalCost * cfg.maxIter)} · {fmtK((est.totalIn + est.totalOut) * cfg.maxIter)} tokens
                </div>
                {iterationsAffordable < cfg.maxIter && (
                  <div style={{ fontSize: 11.5, color: COLORS.mid, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={12} /> Budget {fmt$(cfg.budget)} covers only ~{iterationsAffordable} of {cfg.maxIter} configured iterations.
                  </div>
                )}
              </div>

              {!cycleActive && can.edit && (
                <div><Btn onClick={startCycle}><Repeat size={13} /> Start cycle on "{p.name}"</Btn></div>
              )}

              {cycle && cycle.log.length > 0 && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 6 }}>Cycle log — {cyclePrompt.name}</div>
                  <div className="pew-mono pew-scroll" style={{ fontSize: 11, lineHeight: 1.8, color: COLORS.muted, background: "#0F1116", border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", maxHeight: 150, overflow: "auto" }}>
                    {cycle.log.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "dataset" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {elsewhereNote}
              {cycleIsHere && cycle.stage === "dataset" && stageBanner(
                <Pause size={13} color={COLORS.accent} />,
                "Paused: review the dataset",
                "Edit, add, or generate cases now — this prompt's private dataset freezes when the first run starts so scores stay comparable.",
                <Btn onClick={approveDataset}><CheckCircle2 size={12} /> Approve dataset &amp; continue</Btn>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 11.5, color: COLORS.faint, display: "flex", alignItems: "center", gap: 6 }}>
                  {!can.edit ? <><Lock size={11} /> Viewer role — read-only</> :
                    datasetLocked ? <><Lock size={11} /> Locked while the cycle runs — editable between cycles</> :
                    <>Private to "{p.name}" · freezes once a cycle's first run starts</>}
                </div>
                {!datasetLocked && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn tone="ghost" small onClick={addCase}><Plus size={11} /> Add case</Btn>
                    <Btn tone="ghost" small onClick={generateCases}><Sparkles size={11} /> Generate 3 with AI</Btn>
                  </div>
                )}
              </div>
              {p.dataset.map((c, idx) => (
                <div key={c.id} style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 10, background: COLORS.surface }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint, marginTop: 8 }}>{idx + 1}</span>
                    {datasetLocked ? (
                      <div style={{ fontSize: 12.5, lineHeight: 1.55, flex: 1, padding: "6px 0" }}>{c.input}</div>
                    ) : (
                      <textarea
                        value={c.input} rows={2} spellCheck={false} placeholder="Input text…"
                        onChange={(e) => updateCase(c.id, { input: e.target.value })}
                        className="pew-scroll"
                        style={{ ...inputStyle, flex: 1, resize: "vertical", fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}
                      />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {datasetLocked ? (
                        <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.muted, background: COLORS.surface2, borderRadius: 4, padding: "2px 6px" }}>expected: {c.expected}</span>
                      ) : (
                        <input value={c.expected} placeholder="expected…"
                          onChange={(e) => updateCase(c.id, { expected: e.target.value })}
                          className="pew-mono" style={{ ...inputStyle, width: 100, padding: "4px 6px", fontSize: 11 }} />
                      )}
                      {!datasetLocked && p.dataset.length > 2 && (
                        <button onClick={() => deleteCase(c.id)} style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 2 }} title="Delete case">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {p.dsLog.length > 0 && (
                <div className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint, lineHeight: 1.7 }}>
                  {p.dsLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>
          )}

          {tab === "run" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {elsewhereNote}
              {cycleIsHere && cycle.stage === "preview" && (() => {
                const e = estimateIteration(cycle.config.models, p.dataset.length, cycle.config.nSug, rates);
                const over = cycle.spent + e.totalCost > cycle.config.budget;
                return stageBanner(
                  <Braces size={13} color={COLORS.accent} />,
                  `Iteration ${cycle.iteration + 1} — projected cost before it starts`,
                  <>
                    <EstimateTable est={e} nCases={p.dataset.length} />
                    <div className="pew-mono" style={{ fontSize: 11.5, marginTop: 8, color: over ? COLORS.bad : COLORS.muted }}>
                      Remaining budget: {fmt$(cycle.config.budget - cycle.spent)}{over ? " — projection exceeds it; confirming will end the cycle (budget-cap)." : ""}
                    </div>
                  </>,
                  <>
                    <Btn onClick={confirmRun}><Play size={12} /> Confirm &amp; run iteration</Btn>
                    <Btn tone="danger" onClick={stopCycle}><Square size={12} /> Stop</Btn>
                  </>
                );
              })()}

              {manualPreview && !cycleActive && !running && (() => {
                const e = estimateIteration(cfg.models, p.dataset.length, 0, rates);
                return stageBanner(
                  <Braces size={13} color={COLORS.accent} />,
                  "Single run — projected cost",
                  <EstimateTable est={{ ...e, rows: e.rows.slice(0, 2), totalIn: e.rows[0].tin + e.rows[1].tin, totalOut: e.rows[0].tout + e.rows[1].tout, totalCost: e.rows[0].cost + e.rows[1].cost }} nCases={p.dataset.length} />,
                  <>
                    <Btn onClick={() => { setManualPreview(false); runEvaluation(activeId); }}><Play size={12} /> Confirm &amp; run</Btn>
                    <Btn tone="ghost" onClick={() => setManualPreview(false)}>Cancel</Btn>
                  </>
                );
              })()}

              {cycleIsHere && cycle.stage === "grade" && stageBanner(
                <Pause size={13} color={COLORS.accent} />,
                "Paused: review grades",
                "Expand any case below and add your own 0–10 grade — it blends into the composite as a third grader with the weight from Setup.",
                <Btn onClick={doChecks}><CheckCircle2 size={12} /> Continue to checks</Btn>
              )}

              {cycleIsHere && cycle.stage === "flat-warning" && (
                <div style={{ border: `0.5px solid ${COLORS.mid}66`, borderRadius: 10, padding: 14, background: COLORS.midDim }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <AlertTriangle size={14} color={COLORS.mid} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Cycle may not be converging</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
                    The score did not improve across the last two iterations. You can stop now without spending further, or continue.
                  </div>
                  {can.edit && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn onClick={continueAfterWarning}>Continue anyway</Btn>
                      <Btn tone="ghost" onClick={stopCycle}>Stop cycle</Btn>
                    </div>
                  )}
                </div>
              )}

              {!activeRun && !running && !manualPreview && !(cycleIsHere && cycle.stage === "preview") && (
                <div style={{ fontSize: 12.5, color: COLORS.muted, padding: "30px 4px", textAlign: "center" }}>
                  No run yet for v{currentV.n} of "{p.name}". {can.edit ? "Run once, or start a cycle from Setup." : "A contributor can run it."}
                </div>
              )}

              {((running && lastRunRef.current?.promptId === activeId) || activeRun) && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>composite</div>
                      {running || !runStats ? <span className="pew-mono" style={{ fontSize: 20, color: COLORS.muted }}>…</span> : <ScoreBadge value={runStats.composite} size="lg" />}
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>code grader</div>
                      <div className="pew-mono" style={{ fontSize: 15 }}>{running || !runStats ? "…" : runStats.codeAvg}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>model grader</div>
                      <div className="pew-mono" style={{ fontSize: 15 }}>{running || !runStats ? "…" : runStats.modelAvg}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>manual grades</div>
                      <div className="pew-mono" style={{ fontSize: 15 }}>{running || !runStats ? "…" : `${runStats.humanCount}/${p.dataset.length}`}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>cost</div>
                      <div className="pew-mono" style={{ fontSize: 15 }}>{fmt$(running ? runningCost : activeRun.cost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>cases</div>
                      <div className="pew-mono" style={{ fontSize: 15 }}>{running ? revealed : p.dataset.length} / {p.dataset.length}</div>
                    </div>
                  </div>
                  {running && <div style={{ fontSize: 11, color: COLORS.faint }}>≤3 concurrent model calls · streaming as cases complete</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(running && lastRunRef.current ? lastRunRef.current.result.cases.slice(0, revealed) : activeRun ? activeRun.cases : []).map((c) => {
                      const open = expandedCase === c.id;
                      const human = p.humanGrades[currentV.n]?.[c.id];
                      const blended = blendCase(c, human, w);
                      return (
                        <div key={c.id} className="pew-case-in" style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
                          <button
                            onClick={() => setExpandedCase(open ? null : c.id)}
                            style={{ width: "100%", background: COLORS.surface, border: "none", padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
                          >
                            {open ? <ChevronDown size={13} color={COLORS.muted} /> : <ChevronRight size={13} color={COLORS.muted} />}
                            <span style={{ fontSize: 12, flex: 1, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.input}</span>
                            <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint }}>code {c.code}</span>
                            <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.faint }}>model {c.model}</span>
                            {human != null && human !== "" && <span className="pew-mono" style={{ fontSize: 10.5, color: COLORS.accent }}>you {(+human).toFixed(1)}</span>}
                            <ScoreBadge value={blended} />
                          </button>
                          {open && (
                            <div style={{ padding: "10px 14px 14px", background: "#0F1116", fontSize: 12 }}>
                              <div style={{ color: COLORS.faint, fontSize: 10.5, marginBottom: 3 }}>rendered input</div>
                              <div className="pew-mono" style={{ color: COLORS.muted, marginBottom: 10, lineHeight: 1.6 }}>
                                input: "{c.input}"<br />expected: {c.expected}
                              </div>
                              <div style={{ color: COLORS.faint, fontSize: 10.5, marginBottom: 3 }}>grader reasoning</div>
                              <div style={{ color: COLORS.muted, lineHeight: 1.6, marginBottom: 10 }}>
                                {c.weakness
                                  ? `Weakness — ${c.weakness.toLowerCase()}. Classification: ${c.weakness}.`
                                  : "No recurring weakness. Format matched the schema and the output captured the key detail."}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: COLORS.faint, fontSize: 10.5 }}>your grade</span>
                                <input
                                  type="number" min="0" max="10" step="0.5"
                                  value={human ?? ""} placeholder="—" disabled={!can.edit}
                                  onChange={(e) => setHuman(currentV.n, c.id, e.target.value === "" ? null : Math.max(0, Math.min(10, +e.target.value)))}
                                  className="pew-mono"
                                  style={{ ...inputStyle, width: 70, padding: "4px 6px" }}
                                />
                                <span style={{ color: COLORS.faint, fontSize: 10.5 }}>blends at weight {w.human} → case score {blended.toFixed(1)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "suggestions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {elsewhereNote}
              {cycleIsHere && cycle.stage === "suggest" && cycle.pending && (
                <>
                  {stageBanner(
                    <Pause size={13} color={COLORS.accent} />,
                    `Paused: ${cycle.pending.candidates.length} candidate${cycle.pending.candidates.length > 1 ? "s" : ""} — select one to continue`,
                    "One technique each. Only the selected candidate is applied and run, so cost stays flat. You can also edit the prompt in the middle panel and continue with your edits.",
                    <>
                      <Btn onClick={() => acceptSelected()}><Sparkles size={12} /> Apply selected &amp; continue</Btn>
                      <Btn tone="ghost" onClick={() => acceptSelected(getP(cycle.promptId).draft)}>Continue with my edits</Btn>
                      <Btn tone="danger" onClick={stopCycle}><Square size={12} /> Stop</Btn>
                    </>
                  )}
                  {cycle.pending.candidates.map((cand, i) => {
                    const sel = cycle.pending.selected === i;
                    return (
                      <div key={cand.ruleId} onClick={() => can.edit && updateCycle((x) => ({ ...x, pending: { ...x.pending, selected: i } }))}
                        style={{ border: `0.5px solid ${sel ? COLORS.accent : COLORS.border}`, borderRadius: 10, padding: 12, background: sel ? COLORS.accentDim : COLORS.surface, cursor: can.edit ? "pointer" : "default" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 8, border: `1.5px solid ${sel ? COLORS.accent : COLORS.faint}`, background: sel ? COLORS.accent : "transparent", display: "inline-block" }} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{cand.name}</span>
                          {i === 0 && <span className="pew-mono" style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, borderRadius: 4, padding: "1px 6px" }}>top-ranked</span>}
                          <span className="pew-mono" style={{ fontSize: 10, color: COLORS.faint, marginLeft: "auto" }}>1 technique</span>
                        </div>
                        <DiffBlock oldText={cand.oldText} newText={cand.newText} maxHeight={150} />
                      </div>
                    );
                  })}
                </>
              )}

              {!(cycleIsHere && cycle.stage === "suggest") && (
                <>
                  {failingRules.length === 0 && !cycleActive && (
                    <div style={{ fontSize: 12.5, color: COLORS.muted, padding: "30px 4px", textAlign: "center" }}>
                      <CheckCircle2 size={18} color={COLORS.good} style={{ marginBottom: 8 }} />
                      <div>No open suggestions — every catalogue rule passes on this draft.</div>
                    </div>
                  )}
                  {!cycleActive && failingRules.map((r) => {
                    const fixed = FIXERS[r.id](p.draft);
                    return (
                      <div key={r.id} style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: COLORS.surface }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <Wand2 size={14} color={COLORS.accent} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                          <span className="pew-mono" style={{ fontSize: 10, color: COLORS.accent, background: COLORS.accentDim, borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>1 technique</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <Braces size={11} /> Evidence: failed validation rule.
                        </div>
                        <DiffBlock oldText={p.draft} newText={fixed} />
                        {can.edit && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <Btn onClick={() => applySuggestionManual(r.id, r.name)}><Sparkles size={12} /> Apply as new version</Btn>
                            <Btn tone="ghost" onClick={() => patchP(activeId, (cur) => ({ dismissedSug: [...cur.dismissedSug, r.id] }))}>Dismiss</Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
