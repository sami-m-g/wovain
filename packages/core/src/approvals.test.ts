import { beforeEach, describe, expect, it } from "vitest";

import { ApprovalError, createApprovals } from "./approvals";
import type {
  Approval,
  ApprovalStore,
  AuditEntry,
  EnqueueInput,
} from "./approvals";
import type { AutonomySettings } from "./autonomy";
import type { WovainEvent } from "./events";

// An in-memory ApprovalStore with the same contract as the Drizzle one
// (packages/api/src/flow/approvals.ts).
const memoryStore = () => {
  const rows = new Map<string, Approval>();
  const audit: AuditEntry[] = [];
  let next = 0;
  const store: ApprovalStore = {
    audit: (entry) => {
      audit.push(entry);
      return Promise.resolve();
    },
    get: (userId, id) => {
      const row = rows.get(id);
      return Promise.resolve(row?.userId === userId ? row : undefined);
    },
    insert: (row) => {
      const earlier = [...rows.values()].find(
        (r) =>
          r.userId === row.userId &&
          row.idempotencyKey !== null &&
          r.idempotencyKey === row.idempotencyKey
      );
      if (earlier !== undefined) {
        return Promise.resolve({ approval: earlier, created: false });
      }
      next += 1;
      const at = new Date(0);
      const approval = { ...row, createdAt: at, id: `a${next}`, updatedAt: at };
      rows.set(approval.id, approval);
      return Promise.resolve({ approval, created: true });
    },
    list: ({ domain, statuses, userId }) =>
      Promise.resolve(
        [...rows.values()]
          .filter(
            (r) =>
              r.userId === userId &&
              (domain === undefined || r.domain === domain) &&
              (statuses === undefined || statuses.includes(r.status))
          )
          .toReversed()
      ),
    update: (userId, id, from, patch) => {
      const row = rows.get(id);
      const allowed =
        row !== undefined && row.userId === userId && from.includes(row.status);
      if (allowed) {
        rows.set(id, { ...row, ...patch });
      }
      return Promise.resolve(allowed ? rows.get(id) : undefined);
    },
  };
  return { audit, rows, store };
};

const USER = "user-1";
const NOW = new Date("2026-10-28T12:00:00Z");

const draft: AutonomySettings = {
  dailySpendCapCents: 5000,
  level: "draft",
  monthlySpendCapCents: 50_000,
  paused: false,
};

const refund: EnqueueInput = {
  costPreview: {
    amountCents: 3200,
    chargeToCardCents: 0,
    currency: "USD",
    label: "Refund $32.00 to the customer",
  },
  payload: { orderId: "T4YTE8HA" },
  proposedBy: "voice",
  title: "Refund order T4YTE8HA",
  type: "store.order.refund",
  userId: USER,
};

