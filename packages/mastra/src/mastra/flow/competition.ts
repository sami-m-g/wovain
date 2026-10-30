import { readCompetition, saturatedReason } from "@wovain/core/competition";
import type { Competition } from "@wovain/core/competition";
import { campaign, design, idea, product } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { withAgentTrace } from "./agent-trace";
import { flagContextOf } from "./flags";
import { getIdea } from "./ideas";

// The competitive landscape per Qloo theme (@wovain/core/competition),
// behind the tavily-competition flag: read once per idea, saved on it, and
// read by the brief, the ad writer and autopilot. Each read is recorded in
// the run's decision trace.

type IdeaRow = typeof idea.$inferSelect;

export const competitionOff = () =>
  createError({
    fix: "Turn on the tavily-competition flag for this environment.",
    message: "The competition read isn't available yet",
    status: 404,
    why: "The tavily-competition flag is off.",
  });

export const isCompetitionOn = async (actor: Actor) =>
  await actor.core.flags.isOn("tavily-competition", flagContextOf(actor));

const save = async (actor: Actor, id: string, competition: Competition) => {
  await actor.db
    .update(idea)
    .set({ competition })
    .where(and(eq(idea.id, id), eq(idea.userId, actor.userId)));
  return competition;
};

// Reads and saves one idea's competition. A saved read is kept unless
// `again` (an unknown one read again from the card).
// Only a Qloo theme is read: an idea saved before Qloo was required, with no
// Qloo tag, keeps what it has.
const readFor = async (actor: Actor, row: IdeaRow, again = false) => {
  const qlooTheme = row.research.qlooTag !== undefined;
  if (!qlooTheme || (row.competition !== null && !again)) {
    return row.competition;
  }
  const competition = await withAgentTrace(
    actor,
    { runId: row.runId, traceId: row.runId ?? row.id },
    async () =>
      await readCompetition(
        { ask: actor.core.nemotron, client: actor.core.tavily },
        {
          affinities: row.research.taste?.affinities ?? [],
          theme: row.theme,
        },
        actor.log
      )
  );
  return await save(actor, row.id, competition);
};

// Every idea of a run, in parallel; the rows come back with their read.
// Off: the rows as they are.
export const readRunCompetition = async (actor: Actor, rows: IdeaRow[]) => {
  if (rows.length === 0 || !(await isCompetitionOn(actor))) {
    return rows;
  }
  return await Promise.all(
    rows.map(async (row) => ({
      ...row,
      competition: await readFor(actor, row),
    }))
  );
};

// The merchant's "check again" on an idea card.
export const readIdeaCompetition = async (actor: Actor, ideaId: string) => {
  if (!(await isCompetitionOn(actor))) {
    throw competitionOff();
  }
  const row = await getIdea(actor, ideaId);
  return await readFor(actor, row, row.competition?.status !== "read");
};

// Autopilot passes over saturated themes and stores why on each.
export const skipSaturated = async (actor: Actor, rows: IdeaRow[]) => {
  const kept: IdeaRow[] = [];
  for (const row of rows) {
    if (row.competition?.saturated !== true) {
      kept.push(row);
      continue;
    }
    const skipped = saturatedReason(row.competition);
    // oxlint-disable-next-line no-await-in-loop
    await save(actor, row.id, { ...row.competition, skipped });
    actor.log?.set({ autopilot: { skipped: row.id } });
  }
  return kept;
};

// The competition behind a campaign's ads: its product's design's idea.
export const campaignCompetition = async (
  actor: Actor,
  campaignId: string
): Promise<Competition | null> => {
  if (!(await isCompetitionOn(actor))) {
    throw competitionOff();
  }
  const [row] = await actor.db
    .select({ competition: idea.competition })
    .from(campaign)
    .innerJoin(product, eq(product.id, campaign.productId))
    .innerJoin(design, eq(design.id, product.designId))
    .innerJoin(idea, eq(idea.id, design.ideaId))
    .where(and(eq(campaign.id, campaignId), eq(campaign.userId, actor.userId)));
  return row?.competition ?? null;
};
