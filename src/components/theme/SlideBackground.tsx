"use client";

import dynamic from "next/dynamic";
import type { BackgroundEffect } from "@/lib/appearance";

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
 * content. Driven by props (not the app appearance context) because
 * background flair is now a per-slide TV concern — see `SlideAppearance`.
 * Returns `null` when no effect is picked.
 */
export function SlideBackground({
  effect,
  brandColor,
}: {
  effect: BackgroundEffect;
  brandColor: string;
}) {
  if (!effect) return null;

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  // Each effect takes its color a little differently:
  //   PixelBlast → string hex
  //   SoftAurora → color1 / color2 hex pair (same brand twice, shader
  //                applies a subtle hue shift)
  //   Iridescence → [r, g, b] floats 0-1
  switch (effect) {
    case "pixelBlast":
      return (
        <div style={containerStyle}>
          <PixelBlast color={brandColor} />
        </div>
      );
    case "softAurora":
      return (
        <div style={containerStyle}>
          <SoftAurora color1={brandColor} color2={lighten(brandColor, 0.25)} />
        </div>
      );
    case "iridescence":
      return (
        <div style={containerStyle}>
          <Iridescence color={hexToRgbFloat(brandColor)} />
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
