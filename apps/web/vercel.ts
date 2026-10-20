import type { VercelConfig } from "@vercel/config/v1";

// Project config for apps/web (the Vercel project's root directory). Vercel
// compiles this to vercel.json on every build and deploy.
export const config: VercelConfig = {
  // Run the functions on Bun, as everything else in the repo does.
  bunVersion: "1.4.x",
  framework: "nextjs",
};
