import { usablePages } from "@wovain/core/ads";
import type { MetaPage } from "@wovain/core/ads";
import { readMetaAccount } from "@wovain/core/meta-setup";
import type { ToolCall } from "@wovain/core/upstream";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { connection } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import { withProvider } from "./connections";

// The Facebook Page a merchant's ads run as (the Campaign step's "Change
// Page"). Meta lists the Pages promoted under the ad account, else every
// Page the merchant may advertise for (@wovain/core/ads usablePages). The
// merchant's pick is kept on their Meta connection; without one, the Page
// named like their brand, else the first.

const comparable = (name: string) => name.toLowerCase().replaceAll(/\W/gu, "");

const mine = (userId: string) =>
  and(eq(connection.userId, userId), eq(connection.provider, "meta"));

const savedPage = async ({ db, userId }: Actor) => {
  const [row] = await db
    .select({ pageId: connection.pageId })
    .from(connection)
    .where(mine(userId));
  return row?.pageId ?? undefined;
};

const brandName = async ({ db, userId }: Actor) => {
  const [row] = await db
    .select({ name: brandProfile.displayName })
    .from(brandProfile)
    .where(eq(brandProfile.userId, userId));
  return row?.name ?? undefined;
};

// The saved Page while Meta still lists it; else the brand's, else the first.
const pick = async (actor: Actor, pages: MetaPage[]) => {
  const saved = await savedPage(actor);
  const kept = pages.find((page) => page.id === saved);
  if (kept !== undefined) {
    return kept;
  }
  const brand = await brandName(actor);
  const named =
    brand === undefined
      ? undefined
      : pages.find(
          (page) =>
            page.name !== null && comparable(page.name) === comparable(brand)
        );
  return named ?? pages[0];
};

// The Page ID a campaign runs as, read on the staging's own Meta session.
export const pageForAds = async (
  actor: Actor,
  call: ToolCall,
  adAccountId: string
) => {
  const page = await pick(actor, await usablePages(call, adAccountId));
  return page?.id;
};

export const metaPages = async (actor: Actor) => {
  const facts = await withProvider(
    actor,
    "meta",
    async (call) => await readMetaAccount(call)
  );
  const selected = await pick(actor, facts.pages);
  return { pages: facts.pages, selected: selected?.id ?? null };
};

export const chooseMetaPage = async (actor: Actor, pageId: string) => {
  const { pages } = await metaPages(actor);
  if (!pages.some((page) => page.id === pageId)) {
    throw notReady({
      fix: "Pick one of the Pages listed, or add the Page in Meta first.",
      message: "Meta doesn't list that Page for your ads",
    });
  }
  await actor.db.update(connection).set({ pageId }).where(mine(actor.userId));
  return { pages, selected: pageId };
};
