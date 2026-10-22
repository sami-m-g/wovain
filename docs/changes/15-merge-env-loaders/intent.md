# Intent: Merge the two env loaders

Issue: #15

## Problem

The server reads its settings through two zod schemas and two loaders (`env.ts` and `auth/env.ts`) that repeat the same empty-value filter and parse. `runtime.ts` splices them together: it computes the icon URL from the auth schema's site URL and passes it into the other loader.

## Desired outcome

One env schema and one loader cover the server and sign-in keys. The site URL and the icon URL are derived inside the schema, so `runtime.ts` loads the env once.

## Constraints

- No env variable is added or renamed.
- Every sign-in behavior stays: `/mcp` refuses everyone until both WorkOS keys are set, and only verified emails on the allowlist get in.
- The change removes more source lines than it adds.

## Open questions

None. The owner approved the issue for work.
