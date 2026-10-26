// The hackathon submissions (docs/submissions/): the submission:tag job tags
// the commit judges see at each deadline, as submission/<name>.
export interface Submission {
  /** The deadline, a UTC instant. */
  deadline: string;
  /** The hackathon's Devpost page; add it once known. */
  devpost?: string;
  /** The tag is submission/<name>. */
  name: string;
}

export const submissions: readonly Submission[] = [
  {
    deadline: "2026-10-26T21:00:00Z",
    devpost: "https://learn-ai-basics.devpost.com/",
    name: "basics",
  },
  {
    deadline: "2026-10-27T13:00:00Z",
    devpost: "https://gitlab-transcend.devpost.com/",
    name: "transcend",
  },
  // 10:00 PDT.
  {
    deadline: "2026-10-30T17:00:00Z",
    devpost: "https://nebiusglobalaihackathon.devpost.com/",
    name: "nebius",
  },
  // 23:45 EDT on 2026-10-30.
  {
    deadline: "2026-10-31T03:45:00Z",
    devpost: "https://qloo.devpost.com/",
    name: "qloo",
  },
];

export interface MainPipeline {
  finishedAt: string | null;
  id: number;
  sha: string;
  source: string;
  status: string;
  webUrl: string;
}

// The newest main pipeline that went green by the deadline. Only pushes
// count: scheduled and manual ops pipelines run no real jobs, so their
// "success" says nothing about the commit.
export const latestGreenBefore = (
  pipelines: readonly MainPipeline[],
  deadline: string
): MainPipeline | undefined => {
  const limit = Date.parse(deadline);
  let best: MainPipeline | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const pipeline of pipelines) {
    if (
      pipeline.status !== "success" ||
      pipeline.source !== "push" ||
      pipeline.finishedAt === null
    ) {
      continue;
    }
    const time = Date.parse(pipeline.finishedAt);
    if (time <= limit && time > bestTime) {
      best = pipeline;
      bestTime = time;
    }
  }
  return best;
};

export const tagName = (submission: Submission): string =>
  `submission/${submission.name}`;

export const tagMessage = (
  submission: Submission,
  pipeline: MainPipeline,
  production?: string
): string =>
  [
    `Submission: ${submission.name}`,
    `Deadline: ${submission.deadline}`,
    `Commit: ${pipeline.sha}`,
    `Pipeline: ${pipeline.webUrl} (finished ${pipeline.finishedAt ?? "unknown"})`,
    `Production deployment at the deadline: ${production ?? "unknown"}`,
    ...(submission.devpost ? [`Devpost: ${submission.devpost}`] : []),
  ].join("\n");
