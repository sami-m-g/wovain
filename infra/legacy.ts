// What is left of main before the rebuild. The App Hosting backend, what it
// made and the secrets only its build read were released and then deleted
// (policy/retired.ts).
//
// gitlab-feature-flags-instance-id stays: production's frozen revision still
// mounts it (`wovain:freezeProduction`), so it and wovain-web's access to it stay,
// retained, until production next deploys.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { secretWithValue } from "./resources.ts";

const retain = { protect: true, retainOnDelete: true };

export const retainLegacy = ({ project }: { project: string }) => {
  const config = new pulumi.Config();

  // Kept while production's live revision reads it (see above).
  const { secret: featureFlags } = secretWithValue(
    "gitlab-feature-flags-instance-id",
    config.getSecret("gitlab-feature-flags-instance-id"),
    retain,
    retain
  );
  new gcp.secretmanager.SecretIamMember(
    "runner-gitlab-feature-flags-instance-id",
    {
      member: `serviceAccount:wovain-web@${project}.iam.gserviceaccount.com`,
      role: "roles/secretmanager.secretAccessor",
      secretId: featureFlags.id,
    },
    { retainOnDelete: true }
  );
};
