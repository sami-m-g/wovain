import { createAuth } from "./auth/auth.ts";
import type { Auth } from "./auth/auth.ts";
import { loadEnv } from "./env.ts";
import type { Env } from "./env.ts";
import { createStorage } from "./firebase.ts";
import type { Storage } from "./firebase.ts";
import { createBrowserConfirm } from "./lib/browser-confirm.ts";
import type { BrowserConfirm } from "./lib/browser-confirm.ts";
import { createBrowserSignIn } from "./lib/browser-sign-in.ts";
import type { BrowserSignIn } from "./lib/browser-sign-in.ts";
import { kmsCipher, localCipher } from "./lib/cipher.ts";
import { createConnections } from "./lib/connections.ts";
import { createUpstream } from "./lib/upstream.ts";
import type { Clients, Upstream } from "./lib/upstream.ts";
import { createOptimizer } from "./optimizer/service.ts";
import type { Optimizer } from "./optimizer/service.ts";

// Merchant connections need the KMS key, except on the emulators (`pnpm
// dev`), where an in-memory key stands in. Without either they're off.
const cipherFor = (keyName: string | undefined) => {
  const emulated = process.env["FIRESTORE_EMULATOR_HOST"] !== undefined;
  const local = emulated ? localCipher() : undefined;
  return keyName === undefined ? local : kmsCipher(keyName);
};

// The wovain user an AuthKit token for /mcp belongs to, checked exactly as
// /mcp checks it (signature, issuer, audience and the allowlist).
const userOfFor = (auth: Auth, site: string) => async (accessToken: string) => {
  const authInfo = await auth.gate(
    new Request(`${site}/mcp`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  );
  const userId =
    authInfo instanceof Response ? undefined : authInfo.extra?.["userId"];
  const allowed = typeof userId === "string" && (await auth.allowed(userId));
  return allowed ? userId : undefined;
};

// Meta's Ads MCP takes no CIMD or DCR: wovain's Meta app is its client.
const clientsFor = ({ META_APP_ID, META_APP_SECRET }: Env): Clients =>
  META_APP_ID === undefined
    ? {}
    : {
        meta: {
          client_id: META_APP_ID,
          ...(META_APP_SECRET === undefined
            ? {}
            : { client_secret: META_APP_SECRET }),
        },
      };

export interface Connect {
  signIn: BrowserSignIn;
  upstream: Upstream;
}

const connectFor = (
  env: Env,
  storage: Storage,
  auth: Auth,
  site: string
): Connect | undefined => {
  const cipher = cipherFor(env.WOVAIN_KMS_KEY);
  if (cipher === undefined) {
    return undefined;
  }
  const connections = createConnections(storage.db, cipher);
  return {
    signIn: createBrowserSignIn({
      connections,
      site,
      userOf: userOfFor(auth, site),
    }),
    upstream: createUpstream({
      clients: clientsFor(env),
      connections,
      site,
    }),
  };
};

// The deployed server's dependencies, from process.env and the Firebase
// project it runs in: Firestore and the private Storage bucket. Nothing
// connects until the first request.
export const createRuntime = () => {
  const env = loadEnv();
  const site = env.WOVAIN_SITE_URL;
  const auth = createAuth(env);
  const storage = createStorage();
  return {
    auth,
    // Merchants confirm approvals in the browser (routes/confirm.ts).
    confirm: createBrowserConfirm({
      db: storage.db,
      site,
      userOf: userOfFor(auth, site),
    }),
    connect: connectFor(env, storage, auth, site),
    env,
    // Webhooks and background runs (docs/changes/25-optimizer).
    optimizer: createOptimizer(env, storage.db, cipherFor(env.WOVAIN_KMS_KEY)),
    storage,
  };
};

// Approvals, connections and the optimizer are optional, so tests can leave
// them out.
export type Runtime = Omit<
  ReturnType<typeof createRuntime>,
  "confirm" | "optimizer"
> & {
  confirm?: BrowserConfirm | undefined;
  optimizer?: Optimizer | undefined;
};
