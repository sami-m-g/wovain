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
//
// Keys are `<project>::<type>::<name>`, a URN without its stack.

export type Release = "code" | "unprotect";

// GitLab's pools, providers and accounts and the GitHub mirror's deploy key
// pair are released by unprotecting them. The App Hosting backend (with its
// account, sources bucket, image repository and Cloud Run service), the
// secrets only its build read (WorkOS, GitLab's OTLP settings, the docs
// chat's OpenRouter key) and Firebase's Admin SDK account are released in
// code (legacy.ts).
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
    "code",
  "wovain::gcp:cloudrun/service:Service::apphosting-app": "code",
  "wovain::gcp:firebase/appHostingBackend:AppHostingBackend::app": "code",
  "wovain::gcp:secretmanager/secret:Secret::openrouter-api-key": "code",
  "wovain::gcp:secretmanager/secret:Secret::otel-exporter-otlp-endpoint":
    "code",
  "wovain::gcp:secretmanager/secret:Secret::otel-exporter-otlp-headers": "code",
  "wovain::gcp:secretmanager/secret:Secret::workos-api-key": "code",
  "wovain::gcp:serviceaccount/account:Account::app-hosting": "code",
  "wovain::gcp:serviceaccount/account:Account::firebase-adminsdk": "code",
  "wovain::gcp:serviceaccount/account:Account::gitlab-ops": "unprotect",
  "wovain::gcp:storage/bucket:Bucket::apphosting-sources": "code",
  "wovain::tls:index/privateKey:PrivateKey::github-mirror": "unprotect",
};
