"use client";

import dynamic from "next/dynamic";
import { BRAND_PALETTE, type BackgroundEffect } from "@/lib/appearance";

/**
 * Lazy-load the WebGL backgrounds so they don't ship in the main bundle
 * for slides that keep `background: null`. Each one pulls in either
 * three.js or ogl + shaders — heavy enough to want the code-split.
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
 * Mounts a background effect as a fixed full-bleed layer behind the slide
 * content. Colors come from the fixed `BRAND_PALETTE` (not the per-slide
 * `brandColor`) so every effect renders on-brand — see `SlideAppearance`.
 * Returns `null` when no effect is picked.
 */
export function SlideBackground({ effect }: { effect: BackgroundEffect }) {
  if (!effect) return null;

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  // Each effect takes its color a little differently:
  //   PixelBlast → single hex (the bright accent reads best on the dark base)
  //   SoftAurora → color1 / color2 hex pair (primary blue + cyan accent)
  //   Iridescence → [r, g, b] floats 0-1 (primary brand blue)
  switch (effect) {
    case "pixelBlast":
      return (
        <div style={containerStyle}>
          <PixelBlast color={BRAND_PALETTE.accent} />
        </div>
      );
    case "softAurora":
      return (
        <div style={containerStyle}>
          <SoftAurora
            color1={BRAND_PALETTE.primary}
            color2={BRAND_PALETTE.accent}
          />
        </div>
      );
    case "iridescence":
      return (
        <div style={containerStyle}>
          <Iridescence color={hexToRgbFloat(BRAND_PALETTE.primary)} />
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
