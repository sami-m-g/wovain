import { connection } from "next/server";
import type { ReactNode } from "react";

import { AuthProviders } from "@/components/auth-providers";
import { ENV } from "@/env.server";

/**
 * Google sign-in is configured per deployment (Cloud Run env), not at build
 * time: `connection()` makes this subtree render per request. Reading ENV
 * during prerender would bake `false` into the HTML, because `next build`
 * runs without the Google credentials.
 */
export const AuthSession = async ({ children }: { children: ReactNode }) => {
  await connection();
  const google = Boolean(ENV.GOOGLE_CLIENT_ID && ENV.GOOGLE_CLIENT_SECRET);
  return <AuthProviders google={google}>{children}</AuthProviders>;
};
