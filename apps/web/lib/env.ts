import { z } from "zod";

// Sign-in settings. On Vercel the site URL comes from the deployment; locally
// it is localhost. Google sign-in stays off until both of its keys are set.
const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  DATABASE_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

// `cp .env.example .env` leaves `KEY=` lines; treat those as unset.
export const loadAuthEnv = (
  source: Record<string, string | undefined> = process.env
): AuthEnv =>
  authEnvSchema.parse(
    Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== "")
    )
  );

// The origin ChatGPT reaches: the production domain, a preview's own URL, or
// localhost. MCP tokens are bound to `${siteUrl}/mcp`, so it must be exact.
export const siteUrl = (env: AuthEnv) => {
  if (env.BETTER_AUTH_URL !== undefined) {
    return env.BETTER_AUTH_URL.replace(/\/$/u, "");
  }
  if (
    env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_PRODUCTION_URL !== undefined
  ) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (env.VERCEL_URL !== undefined) {
    return `https://${env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};
