import { describe, expect, it } from "vitest";

import {
  MAX_FIX_RUNS_PER_DAY,
  MAX_FIX_RUNS_PER_HOUR,
  classify,
  decideFix,
  fingerprintOf,
  reviewSkipReason,
} from "../src/gates.ts";
import type { Failure, FixState } from "../src/gates.ts";

const NOW = new Date("2026-10-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const failure = (over: Partial<Failure> = {}): Failure => ({
  duoStarted: false,
  failureClass: "code",
  fingerprint: "rm-0000000001",
  job: "verify",
  persisted: true,
  retried: true,
  ...over,
});

const state = (over: Partial<FixState> = {}): FixState => ({
  activeFixSessions: 0,
  failures: [failure()],
  fixSessionStarts: [],
  now: NOW,
  openFixMergeRequests: [],
  ...over,
});

describe("classify: only code jobs with a code failure go to Duo", () => {
  it.each(["verify", "build", "integration", "stories", "e2e"])(
    "%s with a failed script and a plain test failure is code",
    (name) => {
      expect(
        classify({
          failureReason: "script_failure",
          logTail:
            "FAIL test/unit/score.test.ts > ranks ideas\nexpected 2 to be 3",
          name,
        })
      ).toBe("code");
    }
  );

  it.each([
    "infra:production",
    "deploy:production",
    "sci",
    "mirror:github",
    "release",
    "renovate",
    "smoke:production",
    "loop",
  ])("%s is never Duo's, whatever its log says", (name) => {
    expect(
      classify({ failureReason: "script_failure", logTail: "", name })
    ).toBe("not-code-job");
  });

  it.each([
    ["auth", "error: googleapi: Error 403: Permission denied on resource"],
    ["auth", "PERMISSION_DENIED: caller does not have permission"],
    ["auth", "HTTP 404 Not Found from the workload identity token exchange"],
    ["auth", "401 Unauthorized: invalid token"],
    ["quota", "RESOURCE_EXHAUSTED: Quota exceeded for quota metric"],
    ["quota", "429 Too Many Requests"],
    ["network", "Error: getaddrinfo EAI_AGAIN registry.npmjs.org"],
    ["network", "ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/x"],
    ["network", "503 Service Unavailable"],
  ])("a code job whose log shows %s goes to a human", (cls, logTail) => {
    expect(
      classify({ failureReason: "script_failure", logTail, name: "verify" })
    ).toBe(cls);
  });

  it.each(["runner_system_failure", "stuck_or_timeout_failure", "api_failure"])(
    "a %s is the runner's, not the code's",
    (failureReason) => {
      expect(classify({ failureReason, logTail: "", name: "verify" })).toBe(
        "runner"
      );
    }
  );
});

describe("fingerprintOf", () => {
  it("depends on the job and the failed tests, not their order", () => {
    const a = fingerprintOf("verify", "code", ["a › one", "b › two"]);
    expect(a).toMatch(/^rm-[0-9a-f]{10}$/u);
    expect(fingerprintOf("verify", "code", ["b › two", "a › one"])).toBe(a);
    expect(fingerprintOf("verify", "code", ["a › one"])).not.toBe(a);
    expect(
      fingerprintOf("integration", "code", ["a › one", "b › two"])
    ).not.toBe(a);
  });
});

describe("decideFix: Duo only when all gates pass", () => {
  it("starts Duo for a new, confirmed code failure", () => {
    expect(decideFix(state())).toStrictEqual({
      action: "duo",
      fingerprints: ["rm-0000000001"],
    });
  });

  it("does nothing on a green pipeline", () => {
    expect(decideFix(state({ failures: [] })).action).toBe("none");
  });

  it.each(["not-code-job", "auth", "quota", "network", "runner"] as const)(
    "leaves a %s failure to a human, even next to a code failure",
    (failureClass) => {
      const decision = decideFix(
        state({
          failures: [
            failure(),
            failure({ failureClass, fingerprint: "rm-0000000002" }),
          ],
        })
      );
      expect(decision.action).toBe("none");
    }
  );

  it("doesn't call Duo twice for the same fingerprint", () => {
    expect(
      decideFix(state({ failures: [failure({ duoStarted: true })] })).action
    ).toBe("none");
  });

  it("retries a first failure once instead of calling Duo", () => {
    expect(
      decideFix(
        state({ failures: [failure({ persisted: false, retried: false })] })
      )
    ).toStrictEqual({ action: "retry", jobs: ["verify"] });
  });

  it("waits while the retry hasn't failed yet", () => {
    expect(
      decideFix(
        state({ failures: [failure({ persisted: false, retried: true })] })
      ).action
    ).toBe("none");
  });

  it("skips while a Duo fix MR is open", () => {
    expect(decideFix(state({ openFixMergeRequests: [12] })).action).toBe(
      "none"
    );
  });

  it("skips while a Fix CI/CD session is running", () => {
    expect(decideFix(state({ activeFixSessions: 1 })).action).toBe("none");
  });

  it(`allows ${MAX_FIX_RUNS_PER_HOUR} run an hour`, () => {
    expect(decideFix(state({ fixSessionStarts: [hoursAgo(0.5)] })).action).toBe(
      "none"
    );
    expect(decideFix(state({ fixSessionStarts: [hoursAgo(1.5)] })).action).toBe(
      "duo"
    );
  });

  it(`allows ${MAX_FIX_RUNS_PER_DAY} runs a day`, () => {
    const day = [hoursAgo(2), hoursAgo(8), hoursAgo(20)];
    expect(decideFix(state({ fixSessionStarts: day })).action).toBe("none");
    expect(
      decideFix(state({ fixSessionStarts: [...day.slice(1), hoursAgo(30)] }))
        .action
    ).toBe("duo");
  });
});

describe("reviewSkipReason: Duo Code Review only for app code", () => {
  const mr = { draft: false, sourceBranch: "42-fix-score" };

  it("reviews a ready MR that changes application code", () => {
    expect(
      reviewSkipReason({
        ...mr,
        paths: ["apps/server/src/lib/score.ts", "docs/loop.md"],
      })
    ).toBeUndefined();
  });

  it.each([
    ["draft", { ...mr, draft: true, paths: ["apps/server/src/lib/score.ts"] }],
    [
      "Renovate update",
      {
        ...mr,
        paths: ["apps/server/src/lib/score.ts"],
        sourceBranch: "renovate/vitest-5.x",
      },
    ],
    ["docs only", { ...mr, paths: ["docs/loop.md", "README.md"] }],
    ["lockfile only", { ...mr, paths: ["pnpm-lock.yaml"] }],
    ["no application code", { ...mr, paths: [".gitlab/ci/verify.yml"] }],
  ])("skips: %s", (reason, candidate) => {
    expect(reviewSkipReason(candidate)).toBe(reason);
  });
});
