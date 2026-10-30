import { log as evlog } from "evlog";
import { z } from "zod";

import { conversationId, usablePages } from "./ads";
import type { GraphReadiness } from "./meta-graph";
import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// Meta setup (openspec meta-setup): what a first-time seller's Meta account
// needs before an ad can run, read through Meta's Ads MCP tools, as cards the
// Store setup checklist shows. The steps only the account owner can take
// (adding a card, creating a Page, linking Instagram) are deep links into
// Meta's own screens; the page polls, so each ticks off by itself once it is
// done. Replies are untrusted account data: a field that isn't there counts
// as not done yet.

const idish = z.union([z.string().min(1), z.number()]);

const accountSchema = z.looseObject({
  account_status: z.union([z.string(), z.number()]).optional(),
  ad_account_id: idish,
  ad_account_name: z.string().optional(),
  business_id: z.union([z.string(), z.number()]).optional(),
  has_payment_method: z.boolean().optional(),
  is_ads_mcp_enabled: z.boolean().optional(),
});

// Meta's ad account statuses: 1 is active; the rest stop delivery.
// https://developers.facebook.com/docs/marketing-api/reference/ad-account/
const ACTIVE = 1;
const ACCOUNT_STATES: Record<number, string> = {
  1: "ACTIVE",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  2: "DISABLED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
};

const statusName = (status: string | number | undefined) => {
  if (status === undefined) {
    return;
  }
  const code = Number(status);
  return Number.isInteger(code)
    ? (ACCOUNT_STATES[code] ?? String(status))
    : String(status).toUpperCase();
};

export interface MetaAccountFacts {
  account:
    | {
        id: string;
        name: string | null;
        businessId: string | null;
        // Meta's status name: ACTIVE, DISABLED, UNSETTLED…
        status: string | null;
        hasPaymentMethod: boolean | null;
      }
    | undefined;
  pages: { id: string; name: string | null }[];
  // Undefined when Meta wouldn't say (the step is optional anyway).
  instagram: { id: string; username: string | null }[] | undefined;
}

const SETUP_JOB = "set_up_and_fix_ad_account";

// The merchant's ad account (the first one open to wovain), its Pages and
// its Instagram accounts.
export const readMetaAccount = async (
  call: ToolCall
): Promise<MetaAccountFacts> => {
  const ask = async (tool: string, args: Record<string, unknown> = {}) =>
    await call(tool, {
      advertiser_job: SETUP_JOB,
      client_conversation_id: conversationId("meta-setup"),
      ...args,
    });
  const accounts = findAll(accountSchema, await ask("ads_get_ad_accounts"));
  const open =
    accounts.find((account) => account.is_ads_mcp_enabled === true) ??
    accounts.find((account) => account.is_ads_mcp_enabled === undefined);
  if (open === undefined) {
    return { account: undefined, instagram: undefined, pages: [] };
  }
  const id = String(open.ad_account_id);
  const pages = await usablePages(ask, id);
  let instagram: MetaAccountFacts["instagram"];
  try {
    instagram = findAll(
      z.looseObject({
        id: idish.optional(),
        ig_account_id: idish.optional(),
        username: z.string().optional(),
      }),
      await ask("ads_get_ig_accounts", { ad_account_id: id })
    ).flatMap((row) => {
      const igId = row.ig_account_id ?? row.id;
      return igId === undefined
        ? []
        : [{ id: String(igId), username: row.username ?? null }];
    });
  } catch (error) {
    // Optional step: Meta not answering leaves it unknown, never failed,
    // and the failure still reaches error tracking.
    evlog.error({
      error: {
        message: `Meta setup couldn't read Instagram accounts: ${error instanceof Error ? error.message : String(error)}`,
        name: "MetaSetupReadFailed",
      },
      metaSetup: { part: "instagram" },
    });
    instagram = undefined;
  }
  const businessId =
    open.business_id === undefined || String(open.business_id) === ""
      ? null
      : String(open.business_id);
  return {
    account: {
      businessId,
      hasPaymentMethod: open.has_payment_method ?? null,
      id,
      name: open.ad_account_name ?? null,
      status: statusName(open.account_status) ?? null,
    },
    instagram,
    pages,
  };
};

// ---------------------------------------------------------------------------
// The cards

export const META_STEPS = [
  "ad_account",
  "payment",
  "page",
  "instagram",
  "safety_rules",
] as const;
export type MetaStepId = (typeof META_STEPS)[number];

// done: nothing left. todo: the merchant has a step to take in Meta.
// waiting: Meta has to act (a review), or another step comes first.
// check: wovain can't tell; the merchant looks.
export type MetaStepState = "done" | "todo" | "waiting" | "check";

