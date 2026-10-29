import type { GraphReadiness } from "@wovain/core/meta-graph";
import { evaluateMetaSetup, readMetaAccount } from "@wovain/core/meta-setup";
import type { MetaAccountFacts } from "@wovain/core/meta-setup";
import { log } from "evlog";

import type { Actor } from "./actor";
import { listConnections, withProvider } from "./connections";
import { reachMilestone } from "./milestones";

// Meta setup (openspec meta-setup): the cards that take a first-time
// seller's Meta account to ad-ready, shown with the Store setup checklist.
// The page polls this, so a step finished in Meta (a card added, a Page
// linked) ticks off by itself. With the merchant's own grant it also asks
// Graph whether the safety rules can run (the meta_graph_ready milestone).

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const logFailure = (actor: Actor, part: string, error: unknown) => {
  log.error({
    error: {
      message: `Meta setup couldn't read ${part}: ${messageOf(error)}`,
      name: "MetaSetupReadFailed",
    },
    metaSetup: { part },
    userId: actor.userId,
  });
};

const milestonesOf = async (
  actor: Actor,
  steps: ReturnType<typeof evaluateMetaSetup>
) => {
  const isDone = (id: string) =>
    steps.some((step) => step.id === id && step.state === "done");
  const reached: Promise<boolean>[] = [];
  if (isDone("payment")) {
    reached.push(reachMilestone(actor, "meta_payment_ready"));
  }
  if (isDone("page")) {
    reached.push(reachMilestone(actor, "meta_page_ready"));
  }
  if (isDone("safety_rules")) {
    reached.push(reachMilestone(actor, "meta_graph_ready"));
  }
  try {
    await Promise.all(reached);
  } catch (error) {
    logFailure(actor, "milestones", error);
  }
};

export const metaSetup = async (actor: Actor) => {
  const connections = await listConnections(actor);
  const meta = connections.find((each) => each.provider === "meta");
  if (meta === undefined || meta.needsReconnect) {
    return {
      account: null,
      connected: meta !== undefined,
      graph: null,
      needsReconnect: meta?.needsReconnect === true,
      steps: evaluateMetaSetup({ facts: undefined, graph: undefined }),
    };
  }
  const { facts, graph } = await withProvider(
    actor,
    "meta",
    async (call, accessToken) => {
      const read: MetaAccountFacts = await readMetaAccount(call);
      let ready: GraphReadiness | undefined;
      try {
        ready = await actor.core.metaGraph.readiness(
          await accessToken(),
          read.account?.id,
          actor.log
        );
        if (ready.state !== "ready") {
          logFailure(
            actor,
            "Graph permissions",
            new Error(
              ready.state === "refused"
                ? `Graph refused the Meta grant: ${ready.reason}`
                : `Missing Graph permissions: ${ready.missing.join(", ")}`
            )
          );
        }
      } catch (error) {
        logFailure(actor, "Graph permissions", error);
        ready = undefined;
      }
      return { facts: read, graph: ready };
    }
  );
  const steps = evaluateMetaSetup({ facts, graph });
  await milestonesOf(actor, steps);
  return {
    account: facts.account ?? null,
    connected: true,
    graph: graph ?? null,
    needsReconnect: false,
    steps,
  };
};
