import { fileURLToPath } from "node:url";

// The jobs run from apps/ops (Varlock loads its .env.schema from the working
// directory), but their artifacts and git commands belong to the repository
// root, where .gitlab/ci/*.yml collects them.
export const fromRoot = (path = ""): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));
