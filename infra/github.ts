// The GitHub mirror (github.com/sami-m-g/wovain): GitLab CI pushes main and
// tags to it over a deploy key, and only that key may change main, so a stray
// commit can't block CI's pushes, which don't force. The provider
// authenticates with the `github:token` stack secret and `github:owner`.
import * as github from "@pulumi/github";
import * as tls from "@pulumi/tls";

// Adopted, never deleted: removing it from the program must not remove the
// repository.
const repository = new github.Repository(
  "wovain",
  {
    allowAutoMerge: false,
    deleteBranchOnMerge: true,
    description:
      "wovain: an MCP server for print-on-demand sellers (product idea → Fourthwall product → Meta Advantage+ campaign). Mirror of GitLab.",
    hasIssues: false,
    hasProjects: false,
    hasWiki: false,
    homepageUrl: "https://learn-ai-basics.devpost.com/",
    name: "wovain",
    topics: [
      "devpost",
      "fal-ai",
      "firebase",
      "fourthwall",
      "mcp",
      "mcp-apps",
      "meta-ads",
      "print-on-demand",
      "typescript",
    ],
    visibility: "public",
  },
  { import: "wovain", protect: true, retainOnDelete: true }
);

// The mirror job's key: a new key pair, so the one made by hand can go.
const mirrorKey = new tls.PrivateKey("github-mirror", {
  algorithm: "ED25519",
});
new github.RepositoryDeployKey("gitlab-ci-mirror", {
  key: mirrorKey.publicKeyOpenssh,
  readOnly: false,
  repository: repository.name,
  title: "gitlab-ci-mirror (pulumi)",
});

// Only the deploy key may push, force-push or delete main.
new github.RepositoryRuleset("main-from-gitlab", {
  bypassActors: [{ actorType: "DeployKey", bypassMode: "always" }],
  conditions: {
    refName: { excludes: [], includes: ["~DEFAULT_BRANCH"] },
  },
  enforcement: "active",
  name: "main is mirrored from GitLab",
  repository: repository.name,
  rules: { deletion: true, nonFastForward: true, update: true },
  target: "branch",
});

// .gitlab/ci/templates.yml (.github-ssh) decodes it into ~/.ssh.
export const mirrorPrivateKey = mirrorKey.privateKeyOpenssh.apply((k) =>
  Buffer.from(k).toString("base64")
);
