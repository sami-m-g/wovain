import { billingCatalog } from "@wovain/billing/catalog";
import { entitlement } from "@wovain/billing/mirror";
import { canAutoExecute } from "@wovain/core/autonomy";
import {
  matchOf,
  pickMatches,
  queriesFor,
} from "@wovain/core/autopilot-signals";
import type {
  NewsHit,
  RisingEntity,
  SignalMatch,
  SignalQuery,
} from "@wovain/core/autopilot-signals";
import { EVENTS } from "@wovain/core/events";
import type { TriggerKind, WovainEvent } from "@wovain/core/events";
import { DecisionTrace } from "@wovain/core/trace";
import type { TraceEntry, TraceSource } from "@wovain/core/trace";
import {
  approval,
  autonomySetting,
  brandProfile,
  decisionTrace,
  suggestion,
} from "@wovain/db/schema/autonomy";
import { creditReservation } from "@wovain/db/schema/billing";
import { run } from "@wovain/db/schema/seller";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { createError, log } from "evlog";

import type { Actor } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  spendToDate,
  traceSinkFor,
} from "./approvals";
import { flagContextOf } from "./flags";
import { startRun } from "./runs";
import { autopilotEntitled } from "./spend";

// Autopilot's triggers (openspec autopilot-triggers): a scan per brand asks
// Qloo what is rising with the brand's audience and Tavily what the news
// says this week, and saves a suggestion when they agree. Autopilot then
// queues the run in the approval queue, where the merchant's autonomy level
// decides whether it waits for them; an approved run starts here. Every
// step is written to the decision trace, which the decision log narrates.

const AGENT = "autopilot";
const DAY_MS = 86_400_000;
// A subject is suggested at most once in this many days.
const REPEAT_DAYS = 7;
// What a run started by autopilot stages: a paused campaign, as the run
// wizard's default.
const DEFAULT_DAILY_BUDGET = 15;
const DEFAULT_COUNTRY = "US";
const COUNTRY = /^[A-Z]{2}$/u;
const MAX_COUNTRIES = 25;
const LOG_SUGGESTIONS = 20;
const LOG_SCANS = 10;
const ACTION = "autopilot.run.start";
// Autopilot owns only the drops its own scans suggest. Other workstreams
// share the suggestion table and trigger.fired (retire, reprice, scale_ad
// from performance or schedule triggers); autopilot never acts on those.
export const AUTOPILOT_TRIGGERS = [
  "qloo",
  "trend",
] as const satisfies readonly TriggerKind[];
const OWN_KIND = "drop";
const ownSuggestions = () =>
  and(
    eq(suggestion.kind, OWN_KIND),
    inArray(suggestion.trigger, [...AUTOPILOT_TRIGGERS])
  );
// A run still going: it may reserve more credits.
const OPEN_RUN = new Set(["running", "awaiting_approval"]);

