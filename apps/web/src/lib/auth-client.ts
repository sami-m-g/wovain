import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient carries a pending OAuth authorization (ChatGPT signing
// in through /api/auth/oauth2/authorize) through sign-in and consent.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});
