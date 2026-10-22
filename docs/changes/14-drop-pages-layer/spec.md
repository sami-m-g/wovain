# Spec: Drop the pages/ layer

Intent: [intent.md](intent.md)

## Requirements

- `pages/page.ts` and `pages/styles.ts` are deleted.
- `GET /` returns the same title, heading, paragraph, description meta and favicon link, in light and dark.
- A test covers `GET /`.

## Design

A static `public/index.html` can't show `${site}/mcp`, which comes from `siteUrl(authEnv)`. So the page becomes one `html` template in `app.ts` with a short inline style block. The unused accent and danger variables and the sign-in era comments go; only the colors the page uses stay. Libraries checked: `hono/html` (already used) and `serveStatic` (already serves `public/`, but can't interpolate). No new dependency.

## Areas of concern

- Dependency-cruiser rule and CODEOWNERS name `pages/`; both are trimmed.
- Docs (`spec.md`, `app-map.html`) name `pages/` and are updated.