export type ScanReason = "schedule" | "manual";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// An autopilot failure, at error level, for PostHog Error Tracking.
const logFailure = (
  code: string,
  userId: string,
  error: unknown,
  extra: Record<string, unknown> = {}
) => {
  log.error({
    autopilot: { userId, ...extra },
    error: {
      code,
      message: messageOf(error),
      name: code,
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
  });
};

export const autopilotTriggersOn = async (actor: Actor) =>
  await actor.core.flags.isOn("autopilot-triggers", flagContextOf(actor));

export const autopilotTriggersOff = () =>
  createError({
    fix: "Turn on the autopilot-triggers flag for this environment.",
    message: "Autopilot triggers aren't available yet",
    status: 404,
    why: "The autopilot-triggers flag is off.",
  });

export const requireAutopilotTriggers = async (actor: Actor) => {
  if (!(await autopilotTriggersOn(actor))) {
    throw autopilotTriggersOff();
  }
};

const startOfUtcDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

// Credits one run started by autopilot is expected to cost: research, then
// a brief, judgment and autopilot review for each design, and the pick.
export const runEstimate = () => {
  const { creditCost, designsPerRun } = billingCatalog();
  return (
    creditCost.research +
    designsPerRun * (creditCost.design + creditCost.assist) +
    creditCost.assist
  );
};

// What autopilot already used today (UTC), per autopilot.run.start it
// queued today: the credits its run reserved, but at least the run's
// estimate while the run hasn't started or is still going, since a run
// reserves its credits one step at a time.
export const autopilotCreditsToday = async (
  actor: Pick<Actor, "db" | "userId">,
  now = new Date()
) => {
  const queued = await actor.db
    .select({
      runId: sql<string | null>`${approval.result}->>'runId'`,
      status: approval.status,
    })
    .from(approval)
    .where(
      and(
        eq(approval.userId, actor.userId),
        eq(approval.actionType, ACTION),
        eq(approval.proposedBy, "autopilot"),
        gte(approval.createdAt, startOfUtcDay(now)),
        inArray(approval.status, ["approved", "executing", "done"])
      )
    );
  const runIds = queued.flatMap(({ runId }) => (runId === null ? [] : [runId]));
  const [reserved, runs] =
    runIds.length === 0
      ? [[], []]
      : await Promise.all([
          actor.db
            .select({
              credits: sql<number>`coalesce(sum(${creditReservation.credits}), 0)::int`,
              runId: creditReservation.runId,
            })
            .from(creditReservation)
            .where(
              and(
                eq(creditReservation.userId, actor.userId),
                inArray(creditReservation.runId, runIds),
                inArray(creditReservation.status, ["held", "settled"])
              )
            )
            .groupBy(creditReservation.runId),
          actor.db
            .select({ id: run.id, status: run.status })
            .from(run)
            .where(and(eq(run.userId, actor.userId), inArray(run.id, runIds))),
        ]);
  const estimate = runEstimate();
  let used = 0;
  for (const { runId } of queued) {
    const credits =
      runId === null
        ? 0
        : Number(reserved.find((row) => row.runId === runId)?.credits ?? 0);
    const status = runs.find(({ id }) => id === runId)?.status;
    const open =
      runId === null || (status !== undefined && OPEN_RUN.has(status));
    used += open ? Math.max(credits, estimate) : credits;
  }
  return used;
};

const capOf = async (actor: Pick<Actor, "db" | "userId">) => {
  const { plan } = await entitlement(actor.db, actor.userId);
  return billingCatalog().plans[plan].autopilotDailyCredits;
};

// Merchants whose brand autopilot scans: a brand profile, agent not paused.
export const brandsToScan = async (db: Actor["db"]) => {
  const rows = await db
    .select({ userId: brandProfile.userId })
    .from(brandProfile)
    .leftJoin(autonomySetting, eq(autonomySetting.userId, brandProfile.userId))
    .where(
      or(isNull(autonomySetting.paused), eq(autonomySetting.paused, false))
    );
  return rows.map(({ userId }) => userId);
};

type Step = Omit<TraceEntry, "at" | "seq">;

const step = (
  name: string,
  inputSummary: string,
  output: unknown,
  {
    ms,
    ok = true,
    sources = [],
  }: { ms?: number; ok?: boolean; sources?: TraceSource[] } = {}
): Step => ({
  agent: AGENT,
  inputSummary,
  ms,
  ok,
  output,
  sources,
  step: name,
});

const timed = async <T>(work: () => Promise<T>) => {
  const started = performance.now();
  try {
    return { ms: Math.round(performance.now() - started), value: await work() };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - started) };
  }
};

const saveTrace = async (
  actor: Actor,
  scope: { approvalId?: string; runId?: string; suggestionId?: string },
  steps: Step[]
) => {
  const trace = new DecisionTrace(
    { userId: actor.userId, ...scope },
    traceSinkFor(actor)
  );
  for (const entry of steps) {
    trace.add(entry);
  }
  await trace.flush();
};

