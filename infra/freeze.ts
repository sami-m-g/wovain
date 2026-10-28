// Production (wovain.com) is frozen until freeze.json's date: the build the
// Transcend judges saw keeps running. Until then every resource freeze.json
// lists keeps its live settings: the program may still declare changes to
// it, but they are ignored, so no `pulumi up` rolls a new revision. The
// preview guard (policy/guard.ts) fails a plan that changes one anyway.
// Imported first by index.ts, so the transform sees every resource.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- our own file
const freeze = JSON.parse(
  readFileSync(new URL("freeze.json", import.meta.url), "utf-8")
) as { until: string; resources: string[] };

if (new Date() < new Date(freeze.until)) {
  const frozen = new Set(freeze.resources);
  pulumi.runtime.registerResourceTransform(({ name, opts, props, type }) =>
    frozen.has(`${pulumi.getProject()}::${type}::${name}`)
      ? {
          opts: {
            ...opts,
            ignoreChanges: [
              ...(opts.ignoreChanges ?? []),
              ...Object.keys(props),
            ],
          },
          props,
        }
      : undefined
  );
}
