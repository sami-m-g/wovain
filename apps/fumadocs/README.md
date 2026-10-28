# Wovain Docs

Documentation site for Wovain, built with [Fumadocs](https://fumadocs.dev) on Next.js.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter fumadocs dev
```

Open http://localhost:4000.

### Environment

Set these in `apps/fumadocs/.env.local`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEBIUS_API_KEY` | Yes | Nebius Token Factory key for the AI chat |
| `DOCS_CHAT_MODEL` | No | Model for the AI chat; Nemotron 3.5 Lightning locally, set by Pulumi config when deployed |
| `NEBIUS_BASE_URL` | No | Token Factory's OpenAI-compatible endpoint |
| `POSTHOG_KEY` | No | PostHog token for the chat's `$ai_generation` events; empty is off |

## Content

Pages are MDX files in `content/docs`. They are loaded with the Fumadocs MDX [Macro API](https://fumadocs.dev/docs/mdx/macro) in `src/lib/source.ts`.

## Routes

| Route | Description |
| --- | --- |
| `/` | Landing page (`src/app/(home)`) |
| `/docs/*` | Documentation pages |
| `/api/search` | Search endpoint |
| `/api/chat` | AI chat endpoint, grounded on the docs |
| `/llms.txt`, `/llms-full.txt` | LLM-friendly index and full content |
| `/llms.mdx/docs/*` | Single page as Markdown; `src/proxy.ts` rewrites `.md` and Markdown-preferring requests here |
| `/og/docs/*` | Open Graph images |

## Styling

The site uses the shared shadcn theme from `@wovain/ui`, mapped onto Fumadocs through `fumadocs-ui/css/shadcn.css`, and the shared PostCSS config.
