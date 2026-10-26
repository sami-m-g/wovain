---
name: wovain
description: Every drop ships with its own label. Calico and plum ink, one cochineal dye, and a hang tag that carries the evidence.
colors:
  cochineal: "#b0245f"
  cochineal-text: "#9a1f53"
  cochineal-wash: "#f6dde6"
  on-cochineal: "#ffffff"
  plum-ink: "#3b1530"
  plum-muted: "#6b5462"
  saffron: "#f3b23a"
  calico: "#f7f1e8"
  card-stock: "#fffcf7"
  calico-well: "#efe7da"
  hairline: "#e6dccd"
  hairline-strong: "#93837a"
  success: "#2f6b3e"
  warning: "#8a5a00"
  danger: "#b3261e"
  night-plum: "#1a0c16"
  night-surface: "#241320"
  night-well: "#2e1a29"
  night-hairline: "#3a2533"
  night-hairline-strong: "#806678"
  night-ink-muted: "#c4b3bc"
  night-rail: "#12080f"
  night-cochineal: "#e8608f"
  night-cochineal-text: "#f28aae"
  night-cochineal-wash: "#3d1730"
typography:
  display:
    fontFamily: "Familjen Grotesk, Geist, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.6rem, 1.55rem + 4.4vw, 5rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Familjen Grotesk, Geist, ui-sans-serif, sans-serif"
    fontSize: "clamp(2rem, 1.45rem + 2.3vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Familjen Grotesk, Geist, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 0.8vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "Familjen Grotesk, Geist, ui-sans-serif, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "'ss01', 'cv11'"
  ui:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  figures:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    fontFeature: "'tnum', 'zero'"
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "24px"
  gutter-app: "32px"
  container: "72rem"
  section: "80px"
  section-sm: "112px"
  card: "20px"
  card-lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cochineal}"
    textColor: "{colors.on-cochineal}"
    rounded: "{rounded.lg}"
    typography: "{typography.ui}"
    height: "36px"
    padding: "0 16px"
  button-primary-hero:
    backgroundColor: "{colors.cochineal}"
    textColor: "{colors.on-cochineal}"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "{colors.calico}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.plum-muted}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.card-stock}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  rail:
    backgroundColor: "{colors.plum-ink}"
    textColor: "{colors.calico}"
    width: "15rem"
  rail-item-active:
    textColor: "{colors.saffron}"
    rounded: "{rounded.lg}"
    height: "36px"
  hang-tag:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.plum-ink}"
    typography: "{typography.figures}"
    padding: "36px 20px 20px"
  run-tape-current:
    backgroundColor: "{colors.cochineal}"
    textColor: "{colors.on-cochineal}"
    height: "36px"
  run-tape-done:
    backgroundColor: "{colors.plum-ink}"
    textColor: "{colors.calico}"
    height: "36px"
---

# Design System: wovain

## Overview

**Creative North Star: "The Hang Tag"**

