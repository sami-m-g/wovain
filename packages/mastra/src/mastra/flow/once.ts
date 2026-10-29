import { externalWrite } from "@wovain/db/schema/durable";
import { and, eq } from "drizzle-orm";

import type { Actor } from "./actor";

// A write to a provider, done at most once per key however often the step
// that makes it is retried. The key is saved as pending before the call and
// as done with its result after it. A retry that finds:
// - done: returns the saved result and sends nothing;
// - pending: the earlier attempt died without an answer, so `recover` looks
//   for what it made on the provider first, and the call is sent again only
//   when nothing is found (or there is no way to look).
export interface Write<T> {
  key: string;
  operation: string;
  perform: () => Promise<T>;
  provider: (typeof externalWrite.$inferInsert)["provider"];
  recover?: (() => Promise<T | undefined>) | undefined;
  runId?: string | null | undefined;
}

const settle = async (db: Actor["db"], key: string, result: unknown) => {
  await db
    .update(externalWrite)
    .set({ result, state: "done" })
    .where(eq(externalWrite.key, key));
};

export const once = async <T>(
  { db, userId }: Pick<Actor, "db" | "userId">,
  { key, operation, perform, provider, recover, runId }: Write<T>
): Promise<T> => {
  const [claimed] = await db
    .insert(externalWrite)
    .values({ key, operation, provider, runId: runId ?? null, userId })
    .onConflictDoNothing()
    .returning({ key: externalWrite.key });
  if (claimed === undefined) {
    const [earlier] = await db
      .select()
      .from(externalWrite)
      .where(and(eq(externalWrite.key, key), eq(externalWrite.userId, userId)));
    if (earlier === undefined) {
      throw new Error(`Another merchant's write holds the key ${key}`);
    }
    if (earlier.state !== "pending") {
      return earlier.result as T;
    }
    const found = await recover?.();
    if (found !== undefined) {
      await settle(db, key, found);
      return found;
    }
  }
  const result = await perform();
  await settle(db, key, result);
  return result;
};
