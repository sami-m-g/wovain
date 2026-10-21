import { z } from "zod";

// Sign-in settings. On Vercel the site URL comes from the deployment; locally
// it is localhost. /mcp turns every caller away until AuthKit is set up.
const authEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  // Reads each caller's email for the allowlist.
  WORKOS_API_KEY: z.string().optional(),
  // The AuthKit domain that signs merchants in and issues /mcp's tokens.
  WORKOS_AUTHKIT_DOMAIN: z.url().optional(),
  // Comma-separated emails allowed to sign in. Until each merchant links their
  // own Meta and fal accounts, every signed-in user acts through the
  // operator's keys, so an empty list lets nobody in.
  WOVAIN_ALLOWED_EMAILS: z
    .string()
    .default("")
    .transform(
      (value) =>
        new Set(
          value
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email !== "")
        )
    ),
  // Overrides the deployment's URL, e.g. a tunnel to the local server.
  WOVAIN_SITE_URL: z.url().optional(),
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
  if (env.WOVAIN_SITE_URL !== undefined) {
    return env.WOVAIN_SITE_URL.replace(/\/$/u, "");
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

export interface AllowCheck {
  email: string;
  emailVerified: boolean;
}

// Only a verified email on the allowlist may call the tools.
export const isAllowed = (env: AuthEnv, user: AllowCheck | null | undefined) =>
  user !== null &&
  user !== undefined &&
  user.emailVerified &&
  env.WOVAIN_ALLOWED_EMAILS.has(user.email.toLowerCase());