const recentKeys = async (actor: Actor, now: Date) => {
  const rows = await actor.db
    .select({ key: sql<string | null>`${suggestion.payload}->>'key'` })
    .from(suggestion)
    .where(
      and(
        eq(suggestion.userId, actor.userId),
        ownSuggestions(),
        gte(
          suggestion.createdAt,
          new Date(now.getTime() - REPEAT_DAYS * DAY_MS)
        )
      )
    );
  return new Set(rows.flatMap(({ key }) => (key === null ? [] : [key])));
};

interface Searched {
  hits: NewsHit[];
  query: SignalQuery;
  step: Step;
}

const searchAll = async (actor: Actor, queries: SignalQuery[], now: Date) =>
  await Promise.all(
    queries.map(async (query): Promise<Searched> => {
      const found = await timed(
        async () =>
          await actor.core.signals.news(query.query, actor.log, now.getTime())
      );
      if ("error" in found) {
        // One failed search doesn't sink the scan, but it is reported.
        logFailure("AUTOPILOT_TAVILY_FAILED", actor.userId, found.error, {
          query: query.query,
        });
        return {
          hits: [],
          query,
          step: step(
            "tavily.news",
            query.query,
            { error: messageOf(found.error) },
            { ms: found.ms, ok: false }
          ),
        };
      }
      return {
        hits: found.value,
        query,
        step: step(
          "tavily.news",
          query.query,
          { kept: found.value.length, subject: query.subject },
          {
            ms: found.ms,
            sources: found.value.map(({ title, url }) => ({
              provider: "tavily" as const,
              title,
              url,
            })),
          }
        ),
      };
    })
  );

const risingFor = async (
  actor: Actor,
  entities: { id: string; name: string }[]
): Promise<{ rising: RisingEntity[]; step?: Step }> => {
  if (entities.length === 0) {
    return { rising: [] };
  }
  const found = await timed(
    async () =>
      await actor.core.signals.rising(
        entities.map(({ id }) => id),
        actor.log
      )
  );
  const summary = entities.map(({ name }) => name).join(", ");
  if ("error" in found) {
    logFailure("AUTOPILOT_QLOO_FAILED", actor.userId, found.error);
    return {
      rising: [],
      step: step(
        "qloo.rising",
        summary,
        { error: messageOf(found.error) },
        { ms: found.ms, ok: false }
      ),
    };
  }
  return {
    rising: found.value,
    step: step(
      "qloo.rising",
      summary,
      {
        rising: found.value
          .slice(0, 5)
          .map(({ affinity, name }) => ({ affinity, name })),
      },
      {
        ms: found.ms,
        sources: found.value.slice(0, 5).map(({ id, name }) => ({
          id,
          provider: "qloo" as const,
          title: name,
        })),
      }
    ),
  };
};

// A match the scan picked, with the trace that explains it.
export interface PickedMatch {
  match: SignalMatch;
  steps: Step[];
}

export interface ScanSignals {
  picked: PickedMatch[];
  status: "off" | "no_brand" | "scanned";
}

