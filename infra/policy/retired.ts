// Resources being retired: leftovers of GitLab, the App Hosting backend and
// accounts Google or Firebase made, which nothing reads anymore. Each is
// in a Pulumi state, so a `pulumi up` deletes it once the program no longer
// declares it. The policy pack (index.ts) lets these be declared without
// protect, and the preview guard (guard.ts) lets a plan delete them.
//
// `release` says how a resource is let go:
//   - "unprotect": it is only protected in the state.
//     scripts/migrate-state.ts runs `pulumi state unprotect` on it, and the
//     next `up` deletes it.
//   - "code": the program declares it, without protect or retainOnDelete,
//     and imports it when it isn't in the state yet (legacy.ts). An `up`
//     writes those flags to the state; the
//     pull request that then deletes the declaration deletes the resource.
//   - "deleted": a "code" resource whose declaration is gone, so the next
//     `up` deletes it. If no `up` wrote the release's flags first, the
//     state still protects or retains it; scripts/pulumi.ts then clears
//     both flags in the state (scripts/state.ts, releaseDeleted).
//
// Keys are `<project>::<type>::<name>`, a URN without its stack.

export type Release = "code" | "deleted" | "unprotect";

// GitLab's pools, providers and accounts and the GitHub mirror's deploy key
// pair are released by unprotecting them. The App Hosting backend (with its
// account, sources bucket, image repository and Cloud Run service), the
// secrets only its build read (WorkOS, GitLab's OTLP settings, the docs
// chat's OpenRouter key) and Firebase's Admin SDK account are released in
// code (legacy.ts), then deleted.
export const RETIRED: Record<string, Release> = {
  "wovain-bootstrap::gcp:iam/workloadIdentityPool:WorkloadIdentityPool::gitlab":
    "unprotect",
  "wovain-bootstrap::gcp:iam/workloadIdentityPool:WorkloadIdentityPool::gitlab-mr":
    "unprotect",
  "wovain-bootstrap::gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab":
    "unprotect",
  "wovain-bootstrap::gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab-mr":
    "unprotect",
  "wovain-bootstrap::gcp:serviceaccount/account:Account::gitlab-preview":
    "unprotect",
  "wovain::gcp:artifactregistry/repository:Repository::apphosting-images":
    "deleted",
  "wovain::gcp:cloudrun/service:Service::apphosting-app": "deleted",
  "wovain::gcp:firebase/appHostingBackend:AppHostingBackend::app": "deleted",
  "wovain::gcp:secretmanager/secret:Secret::openrouter-api-key": "deleted",
  "wovain::gcp:secretmanager/secret:Secret::otel-exporter-otlp-endpoint":
    "deleted",
  "wovain::gcp:secretmanager/secret:Secret::otel-exporter-otlp-headers":
    "deleted",
  "wovain::gcp:secretmanager/secret:Secret::workos-api-key": "deleted",
  "wovain::gcp:secretmanager/secretVersion:SecretVersion::workos-api-key":
    "deleted",
  "wovain::gcp:serviceaccount/account:Account::app-hosting": "deleted",
  "wovain::gcp:serviceaccount/account:Account::firebase-adminsdk": "deleted",
  "wovain::gcp:serviceaccount/account:Account::gitlab-ops": "unprotect",
  "wovain::gcp:storage/bucket:Bucket::apphosting-sources": "deleted",
  "wovain::tls:index/privateKey:PrivateKey::github-mirror": "unprotect",
};
