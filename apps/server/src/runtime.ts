import { createAuth } from "./auth/auth.ts";
import { loadAuthEnv, siteUrl } from "./auth/env.ts";
import { loadEnv } from "./env.ts";
import { createStorage } from "./firebase.ts";
import type { Storage } from "./firebase.ts";
import { kmsCipher, localCipher } from "./lib/cipher.ts";
import { createConnections } from "./lib/connections.ts";
import { createUpstream } from "./lib/upstream.ts";

// Merchant connections need the KMS key, except on the emulators (`pnpm
// dev`), where an in-memory key stands in. Without either they're off.
const cipherFor = (keyName: string | undefined) => {
  const emulated = process.env["FIRESTORE_EMULATOR_HOST"] !== undefined;
  const local = emulated ? localCipher() : undefined;
  return keyName === undefined ? local : kmsCipher(keyName);
};

const upstreamFor = (
  keyName: string | undefined,
  storage: Storage,
  site: string
) => {
  const cipher = cipherFor(keyName);
  return cipher === undefined
    ? undefined
    : createUpstream({
        connections: createConnections(storage.db, cipher),
        site,
      });
};

// The deployed server's dependencies, from process.env and the Firebase
// project it runs in: Firestore and the private Storage bucket. Nothing
// connects until the first request.
export const createRuntime = () => {
  const authEnv = loadAuthEnv();
  const env = loadEnv({
    WOVAIN_ICON_URL: `${siteUrl(authEnv)}/icon.png`,
    ...process.env,
  });
  const storage = createStorage();
  return {
    auth: createAuth(authEnv),
    authEnv,
    env,
    storage,
    upstream: upstreamFor(env.WOVAIN_KMS_KEY, storage, siteUrl(authEnv)),
  };
};

export type Runtime = ReturnType<typeof createRuntime>;