// The read-only part of a scan: Qloo, Tavily and the match. Qloo and
// Tavily failures are logged and traced, and the scan goes on with what
// it has. A scan that picks nothing saves its trace here.
export const scanSignals = async (
  actor: Actor,
  reason: ScanReason,
  now = new Date()
): Promise<ScanSignals> => {
  if (!(await autopilotTriggersOn(actor))) {
    return { picked: [], status: "off" };
  }
  const [brand] = await actor.db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  if (brand === undefined) {
    return { picked: [], status: "no_brand" };
  }
  const start = step(
    "scan",
    `${reason} scan: ${brand.niches.length} niches, ${brand.qlooEntities.length} Qloo entities`,
    { niches: brand.niches, reason }
  );
  const qloo = await risingFor(actor, brand.qlooEntities);
  const shared = qloo.step === undefined ? [start] : [start, qloo.step];
  const queries = queriesFor(brand, qloo.rising);
  const searched = await searchAll(actor, queries, now);
  const matches = searched.flatMap(({ hits, query, step: searchStep }) => {
    const match = matchOf(query, hits, brand.niches);
    return match === undefined ? [] : [{ match, searchStep }];
  });
  const seen = await recentKeys(actor, now);
  const picked = pickMatches(
    matches.map(({ match }) => match),
    seen
  );
  const decided = step(
    "match",
    `${queries.length} searches, ${matches.length} with this week's news`,
    {
      matched: matches.map(({ match }) => match.subject),
      picked: picked.map(({ subject }) => subject),
      repeats: matches
        .filter(({ match }) => seen.has(match.key))
        .map(({ match }) => match.subject),
    }
  );
  if (picked.length === 0) {
    await saveTrace(actor, {}, [
      ...shared,
      ...searched.map(({ step: searchStep }) => searchStep),
      decided,
    ]);
    return { picked: [], status: "scanned" };
  }
  // At most MAX_MATCHES (2) suggestions.
  return {
    picked: picked.map((match) => {
      const own = matches.find((found) => found.match.key === match.key);
      return {
        match,
        steps: [
          ...shared,
          ...(own === undefined ? [] : [own.searchStep]),
          decided,
          step(
            "suggest",
            match.subject,
            {
              rationale: match.rationale,
              score: match.score,
              trigger: match.trigger,
            },
            { sources: match.sources }
          ),
        ],
      };
    }),
    status: "scanned",
  };
};

// Saves a picked match as a suggestion with its trace, once: a retry finds
// the suggestion an earlier attempt saved for the same subject.
export const saveScanSuggestion = async (
  actor: Actor,
  { match, steps }: PickedMatch,
  now = new Date()
) => {
  const [earlier] = await actor.db
    .select({ id: suggestion.id })
    .from(suggestion)
    .where(
      and(
        eq(suggestion.userId, actor.userId),
        ownSuggestions(),
        sql`${suggestion.payload}->>'key' = ${match.key}`,
        gte(
          suggestion.createdAt,
          new Date(now.getTime() - REPEAT_DAYS * DAY_MS)
        )
      )
    );
  if (earlier !== undefined) {
    return earlier.id;
  }
  const [row] = await actor.db
    .insert(suggestion)
    .values({
      kind: OWN_KIND,
      payload: {
        entity: match.entity ?? null,
        key: match.key,
        news: match.news,
        score: match.score,
        seed: match.seed,
        subject: match.subject,
      },
      rationale: match.rationale,
      sources: match.sources,
      title: match.title,
      trigger: match.trigger,
      userId: actor.userId,
    })
    .returning({ id: suggestion.id });
  if (row === undefined) {
    throw new Error("The suggestion wasn't saved");
  }
  await saveTrace(actor, { suggestionId: row.id }, steps);
  return row.id;
};

// What tells the merchant's devices (the mobile workstream sends the push)
// and autopilot (../workflows/autopilot) about a new suggestion. Each event
// has an ID per suggestion, so Inngest drops a repeat send.
export const announcementsFor = (
  userId: string,
  id: string,
  match: Pick<SignalMatch, "rationale" | "subject" | "title" | "trigger">
): (WovainEvent & { id: string })[] => [
  {
    data: {
      kind: match.trigger,
      payload: { subject: match.subject, title: match.title },
      suggestionId: id,
      userId,
    },
    id: `trigger:suggestion:${id}`,
    name: EVENTS.triggerFired,
  },
  {
    data: {
      actions: [
        { id: "accept", title: "Start the drop" },
        { id: "dismiss", title: "Dismiss" },
      ],
      body: match.rationale,
      kind: "suggestion",
      title: match.title,
      userId,
    },
    id: `notify:suggestion:${id}`,
    name: EVENTS.notify,
  },
];

