"use client";

import { fmtInt } from "@/lib/format";
import { useThemeTokens } from "@/lib/theme";
import type { FunnelStage } from "./types";

/**
 * MUI-X-style stacked-trapezoid funnel.
 *
 * Each stage is a trapezoid whose top width matches the previous
 * stage's bottom width — the funnel narrows continuously from the
 * widest stage (top) toward the smallest (bottom). This is the
 * reference shape the operator picked out of the MUI X examples and
 * is the standard sales-funnel idiom (Plecto, Salesforce, MUI all use
 * the continuous-narrowing variant rather than centred trapezoids).
 *
 *   ┌───────────────┐   ← stage A (value/max of full width)
 *   └──┐         ┌──┘
 *      └─────────┘     ← stage B (narrower)
 *        └──┐ ┌──┘
 *           └─┘        ← stage C (narrowest)
 *
 * Widths are scaled against the maximum value across all stages so the
 * first stage usually fills the full width. Stages out of order
 * (e.g. a later stage *higher* than an earlier one) still render
 * truthfully — the funnel widens to show the anomaly rather than
 * silently clamping it.
 *
 * Value labels are HTML-overlaid (not SVG `<text>`) so they keep the
 * design system's font and don't get distorted by the SVG's
 * non-uniform aspect-ratio scaling.
 */
export type FunnelChartProps = {
  stages: FunnelStage[];
};

const TOKENS = ["--text-tertiary", "--text-primary"] as const;

/**
 * Keep all stages in the selected brand family. The appearance picker
 * publishes its color as `--primary`, while `--secondary` supplies the
 * design system navy used to deepen later conversion stages.
 */
function stageFill(index: number, total: number): string {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  const primaryShare = Math.round(100 - ratio * 46);
  return `color-mix(in srgb, var(--primary) ${primaryShare}%, var(--secondary))`;
}

export function FunnelChart({ stages }: FunnelChartProps) {
  const t = useThemeTokens(TOKENS);

  if (stages.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          minHeight: 80,
        }}
      >
        <p
          className="t-small"
          style={{ color: t["--text-tertiary"], textAlign: "center" }}
        >
          No stages configured.
        </p>
      </div>
    );
  }

  // viewBox dimensions — preserveAspectRatio="none" lets the SVG
  // stretch to fill the cell while we keep the polygon math
  // independent of the cell's actual size.
  const W = 100;
  const H = 100;
  const stageH = H / stages.length;

  // Normalise widths against the largest stage so the widest section
  // (typically the first) fills ~100% of the available width. `max`
  // guarded against 0 so an all-zero funnel still renders flat
  // rectangles rather than dividing by zero.
  const max = Math.max(...stages.map((s) => s.value), 1);
  const widths = stages.map((s) => (Math.max(0, s.value) / max) * W);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, display: "block" }}
          role="img"
          aria-label={`Funnel with ${stages.length} stages`}
        >
          {stages.map((s, i) => {
            const topW = widths[i];
            // The bottom of stage i matches the top of stage i+1, so
            // the trapezoids tessellate cleanly with no gaps. Last
            // stage gets a flat-bottom rectangle (top = bottom = its
            // own width).
            const botW =
              i < stages.length - 1 ? widths[i + 1] : widths[i];
            const tl = (W - topW) / 2;
            const tr = tl + topW;
            const bl = (W - botW) / 2;
            const br = bl + botW;
            const y0 = i * stageH;
            const y1 = (i + 1) * stageH;
            const prevValue = i > 0 ? stages[i - 1].value : null;
            const conversion =
              prevValue && prevValue > 0
                ? ((s.value / prevValue) * 100).toFixed(1)
                : null;
            return (
              <polygon
                key={`${s.label}-${i}`}
                points={`${tl},${y0} ${tr},${y0} ${br},${y1} ${bl},${y1}`}
                fill={stageFill(i, stages.length)}
              >
                {/* Native SVG tooltip — cheap, no extra deps, and a
                    reasonable fallback if we never wire up a React
                    tooltip layer. */}
                <title>
                  {`${s.label}: ${s.formatted ?? fmtInt(s.value)}${
                    conversion ? ` (${conversion}% from ${stages[i - 1].label})` : ""
                  }`}
                </title>
              </polygon>
            );
          })}
        </svg>

        {/* HTML overlay for value labels.
            We keep these out of the SVG because the SVG is scaled
            non-uniformly (preserveAspectRatio="none"), which would
            stretch any inline `<text>` along with the polygons.
            Each non-first stage shows its conversion rate from the
            previous stage right below the value — that's the
            "% that moved A → B → C" the funnel idiom is built on. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            pointerEvents: "none",
          }}
        >
          {stages.map((s, i) => {
            const prevValue = i > 0 ? stages[i - 1].value : null;
            // Conversion = current / previous. Guarded against a 0
            // previous (impossible to compute "% that moved" from
            // nothing) and a missing previous (first stage). When
            // a later stage exceeds the previous one we still
            // render the >100% truthfully — it's an informative
            // anomaly, not a bug to hide.
            const conversion =
              prevValue && prevValue > 0
                ? (s.value / prevValue) * 100
                : null;
            return (
              <div
                key={`${s.label}-${i}-label`}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "clamp(1px, 0.4cqh, 4px)",
                  padding: "0 8px",
                  color: "rgba(255, 255, 255, 0.96)",
                  // Slight drop-shadow keeps the white legible on
                  // the brightest brand stage without darkening
                  // the palette.
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.18)",
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1,
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: "clamp(13px, 3.2cqh, 26px)",
                  }}
                >
                  {s.formatted ?? fmtInt(s.value)}
                </span>
                {conversion !== null && (
                  <span
                    style={{
                      fontSize: "clamp(9px, 1.8cqh, 14px)",
                      opacity: 0.78,
                      // Tighter weight so the conversion reads as
                      // metadata rather than competing with the
                      // primary value.
                      fontWeight: 400,
                      letterSpacing: "0.02em",
                    }}
                    aria-label={`${conversion.toFixed(1)} percent from previous stage`}
                  >
                    ↓ {conversion.toFixed(1)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend strip — matches the swatch + label layout MUI uses
          below their funnels. Wraps to multiple rows when the
          container is too narrow. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 14px",
          padding: "2px 4px",
        }}
      >
        {stages.map((s, i) => (
          <span
            key={`${s.label}-${i}-legend`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: t["--text-tertiary"],
              lineHeight: 1.2,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: stageFill(i, stages.length),
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
