# Security policy

## Reporting a vulnerability

Report it privately through GitHub: [Report a vulnerability](https://github.com/sami-m-g/wovain/security/advisories/new) (the repository's Security tab, "Report a vulnerability"). Please do not open a public issue or pull request for a vulnerability.

Include what you found, where (a URL, route or file), steps to reproduce it, and the impact you see. Do not include other people's data.

## What to expect

- An acknowledgement within 5 working days.
- A first assessment within 10 working days, and updates as the fix progresses.
- A fix or a mitigation as soon as practical, and a credit in the advisory if you want one.

We ask that you give us a reasonable time to fix the issue before you share it, and that you test only against your own account and data. We will not take legal action against good-faith research that follows this policy.

## Scope

In scope: the code in this repository and the services it deploys (wovain.com, docs.wovain.com, next.wovain.com).

Out of scope: denial of service, social engineering, findings in Fourthwall, Meta, fal, Polar or any other third-party service (report those to the vendor), and reports that only come from an automated scanner without a working impact.

## Supported versions

Only the current `main` branch and the version running on wovain.com are supported.

## How the repository is checked

CodeQL and Semgrep (SAST), OSV-Scanner and dependency review (vulnerable dependencies), a license check, GitGuardian's ggshield (secrets), an SBOM on each release and OpenSSF Scorecard run in GitHub Actions. See `.github/workflows`.
