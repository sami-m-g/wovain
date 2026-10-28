// wovain.com, end to end: the Cloud DNS zone Cloud Domains created with the
// registration (named, never managed here), Search Console ownership,
// a Cloud Run domain mapping per host with a Google-managed certificate, and
// the zone's other records: mail (Resend), DMARC, CAA, verification tokens,
// and the shop.
import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";

import type { ResendRecord } from "./resend.ts";

interface Route {
  host: string;
  service: pulumi.Input<string>;
}

export interface ShopRecord {
  type: string;
  // "@" for the apex, else relative to it (e.g. "shop").
  host: string;
  value: string;
}

interface DomainArgs {
  // What must exist first: the APIs and the deploying account's roles.
  after: pulumi.Resource[];
  // The registered domain; every host is it or one of its subdomains.
  apex: string;
  project: string;
  region: string;
  // The Cloud DNS managed zone's name.
  zone: string;
  routes: Route[];
  // Values a third party issues and no API hands out (Pulumi.prod.yaml).
  metaDomainVerification: string | undefined;
  dmarcRua: string | undefined;
  // Google Workspace mail: the site-verification token (the part after
  // "google-site-verification=") and the DKIM public key record's value.
  googleSiteVerification: string | undefined;
  googleDkim: string | undefined;
  // An extra Search Console owner (a Google account, so it must exist first).
  siteOwnerEmail: string | undefined;
  caaIssuers: string[];
  shopRecords: ShopRecord[];
  // Resend's records for the domain, when Resend is set up (resend.ts).
  resendRecords: pulumi.Output<ResendRecord[]> | undefined;
}

// The record types Cloud Run asks for (cloud.google.com/run/docs/mapping-
// custom-domains): Google's frontends for an apex, a CNAME otherwise. The
// values come from the mapping itself.
const APEX_TYPES = ["A", "AAAA"];
const SUBDOMAIN_TYPES = ["CNAME"];
const TTL_SECONDS = 300;
const DEFAULT_MX_PRIORITY = 10;
const TRAILING_DOT = /\.?$/u;

// Cloud DNS takes a TXT value as quoted strings of at most 255 characters.
const TXT_CHUNK = 255;
const txt = (value: string) => {
  const plain = value.replaceAll(/^"|"$/gu, "");
  const chunks: string[] = [];
  for (let start = 0; start < plain.length; start += TXT_CHUNK) {
    chunks.push(`"${plain.slice(start, start + TXT_CHUNK)}"`);
  }
  return chunks.join(" ");
};

// The Site Verification API needs its own OAuth scope on top of Cloud
// Platform's; CI's impersonated token gets it, and so does a local run after
// `gcloud auth application-default login --scopes=...` (README).
const SITE_VERIFICATION_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/siteverification",
];

// A record set in the zone, named after its host and type.
const recordSet = (
  zone: { name: string; project: string },
  name: string,
  type: string,
  rrdatas: pulumi.Input<pulumi.Input<string>[]>,
  dependsOn: pulumi.Resource[]
) =>
  new gcp.dns.RecordSet(
    `${name.replaceAll(".", "-")}-${type.toLowerCase()}`,
    {
      // The zone's name as a plain string, so it is known in every preview:
      // managedZone can't change in place, and an unknown one would show
      // every record set as replaced.
      managedZone: zone.name,
      name: `${name}.`,
      project: zone.project,
      rrdatas,
      ttl: TTL_SECONDS,
      type,
    },
    { dependsOn }
  );

interface HostArgs extends Route {
  apex: string;
  project: string;
  region: string;
  zone: string;
  // What the mapping waits on. Whoever runs `pulumi up` must be a verified
  // owner of the apex in Search Console.
  dependsOn: pulumi.Resource[];
  // What its records wait on besides the mapping.
  recordsDependOn: pulumi.Resource[];
}

// A host served by a Cloud Run service: its domain mapping, with a
// Google-managed certificate, and the records the mapping asks for.
export const mappedHost = (args: HostArgs) => {
  const { apex, host, project, region } = args;
  const mapping = new gcp.cloudrun.DomainMapping(
    host.replaceAll(".", "-"),
    {
      location: region,
      metadata: { namespace: project },
      name: host,
      spec: { routeName: args.service },
    },
    { dependsOn: args.dependsOn }
  );
  // A resource's name can't wait on an output, so the types are known
  // here and the values are the ones the mapping lists for each type.
  for (const type of host === apex ? APEX_TYPES : SUBDOMAIN_TYPES) {
    recordSet(
      { name: args.zone, project },
      host,
      type,
      // Empty until Google has created the mapping (and in the mocks).
      mapping.statuses.apply(
        (
          statuses: gcp.types.output.cloudrun.DomainMappingStatus[] | undefined
        ) =>
          (statuses?.[0]?.resourceRecords ?? [])
            .filter((r) => r.type === type)
            .map((r) => r.rrdata)
      ),
      [...args.recordsDependOn, mapping]
    );
  }
  return mapping.name;
};

