// Feature flags as code (docs/adr/0001-progressive-delivery.md): every flag
// in the registry the app reads (packages/core/src/flag-registry.ts), with
// its rollout per GitLab environment as Unleash strategies. Pulumi owns each
// flag's existence, description and strategies, so a rollout step is a
// reviewed merge request with a preview. The status toggle is the global
// kill switch: set when the flag is created, then left to people and the
// release guard (ignored), so flipping it is not drift.
import * as gitlab from "@pulumi/gitlab";
import * as pulumi from "@pulumi/pulumi";

import {
  FLAGS,
  FLAG_ENVIRONMENTS,
  FLAG_NAMES,
  INTERNAL_USER_LIST,
} from "../packages/core/src/flag-registry.ts";
import type {
  FlagDefinition,
  FlagEnvironment,
  Rollout,
} from "../packages/core/src/flag-registry.ts";

const config = new pulumi.Config();
const projectId = config.require("gitlabProjectId");

type Strategy = gitlab.types.input.ProjectFeatureFlagStrategy;

// One environment's rollout as GitLab strategies
// (docs.gitlab.com/operations/feature_flags): "All users" is `default`,
// "Percent of users" is `gradualRolloutUserId` (sticky by user ID) and
// "User list" is `gitlabUserList`.
export const strategiesOf = (
  name: string,
  environment: FlagEnvironment,
  rollout: Rollout,
  userListId: pulumi.Input<number>
): Strategy[] => {
  const scopes = [{ environmentScope: environment }];
  const internal: Strategy = { name: "gitlabUserList", scopes, userListId };
  switch (rollout.kind) {
    case "off": {
      return [];
    }
    case "internal": {
      return [internal];
    }
    case "percent": {
      return [
        internal,
        {
          name: "gradualRolloutUserId",
          // The flag's own group, so users land in independent buckets per
          // flag.
          parameters: { groupId: name, percentage: String(rollout.percent) },
          scopes,
        },
      ];
    }
    case "all": {
      return [{ name: "default", scopes }];
    }
    default: {
      throw new Error(`Unknown rollout for flag ${name}`);
    }
  }
};

export const featureFlags = () => {
  // The Better Auth user IDs of staff and demo accounts:
  // `pulumi config set --path 'wovain:internalUserIds[0]' <user id>`. GitLab
  // wants at least one ID, hence the placeholder that matches nobody.
  const ids = config.getObject<string[]>("internalUserIds") ?? [];
  const internalList = new gitlab.ProjectFeatureFlagUserList(
    INTERNAL_USER_LIST,
    {
      name: INTERNAL_USER_LIST,
      project: projectId,
      userXids: (ids.length > 0 ? ids : ["wovain-internal-placeholder"]).join(
        ","
      ),
    }
  );
  return FLAG_NAMES.map((name) => {
    const flag: FlagDefinition = FLAGS[name];
    return new gitlab.ProjectFeatureFlag(
      `flag-${name}`,
      {
        active: flag.initiallyActive,
        description: `${flag.description}. Owner: ${flag.owner.team} (@${flag.owner.gitlab}). Expires ${flag.expires}.`,
        name,
        project: projectId,
        strategies: FLAG_ENVIRONMENTS.flatMap((environment) =>
          strategiesOf(
            name,
            environment,
            flag.rollout[environment],
            internalList.listId
          )
        ),
      },
      { ignoreChanges: ["active"] }
    );
  });
};
