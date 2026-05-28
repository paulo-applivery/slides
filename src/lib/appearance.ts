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
};

export const DEFAULT_BRAND_COLOR = "#5C8BFF";

export const DEFAULT_SLIDE_APPEARANCE: SlideAppearance = {
  background: null,
  glassCards: false,
  brandColor: DEFAULT_BRAND_COLOR,
};