// How a step gets done: a deep link into Meta (opens in a new tab, the
// card ticks off by polling), or reconnecting Meta here.
export type MetaStepHow = "link" | "reconnect" | "none";

export interface MetaSetupStep {
  id: MetaStepId;
  state: MetaStepState;
  how: MetaStepHow;
  // The exact Meta screen, when the step is a link.
  href: string | null;
  // A second way to do it (create a Page instead of adding one).
  altHref: string | null;
  // Blocks running ads while not done.
  required: boolean;
}

// Meta's own screens, scoped to the account or business where Meta allows.
const inBusiness = (path: string, businessId: string | null) =>
  businessId === null
    ? `https://business.facebook.com/settings/${path}`
    : `https://business.facebook.com/settings/${path}?business_id=${businessId}`;

export const metaLinks = {
  // Meta's account quality screen: why an account is disabled or held.
  accountQuality: "https://business.facebook.com/business-support-home",
  adAccounts: (businessId: string | null) =>
    inBusiness("ad-accounts", businessId),
  instagram: (businessId: string | null) =>
    inBusiness("instagram-account-v2s", businessId),
  // A new Page, or an existing one added to the business (which makes it
  // available to the business's ad accounts).
  pageCreate: "https://www.facebook.com/pages/creation/",
  pageLink: (businessId: string | null) => inBusiness("pages", businessId),
  // Billing hub, payment methods of this ad account.
  payment: (adAccountId: string) =>
    `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${adAccountId}`,
} as const;

export interface MetaSetupInput {
  facts: MetaAccountFacts | undefined;
  // Undefined when Graph couldn't be asked (no ad account yet, or an
  // answer that failed and was logged).
  graph: GraphReadiness | undefined;
}

type Account = NonNullable<MetaAccountFacts["account"]>;

const done = (id: MetaStepId, required = true): MetaSetupStep => ({
  altHref: null,
  how: "none",
  href: null,
  id,
  required,
  state: "done",
});

const linked = (
  id: MetaStepId,
  state: MetaStepState,
  href: string,
  {
    altHref = null,
    required = true,
  }: { altHref?: string | null; required?: boolean } = {}
): MetaSetupStep => ({ altHref, how: "link", href, id, required, state });

const waiting = (id: MetaStepId, required = true): MetaSetupStep => ({
  altHref: null,
  how: "none",
  href: null,
  id,
  required,
  state: "waiting",
});

const isActive = (account: Account) =>
  account.status === ACCOUNT_STATES[ACTIVE];

// A disabled or held account needs Meta's review, not a new card.
const isHeld = (account: Account) =>
  account.status !== null &&
  !isActive(account) &&
  account.status !== "UNSETTLED";

const paymentStep = (account: Account): MetaSetupStep => {
  if (account.hasPaymentMethod === true && isActive(account)) {
    return done("payment");
  }
  return linked(
    "payment",
    isHeld(account) ? "waiting" : "todo",
    metaLinks.payment(account.id)
  );
};

const pageStep = (account: Account, facts: MetaAccountFacts) =>
  facts.pages.length > 0
    ? done("page")
    : linked("page", "todo", metaLinks.pageLink(account.businessId), {
        altHref: metaLinks.pageCreate,
      });

const instagramStep = (account: Account, facts: MetaAccountFacts) => {
  if (facts.instagram !== undefined && facts.instagram.length > 0) {
    return done("instagram", false);
  }
  return linked(
    "instagram",
    facts.instagram === undefined ? "check" : "todo",
    metaLinks.instagram(account.businessId),
    { required: false }
  );
};

const safetyStep = (graph: GraphReadiness | undefined): MetaSetupStep => {
  if (graph === undefined) {
    return waiting("safety_rules");
  }
  if (graph.state === "ready") {
    return done("safety_rules");
  }
  return {
    altHref: null,
    how: "reconnect",
    href: null,
    id: "safety_rules",
    required: true,
    state: "todo",
  };
};

export const evaluateMetaSetup = ({
  facts,
  graph,
}: MetaSetupInput): MetaSetupStep[] => {
  const account = facts?.account;
  if (facts === undefined || account === undefined) {
    return [
      linked("ad_account", "todo", metaLinks.adAccounts(null)),
      waiting("payment"),
      waiting("page"),
      waiting("instagram", false),
      waiting("safety_rules"),
    ];
  }
  return [
    isHeld(account)
      ? linked("ad_account", "waiting", metaLinks.accountQuality)
      : done("ad_account"),
    paymentStep(account),
    pageStep(account, facts),
    instagramStep(account, facts),
    safetyStep(graph),
  ];
};
