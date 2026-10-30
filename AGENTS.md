# Repository Guide

## Structure

- `apps/web`: Next.js 16 app (App Router, oRPC, Better Auth, evlog)
- `apps/fumadocs`: Fumadocs documentation site with Nebius (Nemotron) AI chat
- `packages/api`: routing only: oRPC routers, the MCP server and the handlers `apps/web` mounts
- `packages/mastra`: all orchestration (`@wovain/mastra`, Mastra's `src/mastra/` layout): agents, scorers, memory, evals, the workflows on Inngest, the seller flow (`flow/*`, being reshaped into Mastra steps and tools) and the composition root (`services.ts`)
- `packages/core`: domain logic and provider clients
- `packages/auth`: Better Auth configuration
- `packages/db`: Drizzle schema, relations and client (PostgreSQL)
- `packages/ui`: shared shadcn/ui components (Base UI, Tailwind CSS 4)
- `packages/config`: shared `tsconfig.base.json`

## Tech

- pnpm workspaces with catalog versions in `pnpm-workspace.yaml`; Turborepo for tasks
- TypeScript 6 for tooling (`typescript` alias of `@typescript/typescript6`), TypeScript 7 for `tsc`
- Varlock for environment: each app owns `.env.schema`; import `ENV` from the generated `src/env.ts`
- Ultracite (Oxlint + Oxfmt) for lint and format; knip for unused code
- Mastra for agents, workflows, scorers, memory and tracing: everything in `packages/mastra/src/mastra/{agents,scorers,memory,evals,workflows,flow}` (`@wovain/mastra`); core keeps the agent registry (`agents.ts`), the model-call port (`nemotron.ts`) and the judge specs (`judges.ts`); the run workflow on Inngest in `packages/mastra/src/mastra/workflows` (docs/adr/0001, 0002)

## Mastra Studio (local)

- `pnpm run db:start` for Postgres, then `pnpm --filter @wovain/mastra studio`, which runs `mastra dev --dir src/mastra` and serves Studio on http://localhost:4111.
  - The entry `packages/mastra/src/mastra/index.ts` builds the same agents, scorers, memory, workflow and storage as the app, from the environment.
  - Required: `NEMOTRON_MODEL`, `NEMOTRON_VISION_MODEL`, `NEMOTRON_MODEL_{FAST,DEFAULT,REASONING,VISION,SAFETY}`, `FAL_IMAGE_MODEL`, `TAVILY_RESEARCH_MODEL` and `VOICE_STT_{MODEL,FALLBACK_MODEL}` (as in `apps/web/.env.schema`), `DATABASE_URL` (`postgresql://postgres:password@localhost:5432/wovain` with the Docker database) and `TOKEN_ENCRYPTION_KEY`.
  - Also the per-environment settings in `apps/web/.env.schema` (`BILLING_CATALOG`, `PRICING_RULES`, the MCP URLs, `EMAIL_FROM` and the rest), set in `apps/web/.env.local`.
  - Agents also need `NEBIUS_API_KEY`; without it, Studio shows the workflow and the step scorers only.
- Running the workflow needs the Inngest Dev Server: `INNGEST_DEV=1` and `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`, with `pnpm dev:web` running.
- End-to-end (`apps/e2e/README.md`): `pnpm --filter @wovain/e2e run test:e2e` runs the golden path (Home pick to a staged paused campaign) with every provider mocked, as CI does; `.github/workflows/nightly-e2e.yml` runs it each night on next.wovain.com with real providers, up to the designs.
- Judge evals: `pnpm --filter @wovain/mastra run evals` (needs `NEBIUS_API_KEY` and `NEMOTRON_MODEL`) writes `packages/mastra/src/mastra/evals/report.v1.json`. The labeled set is `packages/core/src/evals/judges.v1.json`.

## Rules

- Do not edit vendored or generated files; update them with their CLI:
  - `packages/ui/src/{components,hooks,lib}`: shadcn CLI
  - `apps/fumadocs/src/components/{ai,codeblock.tsx,tabs,ui}`, `apps/fumadocs/src/lib/{cn,merge-refs}.ts`: Fumadocs CLI
  - `apps/web/src/{components,lib}/auth`: Better Auth UI registry (`pnpm dlx shadcn add https://better-auth-ui.com/r/base-nova/<item>.json`)
  - `packages/db/src/schema/auth.ts`: `pnpm run auth:generate`
  - `packages/db/src/migrations`: `pnpm run db:generate`
  - `.agents/skills`: `npx skills experimental_install`
  - `.{agents,claude}/skills/openspec-*`, `.claude/commands/opsx`: `pnpm exec openspec update`
- Every error must reach PostHog Error Tracking, the one place errors are watched: log it at error level through evlog or throw it from a procedure or route. Never swallow an error, log it as a plain string, or send it anywhere else on your own
- Add shared dependency versions to the pnpm catalog and reference them with `catalog:`
- Minimal code, frameworks first, no lost functionality: before writing logic, use what Mastra (workflows, steps, tools, agents, processors, scorers, memory, tracing, `MCPServer`/`MCPClient`), Inngest, Better Auth, oRPC or another maintained library already provides. Write code only for what none of them cover. Every PR body names the library or framework it used, and gives a reason for any hand-written logic it adds
- Layers (`turbo boundaries`, tags in each package's `turbo.json`, rules in the root `turbo.json`): `core` (domain, provider clients) ← `db`, `billing`, `email`, `auth` (data) ← `mastra` (orchestration) ← `api` (routing) ← `web`; `ui` ← `widgets` (MCP Apps, used by `api`). A package imports only the layers below it, transitively
- A feature PR that doesn't update the landing page (hero demo, copy and FAQ in en, es and fr) and the docs is incomplete
- Run `pnpm run check`, `pnpm run check-types`, `pnpm run knip`, `pnpm run boundaries` and `pnpm run spec:validate` before committing

## Specs and changes (OpenSpec)

- `openspec/specs/` is the current truth for each capability; `openspec/changes/` holds open changes.
- Every feature change starts as an OpenSpec change (`/opsx:propose`) linked to a GitHub issue. Put the issue link in `proposal.md`; the PR says `Closes #<issue>`.
- Archive the change (`openspec archive <change>`) in the PR that merges it, so `openspec/specs/` stays current.
- Run `pnpm run spec:validate` before committing spec changes.
- `docs/scope.md`, `docs/prd.md` and `docs/spec.md` stay the Build With AI: Basics-format summary. When scope changes, update them (and their docs-site copies) in the same PR.

## Issues, pull requests and CI

- Code, issues and pull requests live on GitHub (`sami-m-g/wovain`). CI is GitHub Actions.
- Work on a branch and open a pull request against `main`. The PR says `Closes #<issue>`.

## CodeRabbit review loop

- CodeRabbit is advisory: it comments but never requests changes or approves, and the ruleset does not require it (Claude's review gives the one approval). Its limit is the cost: PR reviews are rate limited per developer per hour (OSS plan: 1-10 by star count; [rate limits](https://docs.coderabbit.ai/management/plans#rate-limits)), and every agent shares one developer. Each review, including each incremental review of a push, uses one; a comment "Your next included review will be available in N minutes" means the limit was hit. A blocked push costs none.
- Keep a PR under about 400 changed lines. Review time grows with the diff, and a small PR leaves fewer comments to fix.
- Fix all comments in one commit and push once. Do not push a commit per comment: each push is a review.
- Resolve each thread you fixed (reply "Fixed in <sha>" and resolve), then comment `@coderabbitai review` once on the new head.
- No review on the head commit after 10 minutes: comment `@coderabbitai full review`. After 10 more, read the PR for a rate-limit comment and wait the time it states. Do not re-ping inside the wait.

## PR shepherd

- `.github/workflows/shepherd.yml` fixes a pull request after a failed check or a change request from Claude's review, in `live` mode (it commits and pushes within the limits), and `shepherd-scan.yml` re-checks open pull requests every 30 minutes. Both run on the founder's Claude subscription and push as the Claude GitHub App. The limits (`SHEPHERD_MAX_PER_PR`, `SHEPHERD_MAX_PER_DAY`, `SHEPHERD_MODE`) are in the workflow's `env`. It never merges or approves, and it adds `needs-human` when a person must decide.
- To have Claude's cloud Auto-fix watch a pull request instead (`/autofix-pr`), add the `autofix` label. The shepherd then skips that pull request, so the two never push to the same branch.

## Tooling (project scope)

- Declared in `.mcp.json`, `.claude/settings.json` and `skills-lock.json`; never install at user or global scope.
- MCP: `qloo-docs` (docs), `qloo` (harness, reads `QLOO_API_KEY`), `tavily` (OAuth, or `TAVILY_API_KEY` for the CLI skills), `inngest-dev` (Dev Server on 127.0.0.1:8288), `pulumi` (OAuth), `meta-ads` (Meta's official Ads MCP at `https://mcp.facebook.com/ads`; Facebook Login OAuth per user, with the `ads_mcp_management` and `ads_read` or `ads_management` permissions).
- Plugins: `superpowers`, `inngest`, `playwright`, `claude-ads` (AgriciDaniel/claude-ads, MIT: `ads-meta`, `ads-audit`, `ads-plan`, `ads-test`, `ads-math`, `ads-optimize`, `ads-landing` and more). To install it, run `/plugin marketplace add AgriciDaniel/claude-ads`, then `/plugin install claude-ads@ai-marketing-hub-claude-ads` and choose project scope, which writes it to `.claude/settings.json`; commit that change.
- Skills: `tavily-*`, `remotion-*`, `pulumi-*`, `investor-materials`, `investor-outreach`, `founder-board`, `office-hours` (gstack, single skill; its `~/.claude/skills/gstack` helpers are not installed), `validate-idea`.
- E-commerce skills from nexscope-ai/eCommerce-Skills (MIT): `dropshipping-product-research`, `etsy-print-on-demand`, `profit-margin-calculator-shopify`, `market-gap-analysis`, `ecommerce-landing-page`, `ecommerce-checkout-optimization`. The skills CLI skips its `ecommerce-ab-testing` because the skill has no frontmatter upstream; use claude-ads `ads-test` for test design. Founder skills write to `founder/` (git-ignored).

## Feature flags

- Add a flag to the registry in `packages/core/src/flag-registry.ts` with an owner, an expiry and a rollout per environment, then read it with `core.flags.isOn("<name>", { userId, plan })` (`isFlagOn` in `apps/web`). Names are typed; never pass a string you built.
- The safe state is off: a flag is off when its provider can't be reached.
- When a flag expires or is fully rolled out, delete the losing code path, the `isOn` calls and the registry entry.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm exec ultracite fix`
- **Check for issues**: `pnpm exec ultracite check`
- **Diagnose setup**: `pnpm exec ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt will catch most mechanical issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `pnpm exec ultracite fix` before committing to ensure compliance.
