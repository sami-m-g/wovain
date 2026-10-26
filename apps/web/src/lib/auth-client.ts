import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { wovainAuthClient } from "@/lib/auth-client-plugin";
import type { auth } from "@/services";

// oauthProviderClient carries a pending OAuth authorization (ChatGPT signing
// in through /api/auth/oauth2/authorize) through sign-in and consent.
// inferAdditionalFields types the user's `locale` (sent at sign-up so emails
// match the site's language) from the server's auth config. wovainAuthClient
// localizes callback URLs and keeps PostHog's identity in step with sign-in
// and sign-out.
export const authClient = createAuthClient({
  plugins: [
    oauthProviderClient(),
    inferAdditionalFields<typeof auth>(),
    wovainAuthClient(),
  ],
});