export interface ScanResult {
  status: "off" | "no_brand" | "scanned";
  suggestionIds: string[];
}

// One brand's scan in one go: signals, then each suggestion saved and
// announced. The Inngest function runs the same parts as separate steps.
export const scanBrand = async (
  actor: Actor,
  reason: ScanReason,
  now = new Date()
): Promise<ScanResult> => {
  const { picked, status } = await scanSignals(actor, reason, now);
  const suggestionIds = await Promise.all(
    picked.map(async (one) => {
      const id = await saveScanSuggestion(actor, one, now);
      await Promise.all(
        announcementsFor(actor.userId, id, one.match).map(
          async (event) => await actor.events?.send(event)
        )
      );
      return id;
    })
  );
  return { status, suggestionIds };
};

const suggestionOf = async (actor: Actor, id: string) => {
  const [row] = await actor.db
    .select()
    .from(suggestion)
    .where(
      and(
        eq(suggestion.userId, actor.userId),
        eq(suggestion.id, id),
        ownSuggestions()
      )
    );
  return row;
};

const seedOf = (row: typeof suggestion.$inferSelect) => {
  const { seed } = row.payload;
  return typeof seed === "string" && seed.trim() !== "" ? seed : row.title;
};

const enqueueRun = async (
  actor: Actor,
  row: typeof suggestion.$inferSelect,
  proposedBy: "autopilot" | "merchant",
  idempotencyKey = `suggestion:${row.id}`
) => {
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  const estimate = runEstimate();
  const queued = await approvalsFor(actor).enqueue(
    {
      costPreview: {
        amountCents: 0,
        credits: estimate,
        currency: "USD",
        label: `About ${estimate} credits`,
      },
      idempotencyKey,
      payload: { seed: seedOf(row), suggestionId: row.id },
      proposedBy,
      reason: row.rationale,
      suggestionId: row.id,
      title: row.title,
      type: ACTION,
      userId: actor.userId,
    },
    settings,
    spent
  );
  await actor.db
    .update(suggestion)
    .set({ approvalId: queued.approval.id })
    .where(eq(suggestion.id, row.id));
  return { ...queued, settings, spent };
};

export type ActResult =
  | "off"
  | "missing"
  | "not_entitled"
  | "credit_cap"
  | "queued";

// Autopilot's move on a new suggestion: queue the run, and let the
// merchant's autonomy level decide whether it waits for them.
export const actOnSuggestion = async (
  actor: Actor,
  suggestionId: string,
  now = new Date()
): Promise<ActResult> => {
  if (!(await autopilotTriggersOn(actor))) {
    return "off";
  }
  const row = await suggestionOf(actor, suggestionId);
  if (row === undefined || row.status !== "new" || row.approvalId !== null) {
    return "missing";
  }
  if (!(await autopilotEntitled(actor))) {
    await saveTrace(actor, { suggestionId }, [
      step("policy", "autopilot entitlement", { entitled: false }),
    ]);
    return "not_entitled";
  }
  const [used, cap] = await Promise.all([
    autopilotCreditsToday(actor, now),
    capOf(actor),
  ]);
  const estimate = runEstimate();
  if (used + estimate > cap) {
    await saveTrace(actor, { suggestionId }, [
      step("credit_cap", `${used} of ${cap} credits used today`, {
        cap,
        estimate,
        used,
      }),
    ]);
    return "credit_cap";
  }
  const { approval: queued, decision } = await enqueueRun(
    actor,
    row,
    "autopilot"
  );
  await saveTrace(actor, { approvalId: queued.id, suggestionId }, [
    step("policy", `${ACTION} (R1), about ${estimate} credits`, {
      reason: decision.reason,
      status: queued.status,
      verdict: decision.verdict,
    }),
  ]);
  return "queued";
};

