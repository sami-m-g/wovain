import { z } from "zod";

import { createGitLab } from "./gitlab.ts";
import { createGoogle } from "./google.ts";

// What the ops jobs read from CI: GitLab's predefined variables plus the
// project's CI/CD variables (.gitlab-ci.yml lists them). The Duo service
// account names default to the hackathon group's; override them when GitLab
// names them differently (Automate > Triggers shows each one).
const list = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x !== "")
  );

const envSchema = z.object({
  CI_API_V4_URL: z.url().default("https://gitlab.com/api/v4"),
  CI_PROJECT_ID: z.string(),
  CI_PROJECT_PATH: z.string(),
  DUO_DEVELOPER_ACCOUNT: z
    .string()
    .default("duo-developer-gitlab-ai-hackathon"),
  DUO_HEAL_ACCOUNT: z.string().default("ai-wovain-heal-gitlab-ai-hackathon"),
  DUO_REVIEW_ACCOUNT: z.string().default("duo-code-review-gitlab-ai-hackathon"),
  GCP_PROJECT_ID: z.string(),
  GITLAB_TOKEN: z.string(),
  // People whose agent::task label hands an issue to Duo. The token's owner
  // is always trusted.
  TRUSTED_USERS: list,
});

export const opsContext = () => {
  const env = envSchema.parse(process.env);
  return {
    env,
    gitlab: createGitLab({
      api: env.CI_API_V4_URL,
      project: env.CI_PROJECT_ID,
      projectPath: env.CI_PROJECT_PATH,
      token: env.GITLAB_TOKEN,
    }),
    google: createGoogle(env.GCP_PROJECT_ID),
  };
};
