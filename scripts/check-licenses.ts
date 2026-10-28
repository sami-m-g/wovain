// Fails when a dependency's license is outside the allowlist (MIT-compatible,
// OSI-permissive). `pnpm run licenses:check` runs it locally and in CI
// (.github/workflows/security.yml). It reads `pnpm licenses list --json`, so it
// sees the production and development dependencies of the whole workspace.
import { execFileSync } from "node:child_process";

interface LicensedPackage {
  name: string;
  versions: string[];
}

const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "Python-2.0",
  "Unlicense",
]);

// Allowed, but worth a line in the log: weak copyleft at file level.
const WARN = new Set(["MPL-2.0"]);

// Per-package exceptions: the license pnpm reports is not on the allowlist
// (or is missing), and why that is acceptable. A name ending in `*` matches a
// prefix (platform-specific binaries come as one package per platform).
const EXCEPTIONS: Record<string, string> = {
  "@better-auth-ui/*":
    "MIT in its repository (better-auth-ui/better-auth-ui); the manifest has no license field",
  "@img/sharp-libvips-*":
    "LGPL-3.0-or-later prebuilt libvips binaries, dynamically linked by sharp (Apache-2.0) via Next.js image optimization; not modified",
  "@mastra/inngest":
    "Apache-2.0 in its repository (mastra-ai/mastra); the manifest has no license field",
  "@polar-sh/better-auth":
    "Apache-2.0 in its repository (polarsource/polar); the manifest has no license field",
  "caniuse-lite":
    "CC-BY-4.0 browser-support data, used by build tooling and not shipped",
  "geoip-country":
    "MaxMind GeoLite2 data under its EULA, used for a country lookup, with the attribution it requires",
  "postal-mime": "MIT-0, which is MIT without the attribution requirement",
};

const exceptionFor = (name: string): string | undefined => {
  for (const [pattern, reason] of Object.entries(EXCEPTIONS)) {
    const matches = pattern.endsWith("*")
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern;
    if (matches) {
      return reason;
    }
  }
  return undefined;
};

// An SPDX expression is accepted when any OR choice has every AND operand
// accepted. Parentheses are one level deep in the registry, so a flat split
// is enough.
const expressionOk = (expression: string, accept: Set<string>): boolean => {
  const flat = expression.replaceAll("(", "").replaceAll(")", "");
  return flat
    .split(" OR ")
    .some((choice) =>
      choice.split(" AND ").every((part) => accept.has(part.trim()))
    );
};

const raw = execFileSync("pnpm", ["licenses", "list", "--json"], {
  encoding: "utf-8",
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense: Record<string, LicensedPackage[]> = JSON.parse(raw);

const violations: string[] = [];
const warnings: string[] = [];
const excepted: string[] = [];
const everyAccepted = new Set([...ALLOWED, ...WARN]);

for (const [license, packages] of Object.entries(byLicense)) {
  for (const { name, versions } of packages) {
    const label = `${name}@${versions.join(",")} (${license})`;
    const reason = exceptionFor(name);
    if (reason !== undefined) {
      excepted.push(`${label}: ${reason}`);
    } else if (!expressionOk(license, everyAccepted)) {
      violations.push(label);
    } else if (!expressionOk(license, ALLOWED)) {
      warnings.push(label);
    }
  }
}

for (const line of warnings) {
  process.stdout.write(`warning (weak copyleft): ${line}\n`);
}
for (const line of excepted) {
  process.stdout.write(`exception: ${line}\n`);
}
if (violations.length > 0) {
  process.stderr.write(
    `\n${violations.length} package(s) have a license outside the allowlist:\n${violations.map((line) => `  ${line}`).join("\n")}\nAdd it to EXCEPTIONS in scripts/check-licenses.ts with a reason, or replace it.\n`
  );
  process.exit(1);
}
process.stdout.write("licenses ok\n");