const countriesOf = async (actor: Actor) => {
  const [brand] = await actor.db
    .select({ demographics: brandProfile.demographics })
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  const countries = (brand?.demographics.countries ?? [])
    .map((code) => code.toUpperCase())
    .filter((code) => COUNTRY.test(code))
    .slice(0, MAX_COUNTRIES);
  return countries.length > 0 ? countries : [DEFAULT_COUNTRY];
};

export type RunStartOutcome =
  | { status: "skipped" }
  | { error: string; status: "failed" }
  | {
      autopilot: boolean;
      publishPolicy: string;
      runId: string;
      seed: string;
      status: "started";
    };

const runSeedOf = (current: {
  payload: Record<string, unknown>;
  title: string;
}) =>
  typeof current.payload["seed"] === "string"
    ? current.payload["seed"]
    : current.title;

const traceScopeOf = (
  approvalId: string,
  suggestionId: string | null
): { approvalId: string; suggestionId?: string } =>
  suggestionId === null ? { approvalId } : { approvalId, suggestionId };

// Starts the run an approved `autopilot.run.start` asks for, once: the
// approval goes approved → executing first, so a retry finds it taken. Only
// a failed start is recorded as failed; what follows a started run is
// `finishRunStart`'s, so a failure there is retried, not taken for a run
// that didn't start.
export const startApprovedRun = async (
  actor: Actor,
  approvalId: string
): Promise<RunStartOutcome> => {
  const approvals = approvalsFor(actor);
  const current = await approvals.get(actor.userId, approvalId);
  if (current.actionType !== ACTION || current.status !== "approved") {
    return { status: "skipped" };
  }
  await approvals.record({
    actor: AGENT,
    approvalId,
    status: "executing",
    userId: actor.userId,
  });
  const settings = await autonomyOf(actor);
  // The run decides its own gates (and publishes) only where the policy
  // would let autopilot publish; otherwise it waits at the ideas gate.
  const publish = canAutoExecute({ type: "store.product.publish" }, settings);
  const decides =
    publish.verdict === "allow" && (await autopilotEntitled(actor));
  const seed = runSeedOf(current);
  const countries = await countriesOf(actor);
  let runId: string;
  try {
    const started = await startRun(actor, {
      autopilot: decides,
      countries,
      dailyBudget: DEFAULT_DAILY_BUDGET,
      seed,
    });
    runId = started.id;
  } catch (error) {
    logFailure("AUTOPILOT_RUN_START_FAILED", actor.userId, error, {
      approvalId,
    });
    await approvals.record({
      actor: AGENT,
      approvalId,
      error: messageOf(error),
      status: "failed",
      userId: actor.userId,
    });
    await saveTrace(actor, traceScopeOf(approvalId, current.suggestionId), [
      step("run.start", seed, { error: messageOf(error) }, { ok: false }),
    ]);
    return { error: messageOf(error), status: "failed" };
  }
  return {
    autopilot: decides,
    publishPolicy: publish.reason,
    runId,
    seed,
    status: "started",
  };
};

// Records a started run: the approval done with the run ID, the suggestion
// accepted with it, and the trace. Safe to retry: an approval already done
// is left as it is.
export const finishRunStart = async (
  actor: Actor,
  approvalId: string,
  started: Extract<RunStartOutcome, { status: "started" }>
) => {
  const approvals = approvalsFor(actor);
  const current = await approvals.get(actor.userId, approvalId);
  if (current.status === "executing") {
    await approvals.record({
      actor: AGENT,
      approvalId,
      result: { autopilot: started.autopilot, runId: started.runId },
      status: "done",
      userId: actor.userId,
    });
  }
  if (current.suggestionId !== null) {
    await actor.db
      .update(suggestion)
      .set({ runId: started.runId, status: "accepted" })
      .where(
        and(
          eq(suggestion.userId, actor.userId),
          eq(suggestion.id, current.suggestionId)
        )
      );
  }
  await saveTrace(
    actor,
    { ...traceScopeOf(approvalId, current.suggestionId), runId: started.runId },
    [
      step("run.start", started.seed, {
        mode: started.autopilot ? "autopilot" : "ideas_gate",
        publishPolicy: started.publishPolicy,
        runId: started.runId,
      }),
    ]
  );
  return { runId: started.runId, status: "done" as const };
};

