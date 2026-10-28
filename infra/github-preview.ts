// The GitHub environment pull request previews run in
// (.github/workflows/infra.yml). Google trusts infra-preview, which can
// decrypt the stack secrets, only from jobs in it (bootstrap/preview.ts),
// and a job in it waits until the owner approves it. No branch policy: a
// pull request's ref is refs/pull/<n>/merge.
import * as github from "@pulumi/github";

export const previewEnvironment = (reviewerIds: number[]) =>
  new github.RepositoryEnvironment("infrastructure-preview", {
    environment: "infrastructure-preview",
    // The owner approves their own pull requests' previews too.
    preventSelfReview: false,
    repository: "wovain",
    reviewers: [{ users: reviewerIds }],
  });
