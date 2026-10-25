import { describe, expect, it } from "vitest";

import type { Issue, Note } from "../src/gitlab.ts";
import {
  MAX_TASK_RUNS_PER_DAY,
  hasAcceptanceCriteria,
  taskBlocker,
  taskBudget,
} from "../src/intake.ts";

const issue = (overrides: Partial<Issue> = {}): Issue => ({
  assignees: [],
  author: { username: "scout-bot" },
  created_at: "2026-10-25T09:00:00Z",
  description: "## Goal\n\nX\n\n## Acceptance criteria\n\n- [ ] it works\n",
  id: 70,
  iid: 7,
  issue_type: "issue",
  labels: ["agent::task"],
  state: "opened",
  title: "Do X",
  web_url: "https://gitlab.com/x/-/issues/7",
  ...overrides,
});
const added = (user: string, createdAt = "2026-10-25T10:00:00Z") => ({
  action: "add",
  createdAt,
  label: "agent::task",
  user,
});
const note = (overrides: Partial<Note>): Note => ({
  author: { username: "owner" },
  body: "",
  created_at: "2026-10-25T11:00:00Z",
  system: false,
  ...overrides,
});
const trusted = new Set(["owner"]);
const base = { duoAccounts: ["duo-dev"], notes: [], trusted };

describe("taskBlocker", () => {
  it("accepts a task a trusted user labelled", () => {
    expect(
      taskBlocker({ ...base, events: [added("owner")], issue: issue() })
    ).toBeUndefined();
  });

  it("accepts a template issue a trusted user filed with the label", () => {
    expect(
      taskBlocker({
        ...base,
        events: [],
        issue: issue({ author: { username: "owner" } }),
      })
    ).toBeUndefined();
  });

  it("refuses a label from anyone else", () => {
    expect(
      taskBlocker({ ...base, events: [added("stranger")], issue: issue() })
    ).toContain("trusted");
    expect(taskBlocker({ ...base, events: [], issue: issue() })).toContain(
      "trusted"
    );
  });

  it("refuses an issue edited after it was accepted", () => {
    expect(
      taskBlocker({
        ...base,
        events: [added("owner")],
        issue: issue(),
        notes: [note({ body: "changed the description", system: true })],
      })
    ).toContain("edited");
  });

  it("refuses comments from untrusted users, not from Duo", () => {
    const events = [added("owner")];
    expect(
      taskBlocker({
        ...base,
        events,
        issue: issue(),
        notes: [note({ author: { username: "stranger" } })],
      })
    ).toContain("stranger");
    expect(
      taskBlocker({
        ...base,
        events,
        issue: issue(),
        notes: [note({ author: { username: "duo-dev" } })],
      })
    ).toBeUndefined();
  });

  it("needs acceptance criteria", () => {
    expect(
      taskBlocker({
        ...base,
        events: [added("owner")],
        issue: issue({ description: "## Goal\n\nX" }),
      })
    ).toBe("no acceptance criteria");
  });
});

describe("hasAcceptanceCriteria", () => {
  it("ignores the template's empty checkboxes and comments", () => {
    expect(
      hasAcceptanceCriteria(
        "## Acceptance criteria\n\n<!-- hint -->\n\n- [ ]\n\n## Files"
      )
    ).toBe(false);
  });
});

describe("taskBudget", () => {
  const now = new Date("2026-10-25T12:00:00Z");

  it("caps in-flight tasks and daily runs", () => {
    expect(taskBudget({ inFlight: 0, now, sessions: [] })).toBe(2);
    expect(taskBudget({ inFlight: 2, now, sessions: [] })).toBe(0);
    const today = Array.from({ length: MAX_TASK_RUNS_PER_DAY }, () => ({
      createdAt: "2026-10-25T08:00:00Z",
      definition: "developer/v1",
    }));
    expect(taskBudget({ inFlight: 0, now, sessions: today })).toBe(0);
    expect(
      taskBudget({
        inFlight: 0,
        now,
        sessions: today.map((s) => ({ ...s, definition: "code_review/v1" })),
      })
    ).toBe(2);
  });
});
