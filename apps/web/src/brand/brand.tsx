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
 * The approved identity: the Shuttle. A calico loom shuttle with a bobbin
 * window rises on a 24 degree diagonal across a cochineal tile, trailing a
 * saffron thread. Wordmark: Geist 600 with a drawn w and a single-storey a.
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
  /** The Shuttle mark drawn inline (intro, loader): tile, shuttle, thread. */
  markTile: string;
  markShuttle: string;
  markThread: string;
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
    markShuttle: "#f7f1e8",
    markThread: "#f3b23a",
    markTile: "#be2b68",
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
    markShuttle: "#f7f1e8",
    markThread: "#f3b23a",
    markTile: "#b0245f",
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
  /** Mark plus wordmark: `light` for light grounds, `dark` for dark ones. */
  lockup: {
    dark: "/brand/lockup-dark.svg",
    height: 48,
    light: "/brand/lockup-light.svg",
    width: 216.61,
  },
  /** The mark alone: light (default), dark grounds, one ink (currentColor) and reversed. */
  mark: "/brand/mark.svg",
  markDark: "/brand/mark-dark.svg",
  markMono: "/brand/mark-mono.svg",
  markReversed: "/brand/mark-reversed.svg",
  /** The lockup with the mark's square left empty, for the animated `<Logo intro/>`. */
  wordmark: {
    dark: "/brand/wordmark-dark.svg",
    light: "/brand/wordmark-light.svg",
  },
} as const;

/**
 * The Shuttle drawn inline on its 48 grid, for the animated mark (intro and
 * loader). The same geometry as `public/brand/mark.svg`.
 */
export const SHUTTLE = {
  /** One step along the rising diagonal (24 degrees). */
  axis: { x: 0.914, y: -0.407 },
  /** The shuttle with its bobbin window (even-odd). */
  hull: "M12.12 29.29 16.99 20.55 31.61 14.04 41.36 16.27 36.49 25.01 21.87 31.51Z M20.98 23.37 31.03 18.9 32.5 22.19 22.45 26.66Z",
  /** The thread's centre line, stroked at `threadWidth`. */
  thread: "M15.78 27.66C8.47 30.91 5.83 34.83 -6 33.86",
  threadWidth: 2.6,
  tileRadius: 10.5,
} as const;