// Both parts at once. The Inngest function runs them as separate steps.
export const executeRunStart = async (actor: Actor, approvalId: string) => {
  const outcome = await startApprovedRun(actor, approvalId);
  return outcome.status === "started"
    ? await finishRunStart(actor, approvalId, outcome)
    : outcome;
};

const missingSuggestion = (id: string) =>
  createError({
    message: `No open suggestion ${id}`,
    status: 404,
    why: "This merchant has no open suggestion with that ID.",
  });

const notStarted = (status: string) =>
  createError({
    fix: "Check your spend caps and autonomy settings, then try again.",
    message: "The drop didn't start",
    status: 409,
    why: `The run's approval is ${status}.`,
  });

// Approvals that ended without a run: accepting again queues a new one.
const ENDED = new Set(["failed", "denied", "rejected", "expired", "reverted"]);
// Approvals with a run queued or started.
const GOING = new Set(["approved", "executing", "done"]);

const attemptsOf = async (actor: Actor, id: string) => {
  const [row] = await actor.db
    .select({ count: sql<number>`count(*)::int` })
    .from(approval)
    .where(
      and(eq(approval.userId, actor.userId), eq(approval.suggestionId, id))
    );
  return Number(row?.count ?? 0);
};

// The approval a merchant's accept works on: the open one, or a new one
// when there is none or the last one ended without a run.
const approvalToAccept = async (
  actor: Actor,
  row: typeof suggestion.$inferSelect
) => {
  if (row.approvalId === null) {
    return await enqueueRun(actor, row, "merchant");
  }
  const earlier = await approvalsFor(actor).get(actor.userId, row.approvalId);
  if (ENDED.has(earlier.status)) {
    const attempt = await attemptsOf(actor, row.id);
    return await enqueueRun(
      actor,
      row,
      "merchant",
      `suggestion:${row.id}:retry:${attempt}`
    );
  }
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  return { approval: earlier, settings, spent };
};

// The merchant starts a suggestion's drop: its queued run is approved, or a
// run is queued and approved for it (again, after a run start that failed
// or an approval that ended). The suggestion is accepted only once a run is
// queued or started; otherwise the merchant sees why.
export const acceptSuggestion = async (actor: Actor, id: string) => {
  const row = await suggestionOf(actor, id);
  if (row === undefined || row.status !== "new") {
    throw missingSuggestion(id);
  }
  const queued = await approvalToAccept(actor, row);
  const decided =
    queued.approval.status === "pending"
      ? await approvalsFor(actor).decide(
          {
            approvalId: queued.approval.id,
            approve: true,
            decidedBy: actor.userId,
            userId: actor.userId,
          },
          queued.settings,
          queued.spent
        )
      : queued.approval;
  if (!GOING.has(decided.status)) {
    throw notStarted(decided.status);
  }
  await actor.db
    .update(suggestion)
    .set({ status: "accepted" })
    .where(and(eq(suggestion.userId, actor.userId), eq(suggestion.id, id)));
  return decided;
};

export const dismissSuggestion = async (actor: Actor, id: string) => {
  const row = await suggestionOf(actor, id);
  if (row === undefined || row.status !== "new") {
    throw missingSuggestion(id);
  }
  if (row.approvalId !== null) {
    const approvals = approvalsFor(actor);
    const queued = await approvals.get(actor.userId, row.approvalId);
    if (queued.status === "pending") {
      await approvals.decide(
        {
          approvalId: queued.id,
          approve: false,
          decidedBy: actor.userId,
          note: "Dismissed the suggestion",
          userId: actor.userId,
        },
        await autonomyOf(actor)
      );
    }
  }
  await actor.db
    .update(suggestion)
    .set({ status: "dismissed" })
    .where(eq(suggestion.id, id));
};

