// wovain's billing catalog in Polar is code (packages/billing): the infra
// workflow runs `pnpm polar:seed` after every `pulumi up` on main
// (.github/workflows/infra.yml). The seed keeps each enabled promo's code in
// a `polar-promo-<id>` secret, the only copy outside Polar, and reads it to
// know whether the code is stored. Pulumi owns the secret; its versions are
// the seed's, so `pulumi up` never touches a code. No app reads them.
// These are production's; next's seed (POLAR_METADATA_KEY=wovain:next) writes
// its own `polar-promo-<id>-next` secrets (packages/billing/src/plans.ts).
import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";

// packages/billing/src/promos.ts: the promos that are on.
const PROMO_IDS = ["judges-2026"] as const;

export const polarPromoSecrets = (
  project: string,
  opts: pulumi.CustomResourceOptions
) => {
  for (const id of PROMO_IDS) {
    const secretId = `polar-promo-${id}`;
    // The seed made it first; adopted.
    new gcp.secretmanager.Secret(
      secretId,
      { replication: { auto: {} }, secretId },
      { ...opts, import: `projects/${project}/secrets/${secretId}` }
    );
  }
};
