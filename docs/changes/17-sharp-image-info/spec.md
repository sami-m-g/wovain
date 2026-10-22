# Spec: Replace the hand-rolled image header parser with sharp

Intent: [intent.md](intent.md)

## Requirements

- `readImageInfo(bytes)` resolves `{ format, width, height, transparent }` for PNG, JPEG and WebP, and `undefined` for anything else.
- `transparent` is sharp's `hasAlpha`, so a palette PNG with a `tRNS` chunk counts and stray "tRNS" bytes don't.
- `sharp` is pinned at 0.35.5 in `apps/server` and listed in `allowBuilds`.

## Design

- `sharp.block({ operation: ["VipsForeignLoad"] })` then `unblock` the PNG, JPEG and WebP buffer loaders (sharp's documented allowlist pattern), so libvips never parses an SVG, TIFF or other format from untrusted input.
- `metadata()` reads only the header; a zod enum narrows `meta.format`; any throw resolves `undefined`, which `put_artwork` already turns into "the image isn't a PNG, JPEG or WebP".
- Cross-platform: sharp 0.35 has no install script. Its libvips comes as optional `@img/sharp-<os>-<cpu>` packages, all recorded in `pnpm-lock.yaml`; pnpm installs the one that matches the machine, so App Hosting's Linux x64 build (glibc) gets `@img/sharp-linux-x64`. sharp's install docs only ask pnpm users to set `supportedArchitectures` when node_modules is copied across platforms, which wovain never does.
- Checked: the hand parser (current), `image-size` (headers only, no alpha), sharp (format, size, alpha in one call).

## Areas of concern

- A native binary missing on App Hosting would crash startup: `tools/design.ts` imports `lib/image.ts`, so the production smoke test after deploy would fail loudly.
- `readImageInfo` becomes async; its one caller awaits it.
