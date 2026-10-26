/* oxlint-disable eslint/no-await-in-loop -- sequential on purpose: newest first, one tag at a time */
import { appendFile } from "node:fs/promises";

import { z } from "zod";

import { apiUrl } from "./api-url.ts";
import { ENV } from "./env.ts";
import {
  latestGreenBefore,
  submissions,
  tagMessage,
  tagName,
} from "./submissions.ts";
import type { MainPipeline } from "./submissions.ts";

// The submission:tag job (.gitlab/ci/ops.yml), on the "wovain ops" schedule:
// once a deadline (submissions.ts) has passed and submission/<name> doesn't
// exist, creates that annotated tag at the newest main commit that was green
// by the deadline, plus a release linking Devpost. Idempotent. Names the new
// tags in created-tags.txt, which the job pushes to GitHub.

const MAX_CANDIDATES = 100;
const token = ENV.GITLAB_TOKEN;
const project = ENV.CI_PROJECT_ID;
if (!token || !project) {
  throw new Error("GITLAB_TOKEN and CI_PROJECT_ID must be set");
}
const base = `${ENV.CI_API_V4_URL}/projects/${project}`;

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(apiUrl(base, path), {
    ...init,
    headers: {
      "content-type": "application/json",
      "private-token": token,
    },
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(
      `GitLab ${init?.method ?? "GET"} ${path.split("?")[0]}: ${response.status}`
    );
  }
  return await response.json();
};

const listSchema = z.array(
  z.object({
    id: z.int(),
    sha: z.string(),
    source: z.string(),
    status: z.string(),
    web_url: z.string(),
  })
);
const detailSchema = z.object({ finished_at: z.string().nullable() });

// Successful main pushes, newest first, with finish times, up to the first
// one finished by the deadline (the answer).
const mainPipelines = async (deadline: string): Promise<MainPipeline[]> => {
  const listed = listSchema.parse(
    await call(
      `/pipelines?ref=main&status=success&source=push&order_by=id&sort=desc&per_page=${MAX_CANDIDATES}`
    )
  );
  const found: MainPipeline[] = [];
  for (const p of listed) {
    const { finished_at: finishedAt } = detailSchema.parse(
      await call(`/pipelines/${p.id}`)
    );
    found.push({
      finishedAt,
      id: p.id,
      sha: p.sha,
      source: p.source,
      status: p.status,
      webUrl: p.web_url,
    });
    if (finishedAt !== null && Date.parse(finishedAt) <= Date.parse(deadline)) {
      break;
    }
  }
  return found;
};

// The production deployment live at the deadline: the newest successful one
// finished before it.
const productionAt = async (deadline: string): Promise<string | undefined> => {
  const [latest] = z
    .array(z.object({ ref: z.string(), sha: z.string() }))
    .parse(
      (await call(
        `/deployments?environment=production&status=success&order_by=finished_at&sort=desc&finished_before=${encodeURIComponent(deadline)}&per_page=1`
      )) ?? []
    );
  return latest ? `${latest.ref}@${latest.sha}` : undefined;
};

const now = Date.now();
for (const submission of submissions) {
  const name = tagName(submission);
  if (Date.parse(submission.deadline) > now) {
    console.log(`${name}: deadline ${submission.deadline} not reached`);
    continue;
  }
  if (
    (await call(`/repository/tags/${encodeURIComponent(name)}`)) !== undefined
  ) {
    console.log(`${name}: exists`);
    continue;
  }
  const pipeline = latestGreenBefore(
    await mainPipelines(submission.deadline),
    submission.deadline
  );
  if (!pipeline) {
    throw new Error(`${name}: no green main pipeline before the deadline`);
  }
  await call("/repository/tags", {
    body: JSON.stringify({
      message: tagMessage(
        submission,
        pipeline,
        await productionAt(submission.deadline)
      ),
      ref: pipeline.sha,
      tag_name: name,
    }),
    method: "POST",
  });
  const devpost = submission.devpost
    ? `Devpost: ${submission.devpost}\n\n`
    : "";
  await call("/releases", {
    body: JSON.stringify({
      description: `${devpost}The code judges see for the ${submission.name} submission: main at ${pipeline.sha}, green by ${submission.deadline} (${pipeline.webUrl}).`,
      name: `Submission: ${submission.name}`,
      tag_name: name,
    }),
    method: "POST",
  });
  await appendFile("created-tags.txt", `${name}\n`);
  console.log(`${name}: created at ${pipeline.sha}`);
}
