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