// "Scan now": the same scan the cron fans out, rate-limited per brand.
export const requestScan = async (actor: Actor) => {
  if (actor.events === undefined) {
    throw new Error("No event sender to request the scan");
  }
  await actor.events.send({
    data: { reason: "manual", userId: actor.userId },
    name: EVENTS.autopilotScan,
  });
  return { requested: true };
};

export const autopilotStatus = async (actor: Actor, now = new Date()) => {
  const enabled = await autopilotTriggersOn(actor);
  if (!enabled) {
    return { enabled } as const;
  }
  const [entitled, settings, used, cap, brand] = await Promise.all([
    autopilotEntitled(actor),
    autonomyOf(actor),
    autopilotCreditsToday(actor, now),
    capOf(actor),
    actor.db
      .select({ id: brandProfile.id })
      .from(brandProfile)
      .where(eq(brandProfile.userId, actor.userId)),
  ]);
  return {
    autonomy: settings,
    credits: { cap, estimate: runEstimate(), usedToday: used },
    enabled,
    entitled,
    hasBrand: brand.length > 0,
  } as const;
};

// A trace entry as the decision log shows it.
const traceView = ({
  agent,
  at,
  inputSummary,
  ms,
  ok,
  output,
  sources,
  step: name,
}: typeof decisionTrace.$inferSelect) => ({
  agent,
  at: at.toISOString(),
  inputSummary,
  ms,
  ok,
  output: output as Record<string, unknown> | null,
  sources,
  step: name,
});

// The decision log: the latest suggestions with their approval and trace,
// and the latest scans that found nothing.
export const autopilotLog = async (actor: Actor) => {
  const suggestions = await actor.db
    .select()
    .from(suggestion)
    .where(and(eq(suggestion.userId, actor.userId), ownSuggestions()))
    .orderBy(desc(suggestion.createdAt))
    .limit(LOG_SUGGESTIONS);
  const ids = suggestions.map(({ id }) => id);
  const approvalIds = suggestions.flatMap(({ approvalId }) =>
    approvalId === null ? [] : [approvalId]
  );
  const [traces, approvals, scans] = await Promise.all([
    ids.length === 0
      ? []
      : actor.db
          .select()
          .from(decisionTrace)
          .where(
            and(
              eq(decisionTrace.userId, actor.userId),
              inArray(decisionTrace.suggestionId, ids)
            )
          )
          .orderBy(decisionTrace.at, decisionTrace.seq),
    approvalIds.length === 0
      ? []
      : actor.db
          .select()
          .from(approval)
          .where(
            and(
              eq(approval.userId, actor.userId),
              inArray(approval.id, approvalIds)
            )
          ),
    actor.db
      .select()
      .from(decisionTrace)
      .where(
        and(
          eq(decisionTrace.userId, actor.userId),
          eq(decisionTrace.agent, AGENT),
          eq(decisionTrace.step, "match"),
          isNull(decisionTrace.suggestionId)
        )
      )
      .orderBy(desc(decisionTrace.at))
      .limit(LOG_SCANS),
  ]);
  return {
    scans: scans.map(traceView),
    suggestions: suggestions.map((row) => {
      const queued = approvals.find(({ id }) => id === row.approvalId);
      return {
        approval:
          queued === undefined
            ? null
            : {
                decidedBy: queued.decidedBy,
                error: queued.error,
                id: queued.id,
                policyReason: queued.policyReason,
                proposedBy: queued.proposedBy,
                status: queued.status,
              },
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        rationale: row.rationale,
        runId: row.runId,
        sources: row.sources,
        status: row.status,
        steps: traces
          .filter(({ suggestionId }) => suggestionId === row.id)
          .map(traceView),
        title: row.title,
        trigger: row.trigger,
      };
    }),
  };
};
