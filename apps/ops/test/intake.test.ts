import { describe, expect, it } from "vitest";

import type { Issue } from "../src/gitlab.ts";
import {
  MAX_DEV_SESSIONS_PER_DAY,
  acceptedBy,
  deniedReason,
  devGate,
  hasAcceptanceCriteria,
  intake,
  queued,
} from "../src/intake.ts";

const OWNER = "sami-m-g";
const NOW = new Date("2026-10-23T12:00:00Z");
const CRITERIA =
  "## Goal\n\nTidy.\n\n## Acceptance criteria\n\n- [ ] the README says X\n";

const issue = (iid: number, extra: Partial<Issue> = {}): Issue => ({
  assignees: [],
  author: { username: OWNER },
  description: CRITERIA,
  iid,
  labels: ["status::todo"],
  state: "opened",
  title: `tidy ${iid}`,
  updated_at: NOW.toISOString(),
  web_url: `https://gitlab.com/x/-/issues/${iid}`,
  ...extra,
});

const session = (status: string, createdAt = "2026-10-23T08:00:00Z") => ({
  createdAt,
  definition: "developer/v1",
  status,
});

const todoBy = (user: string, createdAt = "2026-10-23T09:00:00Z") => ({
  action: "add",
  createdAt,
  label: "status::todo",
  user,
});

describe("hasAcceptanceCriteria", () => {
  it("needs a criteria section with a real item", () => {
    expect(hasAcceptanceCriteria(CRITERIA)).toBe(true);
    expect(
      hasAcceptanceCriteria(
        "## Done when\n\n- the page loads\n\n## Out of scope\n"
      )
    ).toBe(true);
    expect(hasAcceptanceCriteria("## Goal\n\nTidy.")).toBe(false);
    expect(
      hasAcceptanceCriteria(
        "## Acceptance criteria\n\n<!-- Checkable statements. -->\n\n- [ ]\n- [ ]\n\n## Constraints\n\n- Follow AGENTS.md"
      )
    ).toBe(false);
    expect(hasAcceptanceCriteria(null)).toBe(false);
  });
});

describe("deniedReason", () => {
  it("flags issues about auth, infra or spending", () => {
    expect(
      deniedReason({ description: "", title: "Fix the OAuth callback" })
    ).toBe("OAuth");
    expect(
      deniedReason({ description: "Change infra/index.ts", title: "x" })
    ).toBe("infra");
    expect(
      deniedReason({ description: "Raise the Meta budget", title: "x" })
    ).toBe("budget");
    expect(
      deniedReason({ description: CRITERIA, title: "tidy" })
    ).toBeUndefined();
  });
});

describe("acceptedBy", () => {
  it("takes the latest todo label event, else the author", () => {
    expect(
      acceptedBy({ author: { username: "x" } }, [todoBy(OWNER)], OWNER)
    ).toBe(true);
    expect(
      acceptedBy(
        { author: { username: OWNER } },
        [todoBy(OWNER, "2026-10-22T09:00:00Z"), todoBy("mallory")],
        OWNER
      )
    ).toBe(false);
    expect(acceptedBy({ author: { username: OWNER } }, [], OWNER)).toBe(true);
    expect(acceptedBy({ author: { username: "mallory" } }, [], OWNER)).toBe(
      false
    );
  });
});

describe("queued", () => {
  it("orders by priority then age and skips taken issues", () => {
    const list = queued([
      issue(5, { labels: ["status::todo", "priority::2"] }),
      issue(9, { labels: ["status::todo", "priority::1"] }),
      issue(3),
      issue(7, { labels: ["status::todo", "priority::1"] }),
      issue(8, { assignees: [{ username: OWNER }] }),
      issue(10, { labels: ["status::todo", "agent::claude"] }),
      issue(11, { labels: ["status::intent"] }),
    ]);
    expect(list.map((i) => i.iid)).toEqual([7, 9, 5, 3]);
  });
});

describe("devGate", () => {
  it("allows one session at a time", () => {
    expect(devGate([session("RUNNING")], NOW)).toMatch(/running/u);
    expect(devGate([session("FINISHED")], NOW)).toBeUndefined();
  });

  it("stops at the daily cap", () => {
    const today = Array.from({ length: MAX_DEV_SESSIONS_PER_DAY }, () =>
      session("FINISHED")
    );
    expect(devGate(today, NOW)).toMatch(/cap/u);
    expect(
      devGate(
        today.map((s) => ({ ...s, createdAt: "2026-10-22T08:00:00Z" })),
        NOW
      )
    ).toBeUndefined();
  });
});

describe("intake", () => {
  const fake = (todo: Issue[], sessions = [session("FINISHED")]) => {
    const calls: { assigned: number[][]; notes: number[]; updates: number[] } =
      { assigned: [], notes: [], updates: [] };
    const gitlab = {
      createIssue: async () => await Promise.resolve(issue(0)),
      issueNotes: async () => await Promise.resolve([]),
      issues: async () => await Promise.resolve(todo),
      labelEvents: async () => await Promise.resolve([todoBy(OWNER)]),
      noteOnIssue: async (iid: number) => {
        calls.notes.push(iid);
        return await Promise.resolve({});
      },
      sessions: async () =>
        await Promise.resolve(
          sessions.map((s) => ({
            ...s,
            issue: undefined,
            mergeRequests: [],
            sourceType: "FLOW_TRIGGER",
            user: OWNER,
          }))
        ),
      updateIssue: async (iid: number, fields: Record<string, unknown>) => {
        calls.updates.push(iid);
        const ids: unknown = fields["assignee_ids"];
        if (Array.isArray(ids)) {
          calls.assigned.push(ids.map(Number));
        }
        return await Promise.resolve(issue(iid));
      },
      userId: async (username: string) =>
        await Promise.resolve(username === OWNER ? 1 : 2),
    };
    return { calls, gitlab };
  };
  const context = { loopUser: OWNER, now: NOW };

  it("hands the first eligible issue to Duo, sending denied ones to the owner", async () => {
    const { calls, gitlab } = fake([
      issue(1, { title: "Rotate the API token" }),
      issue(2, { description: "## Goal\n\nSomething." }),
      issue(3),
    ]);
    expect(await intake(gitlab, context)).toBe(
      "#3 assigned to duo-developer-gitlab-ai-hackathon"
    );
    expect(calls.assigned).toEqual([[1], [], [2]]);
    expect(calls.notes).toEqual([1, 2, 3]);
  });

  it("waits while a Developer session runs", async () => {
    const { calls, gitlab } = fake([issue(3)], [session("RUNNING")]);
    expect(await intake(gitlab, context)).toMatch(/waiting/u);
    expect(calls.updates).toEqual([]);
  });
});
