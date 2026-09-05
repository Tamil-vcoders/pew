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
