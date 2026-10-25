// wovain.com, end to end: the Cloud DNS zone Cloud Domains created with the
// registration (looked up, never managed here), Search Console ownership,
// a Cloud Run domain mapping per host with a Google-managed certificate, and
// the zone's other records: mail (Resend), DMARC, CAA, verification tokens,
// the status page and the shop.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

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
  // GitLab's verification code for the status page's Pages domain, when
  // the project has one (duo.ts).
  statusDomainVerification: pulumi.Input<string> | undefined;
  dmarcRua: string | undefined;
  caaIssuers: string[];
  statusPagesTarget: string;
  shopRecords: ShopRecord[];
  // Resend's records for the domain, when Resend is set up (resend.ts).
  resendRecords: pulumi.Output<ResendRecord[]> | undefined;
}

// The records Cloud Run asks for (cloud.google.com/run/docs/mapping-custom-
// domains): Google's frontends for an apex, ghs.googlehosted.com otherwise.
const APEX_A = [
  "216.239.32.21",
  "216.239.34.21",
  "216.239.36.21",
  "216.239.38.21",
];
const APEX_AAAA = [
  "2001:4860:4802:32::15",
  "2001:4860:4802:34::15",
  "2001:4860:4802:36::15",
  "2001:4860:4802:38::15",
];
const GOOGLE_HOSTED = "ghs.googlehosted.com.";
const TTL_SECONDS = 300;
const DEFAULT_MX_PRIORITY = 10;
const PAGES_VERIFICATION_PREFIX = "gitlab-pages-verification-code=";
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

export const configureDomain = (args: DomainArgs) => {
  const { apex, project, region } = args;
  const zone = gcp.dns.getManagedZoneOutput(
    { name: args.zone, project },
    { dependsOn: args.after }
  );
  const record = (
    name: string,
    type: string,
    rrdatas: pulumi.Input<pulumi.Input<string>[]>,
    opts?: pulumi.CustomResourceOptions
  ) =>
    new gcp.dns.RecordSet(
      `${name.replaceAll(".", "-")}-${type.toLowerCase()}`,
      {
        managedZone: zone.name,
        name: `${name}.`,
        project,
        rrdatas,
        ttl: TTL_SECONDS,
        type,
      },
      opts
    );

  // Search Console: the token goes into the apex TXT set, then the
  // verification makes whoever runs `pulumi up` (gitlab-infra in CI) a
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
        // No mail leaves from the apex's own servers; Resend's bounce domain
        // is send.<apex>, which has its own SPF.
        "v=spf1 -all",
        googleToken,
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

  const mappings = args.routes.map(({ host, service }) => {
    const mapping = new gcp.cloudrun.DomainMapping(
      host.replaceAll(".", "-"),
      {
        location: region,
        metadata: { namespace: project },
        name: host,
        spec: { routeName: service },
      },
      { dependsOn: [verified, ...args.after] }
    );
    if (host === apex) {
      record(host, "A", APEX_A, { dependsOn: [mapping] });
      record(host, "AAAA", APEX_AAAA, { dependsOn: [mapping] });
    } else {
      record(host, "CNAME", [GOOGLE_HOSTED], { dependsOn: [mapping] });
    }
    return mapping.name;
  });

  // Only the listed authorities may issue certificates for the domain.
  record(
    apex,
    "CAA",
    args.caaIssuers.map((issuer) => `0 issue "${issuer}"`)
  );
  const dmarc = [
    "v=DMARC1",
    "p=quarantine",
    ...(args.dmarcRua === undefined ? [] : [`rua=mailto:${args.dmarcRua}`]),
  ].join("; ");
  record(`_dmarc.${apex}`, "TXT", [txt(dmarc)]);

  // GitLab Pages: the status page and the public SCI/DORA report.
  const { statusDomainVerification } = args;
  if (statusDomainVerification !== undefined) {
    record(`status.${apex}`, "CNAME", [args.statusPagesTarget]);
    record(
      `_gitlab-pages-verification-code.status.${apex}`,
      "TXT",
      pulumi
        .output(statusDomainVerification)
        .apply((code) => [
          txt(
            code.startsWith(PAGES_VERIFICATION_PREFIX)
              ? code
              : `${PAGES_VERIFICATION_PREFIX}${code}`
          ),
        ])
    );
  }

  // Resend always asks for the same three records: DKIM at
  // resend._domainkey, and MX and SPF at its bounce subdomain, send.
  const { resendRecords } = args;
  const values = (
    records: pulumi.Output<ResendRecord[]>,
    name: string,
    type: string
  ) =>
    records.apply((list) =>
      list
        .filter((r) => r.name === name && r.type === type)
        .map((r) =>
          type === "TXT"
            ? txt(r.value)
            : `${r.priority ?? DEFAULT_MX_PRIORITY} ${r.value.replace(TRAILING_DOT, ".")}`
        )
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
