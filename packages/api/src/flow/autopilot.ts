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

// What autopilot already used today (UTC): the credits its runs reserved,
// plus an estimate for each run it queued that hasn't reserved yet.
export const autopilotCreditsToday = async (
  actor: Pick<Actor, "db" | "userId">,
  now = new Date()
) => {
  const since = startOfUtcDay(now);
  const mine = and(
    eq(approval.userId, actor.userId),
    eq(approval.actionType, ACTION),
    eq(approval.proposedBy, "autopilot"),
    gte(approval.createdAt, since)
  );
  const [reserved] = await actor.db
    .select({
      credits: sql<number>`coalesce(sum(${creditReservation.credits}), 0)::int`,
    })
    .from(creditReservation)
    .innerJoin(
      approval,
      sql`${approval.result}->>'runId' = ${creditReservation.runId}`
    )
    .where(
      and(
        mine,
        eq(creditReservation.userId, actor.userId),
        inArray(creditReservation.status, ["held", "settled"]),
        gte(creditReservation.createdAt, since)
      )
    );
  const [queued] = await actor.db
    .select({ count: sql<number>`count(*)::int` })
    .from(approval)
    .where(and(mine, inArray(approval.status, ["approved", "executing"])));
  return (
    Number(reserved?.credits ?? 0) + Number(queued?.count ?? 0) * runEstimate()
  );
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

const saveSuggestion = async (actor: Actor, match: SignalMatch) => {
  const [row] = await actor.db
    .insert(suggestion)
    .values({
      kind: "drop",
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
  return row.id;
};

// Tells the merchant's devices (the mobile workstream sends the push) and
// autopilot (../workflows/autopilot) about a new suggestion.
const announce = async (actor: Actor, id: string, match: SignalMatch) => {
  await actor.events?.send({
    data: {
      kind: match.trigger,
      payload: { subject: match.subject, title: match.title },
      suggestionId: id,
      userId: actor.userId,
    },
    name: EVENTS.triggerFired,
  });
  await actor.events?.send({
    data: {
      actions: [
        { id: "accept", title: "Start the drop" },
        { id: "dismiss", title: "Dismiss" },
      ],
      body: match.rationale,
      kind: "suggestion",
      title: match.title,
      userId: actor.userId,
    },
    name: EVENTS.notify,
  });
};

export interface ScanResult {
  status: "off" | "no_brand" | "scanned";
  suggestionIds: string[];
}

// One brand's scan. Qloo and Tavily failures are logged and traced, and the
// scan goes on with what it has.
export const scanBrand = async (
  actor: Actor,
  reason: ScanReason,
  now = new Date()
): Promise<ScanResult> => {
  if (!(await autopilotTriggersOn(actor))) {
    return { status: "off", suggestionIds: [] };
  }
  const [brand] = await actor.db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  if (brand === undefined) {
    return { status: "no_brand", suggestionIds: [] };
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
    return { status: "scanned", suggestionIds: [] };
  }
  // At most MAX_MATCHES (2) suggestions, saved side by side.
  const ids = await Promise.all(
    picked.map(async (match) => {
      const id = await saveSuggestion(actor, match);
      const own = matches.find((found) => found.match.key === match.key);
      await saveTrace(actor, { suggestionId: id }, [
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
      ]);
      await announce(actor, id, match);
      return id;
    })
  );
  return { status: "scanned", suggestionIds: ids };
};

const suggestionOf = async (actor: Actor, id: string) => {
  const [row] = await actor.db
    .select()
    .from(suggestion)
    .where(and(eq(suggestion.userId, actor.userId), eq(suggestion.id, id)));
  return row;
};

const seedOf = (row: typeof suggestion.$inferSelect) => {
  const { seed } = row.payload;
  return typeof seed === "string" && seed.trim() !== "" ? seed : row.title;
};

const enqueueRun = async (
  actor: Actor,
  row: typeof suggestion.$inferSelect,
  proposedBy: "autopilot" | "merchant"
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
      idempotencyKey: `suggestion:${row.id}`,
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

// Starts the run an approved `autopilot.run.start` asks for, once: the
// approval goes approved → executing first, so a retry finds it taken.
export const executeRunStart = async (actor: Actor, approvalId: string) => {
  const approvals = approvalsFor(actor);
  const current = await approvals.get(actor.userId, approvalId);
  if (current.actionType !== ACTION || current.status !== "approved") {
    return { status: "skipped" as const };
  }
  await approvals.record({
    actor: AGENT,
    approvalId,
    status: "executing",
    userId: actor.userId,
  });
  const scope = {
    approvalId,
    ...(current.suggestionId === null
      ? {}
      : { suggestionId: current.suggestionId }),
  };
  const settings = await autonomyOf(actor);
  // The run decides its own gates (and publishes) only where the policy
  // would let autopilot publish; otherwise it waits at the ideas gate.
  const publish = canAutoExecute({ type: "store.product.publish" }, settings);
  const decides =
    publish.verdict === "allow" && (await autopilotEntitled(actor));
  const seed =
    typeof current.payload["seed"] === "string"
      ? current.payload["seed"]
      : current.title;
  try {
    const started = await startRun(actor, {
      autopilot: decides,
      countries: await countriesOf(actor),
      dailyBudget: DEFAULT_DAILY_BUDGET,
      seed,
    });
    await approvals.record({
      actor: AGENT,
      approvalId,
      result: { autopilot: decides, runId: started.id },
      status: "done",
      userId: actor.userId,
    });
    if (current.suggestionId !== null) {
      await actor.db
        .update(suggestion)
        .set({ runId: started.id, status: "accepted" })
        .where(eq(suggestion.id, current.suggestionId));
    }
    await saveTrace(actor, { ...scope, runId: started.id }, [
      step("run.start", seed, {
        mode: decides ? "autopilot" : "ideas_gate",
        publishPolicy: publish.reason,
        runId: started.id,
      }),
    ]);
    return { runId: started.id, status: "done" as const };
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
    await saveTrace(actor, scope, [
      step("run.start", seed, { error: messageOf(error) }, { ok: false }),
    ]);
    return { error: messageOf(error), status: "failed" as const };
  }
};

const missingSuggestion = (id: string) =>
  createError({
    message: `No open suggestion ${id}`,
    status: 404,
    why: "This merchant has no open suggestion with that ID.",
  });

// The merchant starts a suggestion's drop: its queued run is approved, or
// a run is queued and approved for it.
export const acceptSuggestion = async (actor: Actor, id: string) => {
  const row = await suggestionOf(actor, id);
  if (row === undefined || row.status !== "new") {
    throw missingSuggestion(id);
  }
  const approvals = approvalsFor(actor);
  const queued =
    row.approvalId === null
      ? await enqueueRun(actor, row, "merchant")
      : {
          approval: await approvals.get(actor.userId, row.approvalId),
          ...(await Promise.all([autonomyOf(actor), spendToDate(actor)]).then(
            ([settings, spent]) => ({ settings, spent })
          )),
        };
  const decided =
    queued.approval.status === "pending"
      ? await approvals.decide(
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
  await actor.db
    .update(suggestion)
    .set({ status: "accepted" })
    .where(eq(suggestion.id, id));
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
    .where(eq(suggestion.userId, actor.userId))
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