Every drop ships with its own label. The evidence wovain produces (price math, sources, the judge's verdict, "paused") is set the way a garment carries its hang tag and woven care label: compact, specified, honest. The world is a calm, warm product UI (calico ground, plum ink, one hairline weight, gently rounded surfaces) with a single shaped object hanging off it: the hang tag, with chamfered top corners, a punched eyelet and ruled spec lines.

Density is product-grade, not editorial. Public pages breathe (generous section rhythm, left-aligned headlines over working controls); the app is quiet and tabular, built around the run tape, which reads as one continuous woven label: done passages solid plum, the current passage dyed cochineal, pending passages a hairline thread. Colour marks only the edge that moves. Dark mode is deep plum, never neutral grey, and the tag stays light card stock in both themes because it is a physical object.

Confirmed rejection: the earlier "printer's ink swatch book" world (print-only, read as a gimmick). The build also refuses the AI-gradient SaaS hero, the split hero and the row of icon cards.

**Key Characteristics:**

- Calico ground, plum ink, one cochineal dye rationed to what is live or chosen.
- Saffron lives on the plum rail only.
- One hairline weight everywhere; selection is the same line drawn heavier.
- The hang tag is the only shaped object; everything else is calm rounded UI.
- Familjen Grotesk speaks, Geist works, Geist Mono only for codes and money lines.
- Borders mark resting surfaces; shadows mark only what floats.

## Colors

A warm undyed-cloth palette: calico and plum ink carry almost every pixel, cochineal is the one dye, saffron is the thread on the rail.

All values are written once, in `src/brand/brand.tsx` (`PALETTE.light` and `PALETTE.dark`), emitted into the document head as `--brand-*` custom properties, and mapped onto roles in `src/styles/tokens.css` (`--background`, `--primary`, `--muted-foreground`, `--tag`...). Components use the roles, never the hex.

### Primary

- **Cochineal** (`colors.cochineal`, role `--primary`): primary actions, the current step on the run tape, the focus ring, selection. Nothing decorative.
- **Cochineal Text** (`colors.cochineal-text`, role `--accent-text`): cochineal as running text on calico (inline links in the app), tuned for 4.5:1.
- **Cochineal Wash** (`colors.cochineal-wash`, role `--accent-soft`): tinted fill behind a selected or active item, and text selection.
- **Night Cochineal** (`colors.night-cochineal`, with `night-cochineal-text` and `night-cochineal-wash`): the same three roles in dark mode, lifted to stay legible on plum.

### Secondary

- **Saffron** (`colors.saffron`, role `--sidebar-primary`): the active icon and focus ring on the dark app rail. In dark mode it also serves as the warning colour. Never on calico.

### Neutral

- **Calico** (`colors.calico`, role `--background`): page ground, light mode; also the ink on the rail and in dark mode.
- **Card Stock** (`colors.card-stock`, roles `--card`, `--popover`, `--tag`): cards, inputs, panels and the hang tag in both themes.
- **Calico Well** (`colors.calico-well`, roles `--muted`, `--secondary`): hovers, wells, table stripes, icon tiles.
- **Plum Ink** (`colors.plum-ink`, role `--foreground`, `--tag-ink`, `--sidebar`): all primary text, done passages of the run tape, the app rail in light mode.
- **Plum Muted** (`colors.plum-muted`, role `--muted-foreground`): secondary text and leads; 4.5:1 or more on calico, card stock and well.
- **Hairline** (`colors.hairline`, role `--border`): every resting border and divider.
- **Hairline Strong** (`colors.hairline-strong`, role `--input`): input borders, dashed empty states; 3:1 on calico.
- **Night Plum / Night Surface / Night Well / Night Hairline / Night Rail**: the dark-mode equivalents of ground, card, well, border and rail.

### Status

- **Success** (`colors.success`): published, connected, done. **Warning** (`colors.warning`): needs you. **Danger** (`colors.danger`): stopped, destructive. Status dots are 8px circles.

### Named Rules

**The One Dye Rule.** Cochineal marks only what is live or chosen: the primary action, the current step, the selection. If two cochineal things compete on a screen, one of them is wrong.

**The Saffron Thread Rule.** Saffron appears only on the plum rail (active icon, rail focus ring). It is a highlight, not a second accent.

**The Light Tag Rule.** The hang tag is card stock with plum ink in both themes. It does not invert.

## Typography

**Display Font:** Familjen Grotesk (with Geist, ui-sans-serif) **Body Font:** Geist (with ui-sans-serif, system-ui) **Label/Mono Font:** Geist Mono (with ui-monospace), small print only

**Character:** a warm, slightly characterful grotesk for headlines and names over a precise, neutral UI sans with tabular figures. Body text carries `ss01` and `cv11` globally.

### Hierarchy

- **Display** (600, fluid 2.6rem to 5rem, line-height 1, -0.035em): the landing hero headline only.
- **Headline** (600, fluid 2rem to 3.25rem, 1.05, -0.03em): public section titles (the `Section` heading).
- **Title** (600, fluid 1.5rem to 2rem, 1.15, -0.02em): step titles in the how-it-works sequence and similar sub-sections.
- **Page title** (600, 1.5rem rising to 1.875rem at `sm`, -0.025em): app and auth page `h1`s. Card titles drop to 1rem to 1.25rem with -0.015em to -0.02em, still in Familjen Grotesk.
- **Body** (400, 1rem, relaxed 1.625): leads at 1.125rem in plum muted; reading measure 60 to 65ch.
- **UI** (500, 0.875rem): buttons, nav, labels. Rail labels drop to 0.75rem on mobile.
- **Figures** (Geist with `tabular-nums slashed-zero`, via the `figures` utility): money, scores, counts, step numbers.
- **Code** (Geist Mono, 0.7rem to 0.875rem): copyable codes, URLs, scopes. Not for headings.

### Named Rules

**The Three Voices Rule.** Familjen Grotesk speaks (headlines, names, the tag title), Geist works (everything else), Geist Mono only for codes and money lines on a tag. No fourth face.

**The Lined-Up Money Rule.** Every number a seller compares (price, fees, profit, margin, score, count) uses the `figures` utility so columns align.

## Layout

Public pages use one container: max width 72rem with 16px gutters, 24px from `sm`. Sections run 80px vertical padding, 112px from `sm`, with a header row that puts the headline and lead (max 42rem) on the left and an optional aside bottom-aligned on the right from `md`. Headlines are left-aligned, never centred heroes. The landing first viewport is headline, lead and a working brief field, then the full-width product window with the hang tag over its right edge.

The app is a two-column grid from `lg`: a 15rem sticky plum rail and a content column (max 72rem, 16px gutters, 32px from `sm`, 32 to 40px top padding) under a 56px top bar. Below `lg` the rail collapses into a top bar with a horizontal, evenly divided nav (44px minimum targets, icon over label).

Rhythm is Tailwind's 4px grid; recurring steps are 8, 12, 16, 20 and 24px inside components. Cards pad 16 to 20px, large panels 20px rising to 24 to 32px. Lists of like things (runs, connections) are one bordered card with internal hairline dividers, so modules repeat identically and compare by sweeping.

## Elevation & Depth

Hybrid, flat by default. Resting surfaces are separated by the hairline border and the calico/card-stock step; shadows are reserved for what floats above the page. The shadow colour is plum (`hsl(318 45% 14%)`) in light mode and black in dark mode, so lifted objects cast warm, not grey, shadows. Values live in `src/styles/tokens.css` as `--elevation-*` and are exposed as `shadow-raised`, `shadow-floating` and `shadow-tag`.

### Shadow Vocabulary

- **Raised** (`box-shadow: 0 1px 2px hsl(318 45% 14% / 0.06), 0 2px 8px -2px hsl(318 45% 14% / 0.08)`): the landing brief field and the chat example card; a control that invites input.
- **Floating** (`box-shadow: 0 2px 4px hsl(318 45% 14% / 0.06), 0 16px 40px -12px hsl(318 45% 14% / 0.22)`): menus, popovers, the mobile nav sheet, the product window.
- **Tag** (`0 1px 1px hsl(318 45% 14% / 0.08), 0 10px 24px -8px hsl(318 45% 14% / 0.3)`): the hang tag's hanging shadow. Because the tag is clipped, it must be applied as a `filter: drop-shadow` on the tag's wrapper, not as `box-shadow`.

### Named Rules

**The Border Rests, Shadow Floats Rule.** A card at rest has a hairline border and no shadow. Shadow means it sits above the page: a menu, the product window, the tag.

## Shapes

Calm, gently rounded product UI built from one radius base of 10px: controls 10px (`rounded-lg`), cards and list containers 14px (`rounded-xl`), large panels and the product window 18px (`rounded-2xl`), small inset wells 8px, chips and status dots fully round. One hairline weight (1px) everywhere; selection and the active state are the same line drawn heavier or in cochineal, never a new outline style. Empty states use a dashed `hairline-strong` border.

The one exception is the hang tag: top corners chamfered at 1.25rem (via `clip-path`), bottom corners 6px, a 14px punched eyelet centred near the top edge, and an optional thin cord rising from it at a slight angle. It is defined once as the `hang-tag` utility in `src/index.css`.

## Components

### Buttons

Confident and quiet: solid cochineal for the one primary action, outline or ghost for everything else.

- **Shape:** gently rounded (10px); the landing hero submit is larger and rounder (48px tall, 14px).
- **Primary:** cochineal fill, white text, 500 weight at 0.875rem, 36px tall with 16px side padding in the app.
- **Hover / Focus:** primary fades to 80% cochineal on hover; focus is a 2px cochineal outline at 2px offset (saffron on the rail); press nudges down 1px.
- **Outline / Ghost:** outline is a hairline border on calico, filling to well on hover; ghost is plum muted text that gains a well fill and plum ink on hover (site header links).

### Chips

- **Style:** fully rounded, 0.75rem medium text, either a hairline border on transparent or a well fill. Status chips use a coloured 8px dot plus text, never colour alone.

### Cards / Containers

- **Corner Style:** 14px for cards and list containers, 18px for panels.
- **Background:** card stock on calico.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px hairline; lists divide with internal hairlines.
- **Internal Padding:** 16px, rising to 20px at `sm`; panels 20px rising to 24 to 32px.

### Inputs / Fields

- **Style:** 1px hairline-strong border, transparent (or card-stock) fill, 10px radius, 40px tall in forms, 16px text on mobile and 14px from `md`.
- **Focus:** border turns cochineal with a soft cochineal ring (3px at 25 to 50%).
- **Error / Disabled:** danger border with a soft danger ring; disabled at 50% opacity.

### Navigation

- **Public header:** 64px bar inside the container; ghost links in plum muted, 0.875rem medium, 36px tall, well fill on hover. Mobile opens a floating 16rem sheet.
- **App rail:** plum (light) or near-black plum (dark) with calico text at 70%; items are 36px rows with a 16px icon. Active item gets a faint calico-tinted fill, full-strength text and a saffron icon. Below `lg` it becomes an evenly divided top bar with 44px targets.

### Hang Tag (signature)

The one shaped object, carrying the evidence for a product: title in Familjen Grotesk, an optional subtitle at 70% ink, then ruled spec lines (price, blank, fees, profit, margin, status) as a definition list with tabular figures and hairline rules mixed from the tag ink. The emphasis line (profit or total) gets a heavier rule and semibold weight. An optional footer carries the status ("campaign paused"). Card stock with plum ink in both themes.

### Run Tape (signature)

The run as one continuous label of five passages (brief, trends, designs, products, campaign), 36px tall with 1px gaps and 10px outer radius. Done passages are solid plum ink with calico text; the current passage is cochineal; pending passages are a hairline thread with muted text. A compact variant is a 6px fully rounded tape for lists. Finished passages may play the one-time `weave` motion (900ms, `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 160ms, scaling in from the left).

### Logo

The approved Flick w, used only through the `<Logo/>` component: the plain lockup in navigation and the rail, the seam lockup for brand moments (footer, auth, social cards). `tone="dark"` forces the version drawn for dark grounds (the rail); otherwise it follows the theme.

### Swapping the brand

- **Palette:** edit `PALETTE.light` and `PALETTE.dark` in `src/brand/brand.tsx`. They become `--brand-*` custom properties; `src/styles/tokens.css` maps them to roles and does not need to change. Keep the contrast notes in the `Palette` interface (muted text 4.5:1, input borders 3:1).
- **Logo files:** replace the SVGs in `public/brand/` (`lockup-light.svg`, `lockup-dark.svg`, `lockup-seam-light.svg`, `lockup-seam-dark.svg`, `mark.svg`, `mark-mono.svg`, `mark-solid-mono.svg`, `app-icon.svg`, `favicon-16.svg`, `favicon-32.svg`, `email-logo.png`). If a lockup's proportions change, update its `width` and `height` in `BRAND_ASSETS` in `src/brand/brand.tsx`.
- **Favicon and app icon:** replace `src/app/icon.svg`, then regenerate its raster copies from it: `src/app/favicon.ico` (16, 32 and 48px, which Google Search shows), `src/app/icon.png` (192px), `src/app/apple-icon.png` (180px) and `public/brand/icon-512.png` (Next.js file conventions; the manifest lists the 192 and 512px PNGs).

## Do's and Don'ts

### Do:

- **Do** read colour through the semantic roles (`bg-background`, `text-muted-foreground`, `bg-primary`, `bg-tag`); the only place a hex lives is `src/brand/brand.tsx`.
- **Do** keep cochineal to the primary action, the current step and the selection on any screen.
- **Do** put money, scores and counts in the `figures` utility.
- **Do** show product evidence (price math, status, "paused") on the hang tag, and label example data as an example.
- **Do** use the hairline for every resting border, and draw selection as the same line heavier or in cochineal.
- **Do** keep motion to the expo ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) and let `prefers-reduced-motion` collapse it.
- **Do** render the logo through `<Logo/>` and the files in `public/brand/`.

### Don't:

- **Don't** return to the "printer's ink swatch book" world (swatches, ink chips, print-only devices).
- **Don't** build an AI-gradient SaaS hero, a split hero or a row of icon cards.
- **Don't** put saffron on calico or use it as a second accent.
- **Don't** invert the hang tag in dark mode, or give any other object a chamfered or clipped silhouette.
- **Don't** add a shadow to a resting card; shadows are for menus, popovers, the product window and the tag.
- **Don't** set headings in Geist Mono or introduce a fourth typeface.
- **Don't** use grey shadows or a neutral-grey dark mode; depth is plum.
