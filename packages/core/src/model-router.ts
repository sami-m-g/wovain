// Which Nemotron model each kind of job runs on (Nebius Token Factory).
// Every model ID is an env var (apps/web/.env.schema), set per environment
// from Pulumi config (infra/index.ts, `nemotronModel<Role>[-<env>]`); code
// holds none. Agents ask for a role, never a model ID:
// - fast: guardrails, scorers, classifiers, short replies.
// - default: briefs, ad copy, most agent steps.
// - reasoning: long plans and the judge's reasoning.
// - vision: reads images (the design judge's eyes).
// - safety: content safety and policy checks.

export const MODEL_ROLES = [
  "fast",
  "default",
  "reasoning",
  "vision",
  "safety",
] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export interface ModelRouterConfig {
  NEMOTRON_MODEL_DEFAULT: string;
  NEMOTRON_MODEL_FAST: string;
  NEMOTRON_MODEL_REASONING: string;
  NEMOTRON_MODEL_SAFETY: string;
  NEMOTRON_MODEL_VISION: string;
}

export const MODEL_ENV = {
  default: "NEMOTRON_MODEL_DEFAULT",
  fast: "NEMOTRON_MODEL_FAST",
  reasoning: "NEMOTRON_MODEL_REASONING",
  safety: "NEMOTRON_MODEL_SAFETY",
  vision: "NEMOTRON_MODEL_VISION",
} as const satisfies Record<ModelRole, keyof ModelRouterConfig>;

export interface ModelRouter {
  // The model ID for a role.
  modelFor: (role: ModelRole) => string;
  // Every role's model, e.g. for the "which model does what" table.
  models: Readonly<Record<ModelRole, string>>;
}

export const createModelRouter = (env: ModelRouterConfig): ModelRouter => {
  const models = Object.fromEntries(
    MODEL_ROLES.map((role) => {
      const id = env[MODEL_ENV[role]].trim();
      if (id === "") {
        throw new Error(`${MODEL_ENV[role]} is empty: set a Nemotron model ID`);
      }
      return [role, id];
    })
  ) as Record<ModelRole, string>;
  return { modelFor: (role) => models[role], models };
};
