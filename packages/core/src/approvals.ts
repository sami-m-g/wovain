import { ACTIONS, canAutoExecute } from "./autonomy";
import type {
  ActionDomain,
  ActionType,
  AutonomySettings,
  PolicyReason,
  PolicyVerdict,
  RiskClass,
  SpendToDate,
} from "./autonomy";
import { EVENTS } from "./events";
import type { WovainEvent } from "./events";

// The one approval queue for store actions, media buying and autopilot
// (openspec foundation-autonomy-approvals). An agent enqueues a typed
// action; the autonomy policy (./autonomy.ts) settles it at once (allowed
// or denied) or leaves it pending for the merchant. Every change of state
// is written to the append-only audit log and announced as an Inngest
// event, so the executor of each domain runs approved actions.
//
// Storage is a port (ApprovalStore): packages/api implements it with
// Drizzle (flow/approvals.ts), the tests in memory.

export const APPROVAL_STATUSES = [
  // Waiting for the merchant.
  "pending",
  // Approved by the merchant, or by the policy (decidedBy "policy").
  "approved",
  "rejected",
  // The policy refused it: unknown action or past a spend cap.
  "denied",
  // Not decided before expiresAt.
  "expired",
  "executing",
  "done",
  "failed",
  // Undone with its inverse operation.
  "reverted",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// Who proposed the action.
export const APPROVAL_PROPOSERS = [
  "merchant",
  "autopilot",
  "optimizer",
  "store_agent",
  "voice",
] as const;
export type ApprovalProposer = (typeof APPROVAL_PROPOSERS)[number];

// decidedBy when the policy settled the action, not a person.
export const POLICY_DECIDER = "policy";

// What the merchant is shown before approving: what it costs and whom.
export interface CostPreview {
  // US cents (or the order's currency for refunds): what the action moves.
  amountCents: number;
  currency: string;
  // One line for the card, e.g. "Refund $32.00 to the customer".
  label: string;
  // What the merchant's own card is charged, when it differs (Fourthwall's
  // chargeAmount on refunds and cancels).
  chargeToCardCents?: number | undefined;
  // wovain credits the action spends.
  credits?: number | undefined;
}

export interface Approval {
  id: string;
  userId: string;
  domain: ActionDomain;
  actionType: ActionType;
  risk: RiskClass;
  // One line naming the action for the inbox card.
  title: string;
  // The action's arguments, as its executor reads them.
  payload: Record<string, unknown>;
  costPreview: CostPreview | null;
  // How to undo it (R1–R2), as the executor reads it.
  inverse: Record<string, unknown> | null;
  // Why the agent proposes it.
  reason: string | null;
  proposedBy: ApprovalProposer;
  status: ApprovalStatus;
  policyReason: PolicyReason;
  // A user ID, or POLICY_DECIDER.
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  // A retried enqueue with the same key gets the same approval back.
  idempotencyKey: string | null;
  runId: string | null;
  dropId: string | null;
  suggestionId: string | null;
  expiresAt: Date | null;
  // What the executor got back, or why it failed.
  result: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewApproval = Omit<Approval, "id" | "createdAt" | "updatedAt">;

export type ApprovalPatch = Partial<
  Pick<
    Approval,
    "decidedAt" | "decidedBy" | "decisionNote" | "error" | "result" | "status"
  >
>;

export interface ApprovalQuery {
  userId: string;
  statuses?: readonly ApprovalStatus[] | undefined;
  domain?: ActionDomain | undefined;
  limit?: number | undefined;
}

export const AUDIT_EVENTS = [
  "enqueued",
  "approved",
  "rejected",
  "denied",
  "expired",
  "executing",
  "done",
  "failed",
  "reverted",
  "settings_changed",
] as const;
export type AuditEventKind = (typeof AUDIT_EVENTS)[number];

// One row of the append-only audit log.
export interface AuditEntry {
  userId: string;
  approvalId: string | null;
  event: AuditEventKind;
  // A user ID, POLICY_DECIDER, or a proposer (autopilot, optimizer …).
  actor: string;
  before: unknown;
  after: unknown;
  note: string | null;
}

export interface ApprovalStore {
  // Inserts it, or returns the row that already holds its idempotency key
  // for this user (created false).
  insert: (
    row: NewApproval
  ) => Promise<{ approval: Approval; created: boolean }>;
  get: (userId: string, id: string) => Promise<Approval | undefined>;
  // Applies the patch only while the row is in one of `from`: the
  // conditional update that makes two decisions on one approval safe.
  // Undefined when the row isn't there or was in another state.
  update: (
    userId: string,
    id: string,
    from: readonly ApprovalStatus[],
    patch: ApprovalPatch
  ) => Promise<Approval | undefined>;
  // Newest first.
  list: (query: ApprovalQuery) => Promise<Approval[]>;
  audit: (entry: AuditEntry) => Promise<void>;
}

export type ApprovalErrorCode =
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "EXPIRED"
  | "DENIED"
  | "BAD_TRANSITION";

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

export interface EnqueueInput {
  userId: string;
  type: ActionType;
  title: string;
  payload: Record<string, unknown>;
  proposedBy: ApprovalProposer;
  reason?: string | undefined;
  costPreview?: CostPreview | undefined;
  inverse?: Record<string, unknown> | undefined;
  // New ad spend, US cents, checked against the caps (./autonomy.ts).
  spendCents?: number | undefined;
  // A profit rule's pause, allowed at every level (./autonomy.ts).
  protective?: boolean | undefined;
  idempotencyKey?: string | undefined;
  runId?: string | undefined;
  dropId?: string | undefined;
  suggestionId?: string | undefined;
  expiresAt?: Date | undefined;
}

export interface DecideInput {
  userId: string;
  approvalId: string;
  approve: boolean;
  // Who decides: the merchant's user ID.
  decidedBy: string;
  note?: string | undefined;
}

// What an executor reports after it acts on an approved action.
export interface RecordInput {
  userId: string;
  approvalId: string;
  status: "executing" | "done" | "failed" | "reverted";
  // Who acted: the executor's name (store_agent, optimizer …) or a user ID.
  actor: string;
  result?: unknown;
  error?: string | undefined;
}

// The states each recorded outcome may follow.
const RECORD_FROM: Record<RecordInput["status"], readonly ApprovalStatus[]> = {
  done: ["approved", "executing"],
  executing: ["approved"],
  failed: ["approved", "executing"],
  reverted: ["done"],
};

export interface ApprovalsDeps {
  store: ApprovalStore;
  // Sends an Inngest event (packages/api passes inngest.send).
  emit?: ((event: WovainEvent) => Promise<unknown>) | undefined;
  now?: (() => Date) | undefined;
}

const VERDICT_STATUS = {
  allow: "approved",
  deny: "denied",
  needs_approval: "pending",
} as const satisfies Record<PolicyVerdict, ApprovalStatus>;

const spendOf = (approval: Approval) => {
  const spend = approval.payload.spendCents;
  return typeof spend === "number" ? spend : undefined;
};

export const createApprovals = ({
  emit,
  now = () => new Date(),
  store,
}: ApprovalsDeps) => {
  const decided = async (approval: Approval) => {
    await emit?.({
      data: {
        actionType: approval.actionType,
        approvalId: approval.id,
        decidedBy: approval.decidedBy ?? POLICY_DECIDER,
        domain: approval.domain,
        status: approval.status as "approved" | "rejected" | "denied",
        userId: approval.userId,
      },
      name: EVENTS.approvalDecided,
    });
  };

  // Moves an approval from one of `from` to `patch.status`, or throws.
  const transition = async (
    current: Approval,
    from: readonly ApprovalStatus[],
    patch: ApprovalPatch & { status: ApprovalStatus },
    actor: string,
    note: string | null
  ) => {
    const next = await store.update(current.userId, current.id, from, patch);
    if (next === undefined) {
      throw new ApprovalError(
        "NOT_PENDING",
        `Approval ${current.id} is no longer ${from.join(" or ")}`
      );
    }
    await store.audit({
      actor,
      after: { status: next.status },
      approvalId: next.id,
      before: { status: current.status },
      event: patch.status as AuditEventKind,
      note,
      userId: next.userId,
    });
    return next;
  };

  const getOrThrow = async (userId: string, approvalId: string) => {
    const approval = await store.get(userId, approvalId);
    if (approval === undefined) {
      throw new ApprovalError("NOT_FOUND", `No approval ${approvalId}`);
    }
    return approval;
  };

  // Queues an action. The policy settles it at once when it may run
  // alone (approved by "policy") or may not run at all (denied);
  // otherwise it waits for the merchant (pending).
  const enqueue = async (
    input: EnqueueInput,
    settings: AutonomySettings,
    spent?: SpendToDate
  ) => {
    const { domain, risk } = ACTIONS[input.type];
    const decision = canAutoExecute(
      {
        protective: input.protective,
        spendCents: input.spendCents,
        type: input.type,
      },
      settings,
      spent
    );
    const settledNow = decision.verdict !== "needs_approval";
    const status = VERDICT_STATUS[decision.verdict];
    const { approval, created } = await store.insert({
      actionType: input.type,
      costPreview: input.costPreview ?? null,
      decidedAt: settledNow ? now() : null,
      decidedBy: settledNow ? POLICY_DECIDER : null,
      decisionNote: null,
      domain,
      dropId: input.dropId ?? null,
      error: null,
      expiresAt: input.expiresAt ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      inverse: input.inverse ?? null,
      payload:
        input.spendCents === undefined
          ? input.payload
          : { ...input.payload, spendCents: input.spendCents },
      policyReason: decision.reason,
      proposedBy: input.proposedBy,
      reason: input.reason ?? null,
      result: null,
      risk,
      runId: input.runId ?? null,
      status,
      suggestionId: input.suggestionId ?? null,
      title: input.title,
      userId: input.userId,
    });
    // A retry with the same idempotency key gets the first row back.
    if (!created) {
      return { approval, created, decision };
    }
    await store.audit({
      actor: input.proposedBy,
      after: { policyReason: decision.reason, status },
      approvalId: approval.id,
      before: null,
      event: "enqueued",
      note: input.reason ?? null,
      userId: input.userId,
    });
    if (settledNow) {
      await store.audit({
        actor: POLICY_DECIDER,
        after: { status },
        approvalId: approval.id,
        before: { status: "pending" },
        event: status as AuditEventKind,
        note: decision.reason,
        userId: input.userId,
      });
      await decided(approval);
    } else {
      await emit?.({
        data: {
          actionType: approval.actionType,
          approvalId: approval.id,
          domain: approval.domain,
          risk: approval.risk,
          userId: approval.userId,
        },
        name: EVENTS.approvalRequested,
      });
    }
    return { approval, created, decision };
  };

  // The merchant approves or rejects a pending action. Approving checks
  // the spend caps again, since spend may have moved since it was queued.
  const decide = async (
    input: DecideInput,
    settings: AutonomySettings,
    spent?: SpendToDate
  ) => {
    const current = await getOrThrow(input.userId, input.approvalId);
    if (current.status !== "pending") {
      throw new ApprovalError(
        "NOT_PENDING",
        `Approval ${current.id} is already ${current.status}`
      );
    }
    const note = input.note ?? null;
    if (current.expiresAt !== null && current.expiresAt <= now()) {
      await transition(
        current,
        ["pending"],
        { status: "expired" },
        input.decidedBy,
        note
      );
      throw new ApprovalError("EXPIRED", `Approval ${current.id} expired`);
    }
    if (input.approve) {
      const recheck = canAutoExecute(
        { spendCents: spendOf(current), type: current.actionType },
        settings,
        spent
      );
      if (recheck.verdict === "deny") {
        const denied = await transition(
          current,
          ["pending"],
          {
            decidedAt: now(),
            decidedBy: POLICY_DECIDER,
            decisionNote: recheck.reason,
            status: "denied",
          },
          POLICY_DECIDER,
          recheck.reason
        );
        await decided(denied);
        throw new ApprovalError(
          "DENIED",
          `Approval ${current.id} is denied: ${recheck.reason}`
        );
      }
    }
    const next = await transition(
      current,
      ["pending"],
      {
        decidedAt: now(),
        decidedBy: input.decidedBy,
        decisionNote: note,
        status: input.approve ? "approved" : "rejected",
      },
      input.decidedBy,
      note
    );
    await decided(next);
    return next;
  };

  // An executor reports what happened to an approved action.
  const record = async (input: RecordInput) => {
    const current = await getOrThrow(input.userId, input.approvalId);
    const from = RECORD_FROM[input.status];
    if (!from.includes(current.status)) {
      throw new ApprovalError(
        "BAD_TRANSITION",
        `Approval ${current.id} can't go from ${current.status} to ${input.status}`
      );
    }
    return await transition(
      current,
      from,
      {
        error: input.error ?? null,
        result: input.result ?? current.result,
        status: input.status,
      },
      input.actor,
      input.error ?? null
    );
  };

  return {
    decide,
    enqueue,
    get: getOrThrow,
    list: async (query: ApprovalQuery) => await store.list(query),
    record,
  };
};

export type Approvals = ReturnType<typeof createApprovals>;
