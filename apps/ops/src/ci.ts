import { z } from "zod";

import { createGitLab } from "./gitlab.ts";
import { createGoogle } from "./google.ts";

// What every ops job reads from CI: GitLab's predefined variables, the
// Firebase project and GITLAB_TOKEN (infra/index.ts sets the last two).
const ciEnvSchema = z.object({
  CI_API_V4_URL: z.url().default("https://gitlab.com/api/v4"),
  CI_PROJECT_ID: z.string(),
  CI_PROJECT_PATH: z.string(),
  FIREBASE_PROJECT_ID: z.string(),
  GITLAB_TOKEN: z.string(),
});

export const ciContext = () => {
  const env = ciEnvSchema.parse(process.env);
  return {
    env,
    gitlab: createGitLab({
      api: env.CI_API_V4_URL,
      project: env.CI_PROJECT_ID,
      projectPath: env.CI_PROJECT_PATH,
      token: env.GITLAB_TOKEN,
    }),
    google: createGoogle(env.FIREBASE_PROJECT_ID),
  };
};
