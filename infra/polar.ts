// wovain's billing catalog in Polar is code (packages/billing): the infra
// workflow runs `pnpm polar:seed` after every `pulumi up` on main
// (.github/workflows/infra.yml). The seed keeps each enabled promo's code in
// a `polar-promo-<id>` secret, the only copy outside Polar, and reads it to
// know whether the code is stored. Pulumi owns the secret; its versions are
// the seed's, so `pulumi up` never touches a code. No app reads them.
//
// An environment that shares the project with its own Polar metadata key
// (POLAR_METADATA_KEY=wovain:next) has its own secrets, `polar-promo-<id>-next`
// (packages/billing/src/promos.ts), so seeding it never adds a version to
// production's.
import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";

// packages/billing/src/promos.ts: the promos that are on.
const PROMO_IDS = ["judges-2026"] as const;

// Production's id has no suffix; an environment's ends with its name.
export const polarPromoSecretId = (id: string, environment?: string) =>
  environment === undefined
    ? `polar-promo-${id}`
    : `polar-promo-${id}-${environment}`;

export const polarPromoSecrets = (
  project: string,
  opts: pulumi.CustomResourceOptions
) => {
  for (const id of PROMO_IDS) {
    const secretId = polarPromoSecretId(id);
    // The seed made it first; adopted.
    new gcp.secretmanager.Secret(
      secretId,
      { replication: { auto: {} }, secretId },
      { ...opts, import: `projects/${project}/secrets/${secretId}` }
    );
  }
};

interface CatalogPromos {
  promos?: { enabled: boolean; id: string }[];
}

// An environment's secret for each promo that is on in its BILLING_CATALOG,
// made here before its first seed, which then adds the code as a version.
export const environmentPromoSecrets = (
  environment: string,
  catalog: CatalogPromos,
  opts: pulumi.CustomResourceOptions
) =>
  (catalog.promos ?? [])
    .filter((promo) => promo.enabled)
    .map((promo) => {
      const secretId = polarPromoSecretId(promo.id, environment);
      return new gcp.secretmanager.Secret(
        secretId,
        { replication: { auto: {} }, secretId },
        opts
      );
    });
