// State changes no program can make, as pure functions of a checkpoint
// (`pulumi stack export`), so they are tested without a backend
// (program.test.ts). scripts/pulumi.ts applies them.
import { RETIRED } from "../policy/retired.ts";

interface StateResource {
  protect?: boolean;
  retainOnDelete?: boolean;
  type: string;
  urn: string;
}

export interface Checkpoint {
  deployment: { resources?: StateResource[] };
}

// project::type::name: a URN without `urn:pulumi:<stack>::`.
const retiredKey = (urn: string) => urn.split("::").slice(1).join("::");

// RETIRED's "deleted" resources that the state still protects or retains.
// Release in code (legacy.ts) was meant to clear both flags with an `up`
// before the pull request that deletes the declaration; when that `up`
// never ran (#47 and #48 merged while production was frozen), the state
// still holds them, so the engine refuses the delete (protect) or would only
// forget the resource (retainOnDelete). Clearing both flags here gives the
// state the release's result, so the next `up` deletes them as planned.
export const releaseDeleted = (checkpoint: Checkpoint) => {
  const released: string[] = [];
  for (const resource of checkpoint.deployment.resources ?? []) {
    const stale = resource.protect === true || resource.retainOnDelete === true;
    if (RETIRED[retiredKey(resource.urn)] === "deleted" && stale) {
      resource.protect = false;
      resource.retainOnDelete = false;
      released.push(resource.urn);
    }
  }
  return released;
};
