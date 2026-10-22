// WorkOS AuthKit settings for wovain's environment, from the stack config
// (wovain:workosRedirectUris and wovain:workosResourceIndicators in
// Pulumi.prod.yaml). Redirect URIs use osodevops/workos, bridged from
// Terraform (`pulumi install` generates sdks/workos). Both sign in with the
// `workos-api-key` stack secret, the same key the server uses. CIMD and DCR
// have no API yet, so they stay in the dashboard (README, Infrastructure as
// code).
import * as pulumi from "@pulumi/pulumi";
import * as restful from "@pulumi/restful";
import * as workos from "@pulumi/workos";

interface RedirectUri {
  name: string;
  uri: string;
  // A redirect URI registered by hand, adopted by its WorkOS id.
  import?: string;
}

const config = new pulumi.Config();
const redirectUris = config.requireObject<RedirectUri[]>("workosRedirectUris");
const apiKey = config.requireSecret("workos-api-key");

const provider = new workos.Provider("workos", { apiKey });

// WorkOS has no update endpoint: a changed uri replaces the entry. The provider
// refuses to create a URI that already exists, so adopt those by id.
for (const r of redirectUris) {
  new workos.RedirectUri(
    `workos-redirect-${r.name}`,
    { uri: r.uri },
    { provider, ...(r.import === undefined ? {} : { import: r.import }) }
  );
}

interface ResourceIndicator {
  name: string;
  uri: string;
  // The resource AuthKit picks when a client names none. One at most.
  default?: boolean;
  // A resource indicator registered by hand, adopted by its WorkOS id.
  import?: string;
}

const resourceIndicators = config.requireObject<ResourceIndicator[]>(
  "workosResourceIndicators"
);

// MCP resource indicators (the `resource` an MCP client asks a token for) have
// a documented REST API (authkit_oauth_resources: create, list, delete) but no
// resource in osodevops/workos. magodo/restful, a generic REST provider bridged
// the same way, covers it with plain config: Mastercard/restapi's generated SDK
// doesn't compile (its resource class is named `Object`), and @pulumi/command
// couldn't read the entries back or adopt the existing one.
const rest = new restful.Provider("workos-rest", {
  baseUrl: "https://api.workos.com",
  security: { http: { token: { token: apiKey } } },
});
const PATH = "/user_management/authkit_oauth_resources";

// There's no read by id, so each entry is read from the list by its uri (which
// never changes in place). There's no update either, and `default` is only
// set on create: any change replaces the entry, deleting the old one first so
// the same uri is never registered twice. A new default takes the flag from
// the old one, so the default is created before the rest.
const selector = (uri: string) => `data.#(uri==${JSON.stringify(uri)})`;
const byDefault = resourceIndicators.toSorted(
  (a, b) => Number(b.default ?? false) - Number(a.default ?? false)
);
let previous: restful.Resource | undefined;
for (const r of byDefault) {
  previous = new restful.Resource(
    `workos-resource-${r.name}`,
    {
      body: { default: r.default ?? false, uri: r.uri },
      deletePath: `${PATH}/$(body.id)`,
      path: PATH,
      readSelector: selector(r.uri),
    },
    {
      deleteBeforeReplace: true,
      provider: rest,
      replaceOnChanges: ["body", "path"],
      ...(previous === undefined ? {} : { dependsOn: [previous] }),
      ...(r.import === undefined
        ? {}
        : {
            import: JSON.stringify({
              body: { default: null, uri: null },
              // Without a read by id, the entry's id is the list path.
              id: PATH,
              path: PATH,
              read_selector: selector(r.uri),
            }),
          }),
    }
  );
}
