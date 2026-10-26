# Repository Guide

## Structure

- `apps/web`: Next.js 16 app (App Router, oRPC, Better Auth, evlog)
- `apps/fumadocs`: Fumadocs documentation site with OpenRouter AI chat
- `packages/api`: oRPC routers and procedures
- `packages/auth`: Better Auth configuration
- `packages/db`: Drizzle schema, relations and client (PostgreSQL)
- `packages/ui`: shared shadcn/ui components (Base UI, Tailwind CSS 4)
- `packages/config`: shared `tsconfig.base.json`

## Tech

- pnpm workspaces with catalog versions in `pnpm-workspace.yaml`; Turborepo for tasks
- TypeScript 6 for tooling (`typescript` alias of `@typescript/typescript6`), TypeScript 7 for `tsc`
- Varlock for environment: each app owns `.env.schema`; import `ENV` from the generated `src/env.ts`
- Ultracite (Oxlint + Oxfmt) for lint and format; knip for unused code

## Rules

- Do not edit vendored or generated files; update them with their CLI:
  - `packages/ui/src/{components,hooks,lib}`: shadcn CLI
  - `apps/fumadocs/src/components/{ai,codeblock.tsx,tabs,ui}`, `apps/fumadocs/src/lib/{cn,merge-refs}.ts`: Fumadocs CLI
  - `packages/db/src/schema/auth.ts`: `pnpm run auth:generate`
  - `packages/db/src/migrations`: `pnpm run db:generate`
  - `.agents/skills`: `npx skills experimental_install`
- Add shared dependency versions to the pnpm catalog and reference them with `catalog:`
- Run `pnpm run check`, `pnpm run check-types` and `pnpm run knip` before committing

## How to roll out and roll back

Design: `docs/adr/0001-progressive-delivery.md`.

- **New flag:** add it to `packages/core/src/flag-registry.ts` with an owner, an expiry and a rollout per environment, then read it with `core.flags.isOn("<name>", { userId, plan })` (`isFlagOn` in `apps/web`). Names are typed; never pass a string you built. The safe state is off: flags are off when GitLab can't be reached.
- **Roll out:** change the flag's `rollout` in the registry (`off` → `internal` → `percent` → `all`) in a merge request. Its Pulumi preview shows the new GitLab strategies, and the merge applies them.
- **Kill switch:** Deploy > Feature flags > the flag's Status toggle, or `PUT /projects/:id/feature_flags/:name` with `active=false`. Pulumi ignores Status, so this isn't drift. The release guard does the same on its own for guarded flags.
- **Deploys:** every web deploy is a canary (the `canary` tag, 10% of traffic) that `canary:production` promotes or rolls back after 10 minutes. Its verdict is in the job's `canary.md` artifact.
- **Roll back traffic by hand:** Run pipeline on `main` with `ROLLBACK=1` (optionally `ROLLBACK_TO=<revision>`). Never `gcloud run services update-traffic` from a laptop, and never add traffic to Pulumi: CI owns it.
- **Clean up:** a `flag-cleanup` issue means the flag expired or is fully rolled out. Delete the losing code path and the `isOn` calls, then the registry entry; `pulumi up` deletes the GitLab flag.

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
