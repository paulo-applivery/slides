/**
 * Appearance primitives shared across the server (DB schema) and the
 * client (theme provider, slideshow editor, TV renderer).
 *
 * Lives in `lib/` — free of "use client" and of any React import — so
 * `db/schema.ts` can type the slide `appearance` blob without pulling a
 * client component into the server module graph.
 *
 * Split of concerns after the appearance rework:
 *   - light/dark is a per-dashboard property (see `dashboards.theme`)
 *   - background effect / glass cards / brand color are per-slide flair
 *     (see `SlideAppearance`), applied only during TV playback.
 */

/** WebGL background effects a slide can mount behind its content. */
export type BackgroundEffect = null | "pixelBlast" | "softAurora" | "iridescence";

/** Light/dark mode — stored per dashboard, applied in-app and on TV. */
export type DashboardTheme = "light" | "dark";

/**
 * Per-slide visual flair. Optional on the stored `Slide` (older rows
 * predate it); renderers fall back to `DEFAULT_SLIDE_APPEARANCE`.
 */
export type SlideAppearance = {
  background: BackgroundEffect;
  glassCards: boolean;
  /** Hex accent forwarded to the WebGL background + chart `--brand`/`--primary`. */
  brandColor: string;
  /**
   * Show the slide-duration progress ring around the screen edge while this
   * slide plays. Defaults on; older rows that predate this field read as
   * `undefined`, which the renderer treats as on (preserving prior behavior).
   */
  showProgress: boolean;
};

export const DEFAULT_BRAND_COLOR = "#5C8BFF";

/**
 * Fixed Applivery brand palette driving every WebGL background effect,
 * regardless of a slide's per-slide `brandColor` (that picker only tints
 * glass cards / chart accents now). Kept here so the renderer and any
 * future preview share one source of truth.
 *
 *   primary → the dominant brand blue
 *   deep    → the dark base the effects sit over
 *   accent  → the bright cyan highlight
 */
export const BRAND_PALETTE = {
  primary: "#0241E3",
  deep: "#010258",
  accent: "#09E9FF",
} as const;

export const DEFAULT_SLIDE_APPEARANCE: SlideAppearance = {
  background: null,
  glassCards: false,
  brandColor: DEFAULT_BRAND_COLOR,
  showProgress: true,
};
