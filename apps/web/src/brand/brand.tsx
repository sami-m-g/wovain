/**
 * The brand in one place: the palette primitives here, the logo files in
 * `public/brand/`.
 *
 * Every surface reads the primitives through the semantic tokens in
 * `src/styles/tokens.css` (`--brand-*` → roles such as `--background`,
 * `--primary`). Every logo (header, footer, app rail, Open Graph images,
 * emails) is one of the files listed in `BRAND_ASSETS`; the favicon and app
 * icons are `src/app/icon.svg` and its raster copies (`favicon.ico`,
 * `icon.png`, `apple-icon.png`, `public/brand/icon-512.png`). Swapping a logo
 * variant is a file swap.
 *
 * The approved identity: the Flick w, cochineal and plum ink on calico, with
 * saffron for small highlights.
 */
export const BRAND_NAME = "wovain";

interface Palette {
  /** Page ground. */
  paper: string;
  /** Cards, inputs, panels. */
  surface: string;
  /** Subtle fills: hovers, wells, table stripes. */
  sunken: string;
  /** Primary text. */
  ink: string;
  /** Secondary text; 4.5:1 or more on paper, surface and sunken. */
  inkMuted: string;
  /** Hairlines. */
  line: string;
  /** Input borders and stronger rules; 3:1 or more on paper. */
  lineStrong: string;
  /** The one saturated colour: primary actions, the current step, selection. */
  accent: string;
  /** Text and icons on `accent`. */
  onAccent: string;
  /** Tinted fill behind selected or active items. */
  accentSoft: string;
  /** Accent used as text on paper (links); 4.5:1 or more. */
  accentText: string;
  /** Published, connected, done. */
  success: string;
  /** Needs you. */
  warning: string;
  /** Stopped, destructive. */
  danger: string;
  /** Hang-tag stock and its ink: a physical card, light in both themes. */
  tag: string;
  tagInk: string;
  /** The dark app rail. */
  rail: string;
  railInk: string;
  /** The accent as it reads on the rail. */
  railAccent: string;
}

export const PALETTE: { light: Palette; dark: Palette } = {
  dark: {
    accent: "#e8608f",
    accentSoft: "#3d1730",
    accentText: "#f28aae",
    danger: "#ff8a7a",
    ink: "#f7f1e8",
    inkMuted: "#c4b3bc",
    line: "#3a2533",
    lineStrong: "#806678",
    onAccent: "#1a0c16",
    paper: "#1a0c16",
    rail: "#12080f",
    railAccent: "#f3b23a",
    railInk: "#f7f1e8",
    success: "#6bc48a",
    sunken: "#2e1a29",
    surface: "#241320",
    tag: "#f7f1e8",
    tagInk: "#3b1530",
    warning: "#f3b23a",
  },
  light: {
    accent: "#b0245f",
    accentSoft: "#f6dde6",
    accentText: "#9a1f53",
    danger: "#b3261e",
    ink: "#3b1530",
    inkMuted: "#6b5462",
    line: "#e6dccd",
    lineStrong: "#93837a",
    onAccent: "#ffffff",
    paper: "#f7f1e8",
    rail: "#3b1530",
    railAccent: "#f3b23a",
    railInk: "#f7f1e8",
    success: "#2f6b3e",
    sunken: "#efe7da",
    surface: "#fffcf7",
    tag: "#fffcf7",
    tagInk: "#3b1530",
    warning: "#8a5a00",
  },
};

const toCssName = (key: string) =>
  `--brand-${key.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;

const declarations = (palette: Palette) =>
  Object.entries(palette)
    .map(([key, value]) => `${toCssName(key)}:${value}`)
    .join(";");

/** The primitives as CSS custom properties, for a `<style>` in the document head. */
export const BRAND_CSS = `:root{${declarations(PALETTE.light)}}.dark{${declarations(PALETTE.dark)}}`;

/** Logo files under `public/brand/`, with their intrinsic sizes. */
export const BRAND_ASSETS = {
  /** Mark plus wordmark, for the nav and the app rail. */
  lockup: {
    dark: "/brand/lockup-dark.svg",
    height: 42.16,
    light: "/brand/lockup-light.svg",
    width: 175.28,
  },
  /** The mark alone, in colour; `markMono` uses currentColor. */
  mark: "/brand/mark.svg",
  markMono: "/brand/mark-mono.svg",
  /** The seam lockup, for brand moments (footer, auth, social cards). */
  seam: {
    dark: "/brand/lockup-seam-dark.svg",
    height: 46,
    light: "/brand/lockup-seam-light.svg",
    width: 241.25,
  },
} as const;
