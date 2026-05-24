"use client";

import { useCountUp } from "@/hooks/useCountUp";

/**
 * Brand gauge — 270° dial with a soft track, brand-blue progress arc
 * (rounded caps), a hero value, a muted target underneath, and a floating
 * percentage pill at the tip of the progress arc.
 *
 * Geometry:
 *   - Arc spans 270° with the gap at the bottom (between south-west and
 *     south-east).
 *   - Starts at 135° (bottom-left tip), sweeps clockwise through west →
 *     north → east → bottom-right (405° in SVG angle space).
 *   - No needle. No tick marks. No threshold bands. The pill carries all
 *     the percentage signal.
 *
 * Everything renders inside the SVG so positions / type sizes scale with
 * the viewBox — no container-query plumbing needed in CSS.
 */
export type GaugeChartProps = {
  value: number;
  target: number;
  /** Set false to suppress the floating % pill (used in tight TV layouts). */
  showPill?: boolean;
};

// Geometry constants (viewBox units; SVG scales to fit the parent)
const W = 400;
const H = 300;
const CX = W / 2;
const CY = H / 2 + 16;
const R = 128;
const STROKE = 26;
const START_DEG = 135; // bottom-left tip
const SPAN_DEG = 270; // total arc span; gap at bottom = 90°

export function GaugeChart({ value, target, showPill = true }: GaugeChartProps) {
  const animated = useCountUp(value);
  const pct = target === 0 ? 0 : value / target;
  const animPct = Math.max(0, Math.min(1, target === 0 ? 0 : animated / target));
  const pctDisplay = Math.round(pct * 100);

  // Where on the arc the progress ends — used both for the path and the pill.
  const progEndDeg = START_DEG + animPct * SPAN_DEG;

  const bgPath = describeArc(START_DEG, START_DEG + SPAN_DEG);
  const progPath = animPct > 0 ? describeArc(START_DEG, progEndDeg) : null;

  // Pill position: end of the progress arc (or the start tip when 0%).
  const pillAngleRad =
    ((animPct > 0 ? progEndDeg : START_DEG) * Math.PI) / 180;
  const pillX = CX + R * Math.cos(pillAngleRad);
  const pillY = CY + R * Math.sin(pillAngleRad);

  return (
    <div
      className="gauge"
      // `width: auto` + `height: 100%` lets the gauge size from the
      // smaller axis (the parent body uses flex column with center
      // alignment + overflow:hidden), so it never overflows. The aspect
      // ratio keeps the dial proportional.
      style={{
        height: "100%",
        width: "auto",
        maxWidth: "100%",
        aspectRatio: `${W} / ${H}`,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Background track — faint primary-tinted ring */}
        <path
          d={bgPath}
          stroke="var(--gauge-track, var(--primary-soft-strong, var(--primary-soft)))"
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
        />
        {/* Active progress — solid brand color, rounded caps, soft glow */}
        {progPath && (
          <path
            d={progPath}
            stroke="var(--primary)"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            style={{
              filter: "drop-shadow(0 0 10px rgba(2, 65, 227, 0.35))",
            }}
          />
        )}

        {/* Hero value — Outfit semibold, tight tracking; aligned to the
            centre of the dial. */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: "-3px",
          }}
        >
          {fmtCompact(animated)}
        </text>

        {/* Target — smaller, muted, sits just below the hero number */}
        <text
          x={CX}
          y={CY + 56}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-tertiary)"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-1px",
          }}
        >
          {fmtCompact(target)}
        </text>

        {/* Percentage pill — anchored to the tip of the progress arc.
            Drawn as SVG so it scales with the rest. */}
        {showPill && <Pill x={pillX} y={pillY} pct={pctDisplay} />}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill (SVG rect + text)
// ─────────────────────────────────────────────────────────────────────────────

function Pill({ x, y, pct }: { x: number; y: number; pct: number }) {
  // Width grows with digit count: 44 → "6%", 54 → "77%", 62 → "100%+".
  const label = `${pct}%`;
  const w = label.length <= 2 ? 44 : label.length === 3 ? 54 : 62;
  const h = 26;
  // SVG `transform` attribute (not CSS) so coordinates are in viewBox units.
  // useCountUp drives the pill smoothly across frames via re-renders — no
  // CSS transition needed.
  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ filter: "drop-shadow(0 4px 14px rgba(2, 65, 227, 0.45))" }}
    >
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={8}
        fill="var(--primary)"
      />
      <text
        x={0}
        y={1}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function describeArc(fromDeg: number, toDeg: number): string {
  const fromRad = (fromDeg * Math.PI) / 180;
  const toRad = (toDeg * Math.PI) / 180;
  const x0 = CX + R * Math.cos(fromRad);
  const y0 = CY + R * Math.sin(fromRad);
  const x1 = CX + R * Math.cos(toRad);
  const y1 = CY + R * Math.sin(toRad);
  const sweep = toDeg - fromDeg;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${largeArc} 1 ${x1} ${y1}`;
}

/**
 * Compact value formatter — lowercase `k` for thousands, uppercase `M` for
 * millions, no currency symbol. Matches the reference visual exactly.
 */
function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + "M";
  }
  if (abs >= 1_000) return Math.round(n / 1_000) + "k";
  return Math.round(n).toString();
}
