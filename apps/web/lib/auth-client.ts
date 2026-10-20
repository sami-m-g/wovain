import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// Inside an OAuth flow the plugin forwards the signed `oauth_query`, so after
// sign-in or consent the server sends the merchant back to ChatGPT.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});