export const configureDomain = (args: DomainArgs) => {
  const { apex, project, region } = args;
  const record = (
    name: string,
    type: string,
    rrdatas: pulumi.Input<pulumi.Input<string>[]>,
    // What it waits on besides the APIs.
    dependsOn: pulumi.Resource[] = []
  ) =>
    recordSet({ name: args.zone, project }, name, type, rrdatas, [
      ...args.after,
      ...dependsOn,
    ]);

  // Search Console: the token goes into the apex TXT set, then the
  // verification makes whoever runs `pulumi up` (the gitlab-infra account in CI) a
  // verified owner, which Cloud Run domain mappings require.
  const siteVerification = new gcp.Provider("site-verification", {
    billingProject: project,
    project,
    scopes: SITE_VERIFICATION_SCOPES,
    userProjectOverride: true,
  });
  const token = gcp.siteverification.getTokenOutput(
    { identifier: apex, type: "INET_DOMAIN", verificationMethod: "DNS_TXT" },
    { dependsOn: args.after, provider: siteVerification }
  );
  const apexTxt = record(
    apex,
    "TXT",
    token.token.apply((googleToken) =>
      [
        // Only Google Workspace sends from the apex; Resend's bounce domain
        // is send.<apex>, which has its own SPF. One SPF record per name.
        "v=spf1 include:_spf.google.com -all",
        googleToken,
        ...(args.googleSiteVerification === undefined
          ? []
          : [`google-site-verification=${args.googleSiteVerification}`]),
        ...(args.metaDomainVerification === undefined
          ? []
          : [`facebook-domain-verification=${args.metaDomainVerification}`]),
      ].map(txt)
    )
  );
  const verified = new gcp.siteverification.WebResource(
    "search-console",
    {
      site: { identifier: apex, type: "INET_DOMAIN" },
      verificationMethod: "DNS_TXT",
    },
    { dependsOn: [apexTxt], provider: siteVerification }
  );

  if (args.siteOwnerEmail !== undefined) {
    // WebResource's `owners` is the verified owners (whoever ran the
    // verification); more owners are their own resource.
    new gcp.siteverification.Owner(
      "search-console-owner",
      { email: args.siteOwnerEmail, webResourceId: verified.webResourceId },
      { provider: siteVerification }
    );
  }

  const mappings = args.routes.map(({ host, service }) =>
    mappedHost({
      apex,
      dependsOn: [verified, ...args.after],
      host,
      project,
      recordsDependOn: args.after,
      region,
      service,
      zone: args.zone,
    })
  );

  // Only the listed authorities may issue certificates for the domain.
  record(
    apex,
    "CAA",
    args.caaIssuers.map((issuer) => `0 issue "${issuer}"`)
  );
  // Google Workspace's mail server (support.google.com/a/answer/174125).
  record(apex, "MX", ["1 smtp.google.com."]);
  if (args.googleDkim !== undefined) {
    record(`google._domainkey.${apex}`, "TXT", [txt(args.googleDkim)]);
  }
  const dmarc = [
    "v=DMARC1",
    "p=quarantine",
    ...(args.dmarcRua === undefined ? [] : [`rua=mailto:${args.dmarcRua}`]),
  ].join("; ");
  record(`_dmarc.${apex}`, "TXT", [txt(dmarc)]);

  // Resend asks for DKIM at resend._domainkey, MX and SPF at its bounce
  // subdomain, send, and a CNAME at rsend (its click and open tracking).
  // Every value is Resend's, as returned when the domain was created.
  const { resendRecords } = args;
  const values = (
    records: pulumi.Output<ResendRecord[]>,
    name: string,
    type: string
  ) =>
    records.apply((list) =>
      list
        .filter((r) => r.name === name && r.type === type)
        .map((r) => {
          if (type === "TXT") {
            return txt(r.value);
          }
          const target = r.value.replace(TRAILING_DOT, ".");
          return type === "MX"
            ? `${r.priority ?? DEFAULT_MX_PRIORITY} ${target}`
            : target;
        })
    );
  const resendRecordSets =
    resendRecords === undefined
      ? []
      : [
          record(
            `resend._domainkey.${apex}`,
            "TXT",
            values(resendRecords, "resend._domainkey", "TXT")
          ),
          record(`send.${apex}`, "MX", values(resendRecords, "send", "MX")),
          record(`send.${apex}`, "TXT", values(resendRecords, "send", "TXT")),
          record(
            `rsend.${apex}`,
            "CNAME",
            values(resendRecords, "rsend", "CNAME")
          ),
        ];

  // The shop's records, as Fourthwall's get-dns-entries lists them, grouped
  // by name and type since Cloud DNS holds one record set per pair.
  const shop = new Map<
    string,
    { name: string; type: string; rrdatas: string[] }
  >();
  for (const { host, type, value } of args.shopRecords) {
    const name = host === "@" ? apex : `${host}.${apex}`;
    const rrdata = type === "TXT" ? txt(value) : value;
    const existing = shop.get(`${name}/${type}`);
    if (existing === undefined) {
      shop.set(`${name}/${type}`, { name, rrdatas: [rrdata], type });
    } else {
      existing.rrdatas.push(rrdata);
    }
  }
  for (const { name, rrdatas, type } of shop.values()) {
    record(name, type, rrdatas);
  }

  return { mappings, resendRecordSets, searchConsole: verified.id };
};
