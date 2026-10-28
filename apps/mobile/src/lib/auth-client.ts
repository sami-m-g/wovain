import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { ENV } from "@/env";

// Better Auth's Expo client (better-auth.com/docs/integrations/expo): the
// session cookie lives in SecureStore, and social sign-in returns to the
// wovain:// scheme the server trusts (packages/auth trustedOrigins).
export const authClient = createAuthClient({
  baseURL: ENV.EXPO_PUBLIC_API_URL,
  plugins: [
    expoClient({
      scheme: "wovain",
      storage: SecureStore,
      storagePrefix: "wovain",
    }),
  ],
});
