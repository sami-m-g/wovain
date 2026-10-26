import { ENV } from "@/env.server";

// The site's public origin. Behind Cloud Run the standalone server sees its
// bind address (http://0.0.0.0:3001) as `request.nextUrl.origin`, so redirects
// back to the browser come from the configured URL, never from the request.
export const publicOrigin = (): string => new URL(ENV.BETTER_AUTH_URL).origin;
