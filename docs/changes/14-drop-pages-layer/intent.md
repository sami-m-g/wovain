# Intent: Drop the pages/ layer for the one-paragraph home page

Issue: #14

## Problem

`pages/page.ts` has one caller (the home page in `app.ts`). `pages/styles.ts` still describes sign-in and consent pages that AuthKit replaced, and its accent and danger variables are unused. About 65 lines carry one paragraph.

## Desired outcome

The home page renders the same content from an inline `hono/html` template in `app.ts`. `pages/` is gone, and the change removes more lines than it adds.

## Constraints

- Follow AGENTS.md; stay within `apps/server/src/pages/`, `app.ts` and `public/`.
- The paragraph names the site URL, which is set at runtime, so it can't be a static file.
- Update docs that mention `pages/`.

## Open questions

None.
