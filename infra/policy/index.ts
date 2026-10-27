// wovain's CrossGuard policy pack, enforced by every `pulumi preview` and
// `pulumi up` (--policy-pack infra/policy). A violation stops the preview, so
// it fails before an apply starts.
import { PolicyPack } from "@pulumi/policy";

import { STATEFUL } from "./types.ts";

new PolicyPack("wovain", {
  enforcementLevel: "mandatory",
  policies: [
    {
      // A policy never sees deletes, so this one makes the engine refuse
      // them: a protected resource can't be deleted or replaced, and a
      // preview that would do either fails. Releasing one is deliberate:
      // `pulumi state unprotect <urn>`, then remove it with retainOnDelete.
      description:
        "Stateful resources are protected, so no update deletes or replaces them",
      name: "stateful-resources-protected",
      validateResource: ({ name, opts, type }, reportViolation) => {
        if (STATEFUL.has(type) && !opts.protect) {
          reportViolation(
            `${type} "${name}" holds data or identity: give it protect: true`
          );
        }
      },
    },
  ],
});
