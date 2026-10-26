import { ENV } from "./env.ts";
import { createGitLab } from "./gitlab.ts";
import { createGoogle } from "./google.ts";
import { createPostHog } from "./posthog.ts";
import { createSink } from "./sink.ts";

// What the ops jobs read from CI is declared in ../.env.schema: GitLab's
// predefined variables plus the project's CI/CD variables (.gitlab-ci.yml
// lists them). The schema marks them all optional, as heal:verify has no
// token; the ones every other job needs are checked here.
const required = (name: string, value: string | undefined): string => {
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`);
  }
  return value;
};

// PostHog Error Tracking for what the ops jobs report: none without the
// project's token.
export const errorSink = () => {
  const apiKey = ENV.NEXT_PUBLIC_POSTHOG_KEY;
  return apiKey === undefined || apiKey === ""
    ? undefined
    : createSink({ apiKey, host: ENV.POSTHOG_INGEST_HOST });
};

export const opsContext = () => {
  const gcpProject = required("GCP_PROJECT_ID", ENV.GCP_PROJECT_ID);
  const posthogKey = ENV.POSTHOG_PERSONAL_API_KEY;
  const posthogProject = ENV.POSTHOG_PROJECT_ID;
  return {
    env: {
      DUO_DEVELOPER_ACCOUNT: ENV.DUO_DEVELOPER_ACCOUNT,
      DUO_HEAL_ACCOUNT: ENV.DUO_HEAL_ACCOUNT,
      DUO_RELEASE_GUARD_ACCOUNT: ENV.DUO_RELEASE_GUARD_ACCOUNT,
      DUO_REVIEW_ACCOUNT: ENV.DUO_REVIEW_ACCOUNT,
      GCP_PROJECT_ID: gcpProject,
      // People whose agent::task label hands an issue to Duo. The token's
      // owner is always trusted.
      TRUSTED_USERS: (ENV.TRUSTED_USERS ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== ""),
    },
    gitlab: createGitLab({
      api: ENV.CI_API_V4_URL,
      project: required("CI_PROJECT_ID", ENV.CI_PROJECT_ID),
      projectPath: required("CI_PROJECT_PATH", ENV.CI_PROJECT_PATH),
      token: required("GITLAB_TOKEN", ENV.GITLAB_TOKEN),
    }),
    google: createGoogle(gcpProject),
    posthog:
      posthogKey === undefined || posthogProject === undefined
        ? undefined
        : createPostHog({
            apiKey: posthogKey,
            host: ENV.POSTHOG_HOST,
            projectId: posthogProject,
          }),
    sink: errorSink(),
  };
};
