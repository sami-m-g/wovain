// The GitHub mirror (github.com/sami-m-g/wovain): GitLab CI pushes main and
// tags to it over a deploy key (the `mirror:github` job), and only that key
// may change main, so a stray commit can't block CI's fast-forward pushes. A
// GitLab push mirror would need Maintainer. The provider authenticates with
// the `github:token` stack secret and `github:owner`.
import * as github from "@pulumi/github";
import * as tls from "@pulumi/tls";

export const githubMirror = () => {
  // Adopted, never deleted: protected and retained, so removing it from the
  // program or `pulumi up` can't remove the repository.
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

  // The mirror job's key. Replacing it only rotates the key, but it is
  // protected so a rotation is deliberate.
  const key = new tls.PrivateKey(
    "github-mirror",
    { algorithm: "ED25519" },
    { protect: true }
  );
  new github.RepositoryDeployKey("gitlab-ci-mirror", {
    key: key.publicKeyOpenssh,
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

  // GITHUB_MIRROR_KEY: .gitlab/ci/templates.yml (.github-ssh) decodes it.
  return key.privateKeyOpenssh.apply((k) => Buffer.from(k).toString("base64"));
};
