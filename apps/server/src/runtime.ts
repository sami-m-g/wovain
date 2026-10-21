import { createAuth } from "./auth/auth.ts";
import { loadAuthEnv, siteUrl } from "./auth/env.ts";
import { createDb } from "./db/client.ts";
import { loadEnv } from "./env.ts";
import { blobMedia } from "./store.ts";

// The deployed server's dependencies, from process.env: Neon (main in
// production, the dev branch locally) and the private Blob store. Nothing
// connects until the first query, so the server starts without DATABASE_URL;
// requests then fail until it is set.
export const createRuntime = () => {
  const authEnv = loadAuthEnv();
  const env = loadEnv({
    WOVAIN_ICON_URL: `${siteUrl(authEnv)}/icon.png`,
    ...process.env,
  });
  const db = createDb(env.DATABASE_URL ?? "postgres://unset.invalid/wovain");
  return {
    auth: createAuth(authEnv, db),
    authEnv,
    env,
    storage: { db, media: blobMedia(env.BLOB_READ_WRITE_TOKEN) },
  };
};

export type Runtime = ReturnType<typeof createRuntime>;
