import { z } from "zod";

export const RoleSchema = z.enum(["viewer", "contributor", "maintainer", "administrator"]);

export const UserSchema = z.object({
  uid: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// Phase 5 — admin/members surface (web/features/members, web/features/settings-global).
export const MemberSchema = z.object({
  uid: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const AuditEntrySchema = z.object({
  actor: z.string(),
  action: z.string(),
  subject: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  ts: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ProjectCfgSchema = z.object({
  target: z.number(),
  maxIter: z.number(),
  budget: z.number(),
  nSug: z.number(),
  auto: z.boolean(),
  weights: z.object({ code: z.number(), model: z.number(), human: z.number() }),
  models: z.object({
    execution: z.string(),
    grading: z.string(),
    suggestions: z.string(),
    datasetGen: z.string(),
  }),
});
export type ProjectCfg = z.infer<typeof ProjectCfgSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cfg: ProjectCfgSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const PromptSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  archived: z.boolean(),
  bestScore: z.number().nullable(),
  latestVersion: z.number(),
});
export type Prompt = z.infer<typeof PromptSchema>;

export const VersionSchema = z.object({
  n: z.number(),
  text: z.string(),
  note: z.string().nullable(),
  technique: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().nullable(),
});
export type Version = z.infer<typeof VersionSchema>;

export const SuggestionSchema = z.object({
  ruleId: z.string(),
  technique: z.string(),
  evidence: z.string(),
  oldText: z.string(),
  newText: z.string(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const CaseSourceSchema = z.enum(["manual", "generated"]);

export const CaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  expected: z.string(),
  order: z.number(),
  source: CaseSourceSchema,
});
export type Case = z.infer<typeof CaseSchema>;

export const CaseResultSchema = z.object({
  index: z.number(),
  caseId: z.string(),
  output: z.string().nullable(),
  codeScore: z.number().nullable(),
  modelScore: z.number().nullable(),
  humanScore: z.number().nullable(),
  weakness: z.string().nullable(),
  reasoning: z.string().nullable(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  status: z.enum(["done", "error"]),
  error: z.string().nullable(),
});
export type CaseResult = z.infer<typeof CaseResultSchema>;

export const RunSchema = z.object({
  versionN: z.number(),
  status: z.enum(["running", "complete"]),
  composite: z.number().nullable(),
  codeAvg: z.number().nullable(),
  modelAvg: z.number().nullable(),
  costEstimate: z.number().nullable(),
  costActual: z.number().nullable(),
  startedBy: z.string(),
  startedAt: z.string().nullable(),
});
export type Run = z.infer<typeof RunSchema>;

export const CycleScoreSchema = z.object({ n: z.number(), score: z.number() });
export type CycleScore = z.infer<typeof CycleScoreSchema>;

export const CyclePendingSchema = z.object({
  candidates: z.array(SuggestionSchema),
  selected: z.number(),
});
export type CyclePending = z.infer<typeof CyclePendingSchema>;

export const CycleLogEntrySchema = z.object({ ts: z.string(), message: z.string() });
export type CycleLogEntry = z.infer<typeof CycleLogEntrySchema>;

export const CycleEndReasonSchema = z.enum([
  "target-met",
  "iteration-cap",
  "budget-cap",
  "user-stopped",
  "no-suggestions",
  "not-converging",
]);
export type CycleEndReason = z.infer<typeof CycleEndReasonSchema>;

export const CycleSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  projectId: z.string(),
  status: z.enum(["active", "ended"]),
  stage: z.enum(["dataset", "preview", "running", "grading", "checking", "suggesting", "ended"]),
  iteration: z.number(),
  spent: z.number(),
  scores: z.array(CycleScoreSchema),
  endReason: CycleEndReasonSchema.nullable(),
  bestN: z.number().nullable(),
  warnedFlat: z.boolean(),
  currentVersionN: z.number().nullable(),
  currentRunId: z.string().nullable(),
  pending: CyclePendingSchema.nullable(),
  configSnapshot: ProjectCfgSchema,
  log: z.array(CycleLogEntrySchema),
  startedBy: z.string(),
});
export type Cycle = z.infer<typeof CycleSchema>;

export const EstimateRowSchema = z.object({
  stage: z.string(),
  model: z.string(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  cost: z.number(),
});

export const EstimateSchema = z.object({
  rows: z.array(EstimateRowSchema),
  totalIn: z.number(),
  totalOut: z.number(),
  totalCost: z.number(),
  nCases: z.number(),
});
export type Estimate = z.infer<typeof EstimateSchema>;

// Phase 5 — global settings (web/features/settings-global).
export const ModelRatesSchema = z.object({
  label: z.string(),
  rateInPer1M: z.number(),
  rateOutPer1M: z.number(),
  enabled: z.boolean(),
});
export type ModelRates = z.infer<typeof ModelRatesSchema>;

export const ModelRegistrySchema = z.record(z.string(), ModelRatesSchema);
export type ModelRegistry = z.infer<typeof ModelRegistrySchema>;

// PATCH /admin/model-registry returns just the one updated entry (with its id), not the
// full registry map — a distinct shape from ModelRegistrySchema's GET response.
export const ModelRegistryEntrySchema = ModelRatesSchema.extend({ modelId: z.string() });
export type ModelRegistryEntry = z.infer<typeof ModelRegistryEntrySchema>;

export const PrivacySettingsSchema = z.object({
  retentionDays: z.number(),
  telemetry: z.boolean(),
});
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;
