import { tavily } from "@tavily/core";
import { z } from "zod";

import { analysisReport, funnelOf, marketIntent } from "./analysis.ts";
import type { Finding } from "./analysis.ts";
import { createGitLab } from "./gitlab.ts";
import { createGoogle, REQUESTS } from "./google.ts";
import { readRecords } from "./records.ts";
import { marker } from "./report.ts";

// The weekly job (.gitlab/ci/loop.yml, "wovain weekly" schedule): the data
// analysis (funnel, usage, costs) goes to the digest issue, and the market
// scout files one intent from competitors' news and the funnel's biggest
// drop-off. No model call: the intent is assembled from the data, so the
// ranking is deterministic and costs nothing to run.

const env = z
  .object({
    CI_API_V4_URL: z.url().default("https://gitlab.com/api/v4"),
    CI_PROJECT_ID: z.string(),
    CI_PROJECT_PATH: z.string(),
    CI_PROJECT_ROOT_NAMESPACE: z.string(),
    FIREBASE_PROJECT_ID: z.string(),
    GITLAB_TOKEN: z.string(),
    TAVILY_API_KEY: z.string().optional(),
  })
  .parse(process.env);

// Three basic searches a week: 3 Tavily credits.
const QUERIES = [
  "print on demand AI design tool new feature launch",
  "Printful OR Printify OR Gelato AI product design announcement",
  "AI video ads for print on demand sellers Meta",
];
const PER_QUERY = 3;

const now = new Date();
const week = { end: now, start: new Date(now.getTime() - 7 * 86_400_000) };
const gitlab = createGitLab({
  api: env.CI_API_V4_URL,
  project: env.CI_PROJECT_ID,
  projectPath: env.CI_PROJECT_PATH,
  token: env.GITLAB_TOKEN,
});
const google = createGoogle(env.FIREBASE_PROJECT_ID);

// Credits need the token's owner to be in the namespace; without that the
// report says "not readable".
const creditsOrNothing = async () => {
  try {
    return await gitlab.creditsUsed(env.CI_PROJECT_ROOT_NAMESPACE);
  } catch {
    return null;
  }
};

const search = async (): Promise<Finding[]> => {
  if (env.TAVILY_API_KEY === undefined) {
    return [];
  }
  const client = tavily({ apiKey: env.TAVILY_API_KEY });
  const replies = await Promise.all(
    QUERIES.map(async (query) => ({
      query,
      reply: await client.search(query, {
        maxResults: PER_QUERY,
        searchDepth: "basic",
        timeRange: "week",
        topic: "news",
      }),
    }))
  );
  return replies.flatMap(({ query, reply }) =>
    reply.results.flatMap((r) =>
      /^https?:\/\//u.test(r.url) ? [{ query, title: r.title, url: r.url }] : []
    )
  );
};

const [merchants, requests, instanceSeconds, credits, findings] =
  await Promise.all([
    readRecords(env.FIREBASE_PROJECT_ID),
    google.sum(REQUESTS, week),
    google.sum("run.googleapis.com/container/billable_instance_time", week),
    creditsOrNothing(),
    search(),
  ]);
const funnel = funnelOf(merchants);
const report = analysisReport(funnel, {
  duoCredits: credits,
  fal: merchants.reduce(
    (sum, m) => sum + m.ads.reduce((n, a) => n + a.videosReady, 0),
    0
  ),
  instanceSeconds,
  requests,
  tavilySearches: env.TAVILY_API_KEY === undefined ? 0 : QUERIES.length,
});

// One market intent a week, found again by its title.
const title = `market scout: week of ${now.toISOString().slice(0, 10)}`;
const existing = await gitlab.issues({ in: "title", search: title });
const filed =
  existing[0] ??
  (await gitlab.createIssue({
    description: `${marketIntent(findings, funnel)}\n${marker("market")}`,
    labels: "type::feature,status::intent,stage::plan",
    title,
  }));

const [digest] = await gitlab.issues({ labels: "digest", state: "opened" });
const body = `${report}\n\nMarket scout: #${filed.iid} (${findings.length} competitor items).`;
console.log(body);
if (digest !== undefined) {
  await gitlab.noteOnIssue(digest.iid, body);
}
