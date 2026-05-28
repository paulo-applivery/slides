import type { CSSProperties } from "react";

/**
 * Single source of truth for the Applivery brand mark.
 *
 *   LogoMark  → just the white "A" SVG (inherits `fill` via currentColor
 *               unless overridden), sized by `size`.
 *   LogoBadge → the mark inside the branded blue gradient circle, matching
 *               the app-icon asset. Used in the sidebar, login, and anywhere
 *               a standalone logo is needed so they never drift apart.
 *
 * The path + viewBox are the canonical artwork (near-square 144×143 bounds),
 * so the mark always renders centered and in proportion.
 */

const VIEWBOX = "72 73 144 143";

export function LogoMark({
  size = 16,
  color = "white",
  style,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      fill={color}
      aria-hidden="true"
      style={style}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M144.012 73.0235L156.9 98.5442L156.888 98.5679L216 215.615L186.573 208.389L144 124.089L101.427 208.389L72 215.615L131.111 98.5679L131.1 98.5442L143.988 73.0235L144 73L144.012 73.0235Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M144.04 153.275L164.099 192.855L143.978 188.022L123.858 192.855L144.034 153.275L144.037 153.269L144.04 153.275Z"
      />
    </svg>
  );
}

export function LogoBadge({
  size = 28,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(160deg, #2C68FF 0%, #0B33D4 55%, #0226B8 100%)",
        ...style,
      }}
    >
      <LogoMark size={Math.round(size * 0.52)} />
    </div>
  );
}
