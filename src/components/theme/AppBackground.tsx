"use client";

import dynamic from "next/dynamic";
import { useAppearance } from "./ThemeProvider";

/**
 * Lazy-load the WebGL backgrounds so they don't ship in the main bundle
 * for users who keep `background: null`. Each one pulls in either three.js
 * or ogl + shaders — heavy enough to want the code-split.
 *
 * `ssr: false` because the components use `window` / `document` /
 * WebGLRenderingContext on mount.
 */
const PixelBlast = dynamic(() => import("@/components/PixelBlast"), {
  ssr: false,
  loading: () => null,
});
const SoftAurora = dynamic(() => import("@/components/SoftAurora"), {
  ssr: false,
  loading: () => null,
});
const Iridescence = dynamic(() => import("@/components/Iridescence"), {
  ssr: false,
  loading: () => null,
});

/**
 * Mounts the chosen background as a fixed full-bleed layer behind the
 * app. Brand color is forwarded so the effect blends with the app's
 * accent. Returns `null` when no effect is picked — the default app
 * surface (token-driven solid color) shows through.
 */
export function AppBackground() {
  const { appearance } = useAppearance();
  if (!appearance.background) return null;

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    // We render the chrome (sidebar / topbar / cards) above this layer
    // via a higher z-index on `.app` — see app.css.
  };

  // Each effect takes its color a little differently:
  //   PixelBlast → string hex
  //   SoftAurora → color1 / color2 hex pair (we feed the same brand twice
  //                 with a subtle hue shift handled by the shader)
  //   Iridescence → [r, g, b] floats 0-1
  switch (appearance.background) {
    case "pixelBlast":
      return (
        <div style={containerStyle}>
          <PixelBlast color={appearance.brandColor} />
        </div>
      );
    case "softAurora":
      return (
        <div style={containerStyle}>
          <SoftAurora
            color1={appearance.brandColor}
            color2={lighten(appearance.brandColor, 0.25)}
          />
        </div>
      );
    case "iridescence":
      return (
        <div style={containerStyle}>
          <Iridescence color={hexToRgbFloat(appearance.brandColor)} />
        </div>
      );
  }
}

function hexToRgbFloat(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return [1, 1, 1];
  const [r, g, b] = m.slice(0, 3).map((h) => parseInt(h, 16) / 255);
  return [r, g, b];
}

/** Naive hex lightener — push each channel toward 255 by `amount`. */
function lighten(hex: string, amount: number): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return hex;
  const out = m.slice(0, 3).map((h) => {
    const v = parseInt(h, 16);
    const next = Math.round(v + (255 - v) * amount);
    return next.toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}
