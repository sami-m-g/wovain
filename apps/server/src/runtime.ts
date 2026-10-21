import { createAuth } from "./auth/auth.ts";
import { loadAuthEnv, siteUrl } from "./auth/env.ts";
import { loadEnv } from "./env.ts";
import { createStorage } from "./firebase.ts";

// The deployed server's dependencies, from process.env and the Firebase
// project it runs in: Firestore and the private Storage bucket. Nothing
// connects until the first request.
export const createRuntime = () => {
  const authEnv = loadAuthEnv();
  const env = loadEnv({
    WOVAIN_ICON_URL: `${siteUrl(authEnv)}/icon.png`,
    ...process.env,
  });
  return {
    auth: createAuth(authEnv),
    authEnv,
    env,
    storage: createStorage(),
  };
};

export type Runtime = ReturnType<typeof createRuntime>;
