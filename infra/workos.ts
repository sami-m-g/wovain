// WorkOS AuthKit settings for wovain's environment, from the stack config
// (wovain:workosRedirectUris in Pulumi.prod.yaml). The provider is
// osodevops/workos, bridged from Terraform (`pulumi install` generates
// sdks/workos). It signs in with the `workos-api-key` stack secret, the same
// key the server uses. CIMD, DCR and resource indicators have no API yet, so
// they stay in the dashboard (README, Infrastructure as code).
import * as pulumi from "@pulumi/pulumi";
import * as workos from "@pulumi/workos";

interface RedirectUri {
  name: string;
  uri: string;
  // A redirect URI registered by hand, adopted by its WorkOS id.
  import?: string;
}

const config = new pulumi.Config();
const redirectUris = config.requireObject<RedirectUri[]>("workosRedirectUris");

const provider = new workos.Provider("workos", {
  apiKey: config.requireSecret("workos-api-key"),
});

// WorkOS has no update endpoint: a changed uri replaces the entry. The provider
// refuses to create a URI that already exists, so adopt those by id.
for (const r of redirectUris) {
  new workos.RedirectUri(
    `workos-redirect-${r.name}`,
    { uri: r.uri },
    { provider, ...(r.import === undefined ? {} : { import: r.import }) }
  );
}