describe("approvals", () => {
  let memory: ReturnType<typeof memoryStore>;
  let events: WovainEvent[];
  let approvals: ReturnType<typeof createApprovals>;

  beforeEach(() => {
    memory = memoryStore();
    events = [];
    approvals = createApprovals({
      emit: (event) => {
        events.push(event);
        return Promise.resolve();
      },
      now: () => NOW,
      store: memory.store,
    });
  });

  it("queues a refund for the merchant with its cost preview", async () => {
    const { approval, decision } = await approvals.enqueue(refund, draft);
    expect(decision.verdict).toBe("needs_approval");
    expect(approval).toMatchObject({
      costPreview: { amountCents: 3200 },
      decidedBy: null,
      domain: "store",
      risk: "R4",
      status: "pending",
    });
    expect(events).toEqual([
      {
        data: {
          actionType: "store.order.refund",
          approvalId: approval.id,
          domain: "store",
          risk: "R4",
          userId: USER,
        },
        name: "wovain/approval.requested",
      },
    ]);
    expect(memory.audit.map((entry) => entry.event)).toEqual(["enqueued"]);
  });

  it("approves what the policy allows at once, as the policy", async () => {
    const { approval } = await approvals.enqueue(
      {
        payload: { designId: "d1" },
        proposedBy: "autopilot",
        title: "Create a hidden product",
        type: "store.product.create_hidden",
        userId: USER,
      },
      draft
    );
    expect(approval).toMatchObject({
      decidedAt: NOW,
      decidedBy: "policy",
      policyReason: "within_level",
      status: "approved",
    });
    expect(events.map((event) => event.name)).toEqual([
      "wovain/approval.decided",
    ]);
    expect(memory.audit.map((entry) => entry.event)).toEqual([
      "enqueued",
      "approved",
    ]);
  });

  it("denies spend past the cap and records it", async () => {
    const { approval } = await approvals.enqueue(
      {
        payload: { campaignId: "c1" },
        proposedBy: "optimizer",
        spendCents: 9000,
        title: "Launch the campaign",
        type: "media.campaign.activate",
        userId: USER,
      },
      draft
    );
    expect(approval).toMatchObject({
      payload: { campaignId: "c1", spendCents: 9000 },
      policyReason: "over_daily_cap",
      status: "denied",
    });
  });

  it("returns the first approval for a retried idempotency key", async () => {
    const first = await approvals.enqueue(
      { ...refund, idempotencyKey: "refund:T4YTE8HA" },
      draft
    );
    const again = await approvals.enqueue(
      { ...refund, idempotencyKey: "refund:T4YTE8HA" },
      draft
    );
    expect(again.created).toBe(false);
    expect(again.approval.id).toBe(first.approval.id);
    expect(memory.rows.size).toBe(1);
    expect(events).toHaveLength(1);
  });

  it("records the merchant's approval, once", async () => {
    const { approval } = await approvals.enqueue(refund, draft);
    const decided = await approvals.decide(
      { approvalId: approval.id, approve: true, decidedBy: USER, userId: USER },
      draft
    );
    expect(decided).toMatchObject({
      decidedAt: NOW,
      decidedBy: USER,
      status: "approved",
    });
    expect(events.at(-1)).toMatchObject({
      data: { decidedBy: USER, status: "approved" },
      name: "wovain/approval.decided",
    });
    await expect(
      approvals.decide(
        {
          approvalId: approval.id,
          approve: false,
          decidedBy: USER,
          userId: USER,
        },
        draft
      )
    ).rejects.toMatchObject({ code: "NOT_PENDING" });
  });

  it("records a rejection with the merchant's note", async () => {
    const { approval } = await approvals.enqueue(refund, draft);
    const decided = await approvals.decide(
      {
        approvalId: approval.id,
        approve: false,
        decidedBy: USER,
        note: "Customer already got a replacement",
        userId: USER,
      },
      draft
    );
    expect(decided).toMatchObject({
      decisionNote: "Customer already got a replacement",
      status: "rejected",
    });
    expect(memory.audit.at(-1)).toMatchObject({
      actor: USER,
      after: { status: "rejected" },
      before: { status: "pending" },
      event: "rejected",
    });
  });

  it("denies an approval whose spend no longer fits the caps", async () => {
    const { approval } = await approvals.enqueue(
      {
        payload: {},
        proposedBy: "optimizer",
        spendCents: 3000,
        title: "Raise the budget",
        type: "media.budget.change",
        userId: USER,
      },
      draft
    );
    expect(approval.status).toBe("pending");
    await expect(
      approvals.decide(
        {
          approvalId: approval.id,
          approve: true,
          decidedBy: USER,
          userId: USER,
        },
        draft,
        { monthCents: 4000, todayCents: 4000 }
      )
    ).rejects.toMatchObject({ code: "DENIED" });
    expect(memory.rows.get(approval.id)?.status).toBe("denied");
  });

  it("expires an approval decided too late", async () => {
    const { approval } = await approvals.enqueue(
      { ...refund, expiresAt: new Date("2026-10-28T11:00:00Z") },
      draft
    );
    await expect(
      approvals.decide(
        {
          approvalId: approval.id,
          approve: true,
          decidedBy: USER,
          userId: USER,
        },
        draft
      )
    ).rejects.toMatchObject({ code: "EXPIRED" });
    expect(memory.rows.get(approval.id)?.status).toBe("expired");
  });

  it("hides another merchant's approval", async () => {
    const { approval } = await approvals.enqueue(refund, draft);
    const error = await approvals
      .decide(
        {
          approvalId: approval.id,
          approve: true,
          decidedBy: "user-2",
          userId: "user-2",
        },
        draft
      )
      .catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(ApprovalError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists by status and domain", async () => {
    await approvals.enqueue(refund, draft);
    await approvals.enqueue(
      {
        payload: {},
        proposedBy: "autopilot",
        title: "Start a run",
        type: "autopilot.run.start",
        userId: USER,
      },
      draft
    );
    const pending = await approvals.list({
      statuses: ["pending"],
      userId: USER,
    });
    expect(pending.map((a) => a.actionType)).toEqual(["store.order.refund"]);
    const autopilot = await approvals.list({
      domain: "autopilot",
      userId: USER,
    });
    expect(autopilot.map((a) => a.status)).toEqual(["approved"]);
  });

  it("follows an approved action through execution and revert", async () => {
    const { approval } = await approvals.enqueue(
      {
        inverse: { status: "HIDDEN" },
        payload: { offerId: "o1" },
        proposedBy: "store_agent",
        title: "Publish the product",
        type: "store.product.publish",
        userId: USER,
      },
      { ...draft, level: "publish_ads_paused" }
    );
    const step = (status: "executing" | "done" | "reverted") =>
      approvals.record({
        actor: "store_agent",
        approvalId: approval.id,
        status,
        userId: USER,
      });
    await step("executing");
    const done = await step("done");
    expect(done.status).toBe("done");
    const reverted = await step("reverted");
    expect(reverted.status).toBe("reverted");
    await expect(step("done")).rejects.toMatchObject({
      code: "BAD_TRANSITION",
    });
  });

  it("refuses to execute what the merchant hasn't approved", async () => {
    const { approval } = await approvals.enqueue(refund, draft);
    await expect(
      approvals.record({
        actor: "store_agent",
        approvalId: approval.id,
        status: "executing",
        userId: USER,
      })
    ).rejects.toMatchObject({ code: "BAD_TRANSITION" });
  });
});
