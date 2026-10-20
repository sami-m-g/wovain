import { defineConfig } from "@neon/config/v1";

// The Neon project behind wovain (the Neon project named wovain, managed through the Vercel
// integration). Preview it with `bunx neon@8.8.0 config plan` and apply it
// with `bunx neon@8.8.0 config apply`; both need a Neon API key.
export default defineConfig({
  // Sign-in runs on Better Auth in apps/web (Neon Auth can't be ChatGPT's
  // OAuth server), so Neon's managed auth stays off.
  auth: false,
  branch: (branch) => {
    // main is production: only migrations change it. It isn't marked
    // protected because the plan's protected-branch slots are all in use.
    if (branch.isDefault === true) {
      return {};
    }
    // dev is the long-lived branch for local work.
    if (branch.name === "dev") {
      return { parent: "main" };
    }
    // Anything else (a preview's or a test's branch) cleans itself up.
    return { parent: "main", ttl: "7d" };
  },
});
