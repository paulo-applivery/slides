"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useCountUp } from "@/hooks/useCountUp";
import { fmtEUR, fmtInt } from "@/lib/format";
import { useThemeTokens } from "@/lib/theme";

/**
 * KPI tile. Layout is stacked vertically — value on top, full-width
 * sparkline below, delta + period at the bottom — so the value gets the
 * full card width and reads from across a room.
 */
export type SingleValueProps = {
  value: number;
  label: string;
  unit?: "€" | "%" | "#";
  delta: number;
  deltaPct: number;
  period?: string;
  spark: number[];
  /**
   * Optional pre-formatted display string from the executor — when set,
   * overrides the internal value+unit formatting. Used to honour
   * `config.outputFormat` (Number / Currency / Percent / Yes-No /
   * Duration) so the wizard's choice wins regardless of metric unit.
   */
  formatted?: string;
  /**
   * Optional conditional-color hex picked by
   * `pickConditionalColor(value, target, spec)`. When `null` / undefined
   * the value uses the design-system default.
   */
  valueColor?: string | null;
};

const TOKENS = ["--success", "--danger"] as const;

export function SingleValue({
  value,
  label,
  unit = "€",
  delta,
  deltaPct,
  period = "vs last month",
  spark,
  formatted,
  valueColor,
}: SingleValueProps) {
  const animated = useCountUp(value);
  const positive = (deltaPct ?? 0) >= 0;
  const t = useThemeTokens(TOKENS);
  const sparkColor = positive ? t["--success"] : t["--danger"];
  const sparkData = spark.map((v, i) => ({ i, v }));

  // When the executor handed us a formatted string (Yes/No / Duration /
  // explicit currency / percent) we trust it — animating these forms
  // doesn't make sense ("3.5 mo" mid-tween). For raw numbers, keep the
  // count-up animation by deriving from `animated`.
  const display =
    formatted ??
    (unit === "€"
      ? fmtEUR(animated)
      : unit === "%"
        ? animated.toFixed(1) + "%"
        : fmtInt(Math.round(animated)));

  // Deterministic gradient id (label + sign) so duplicate widgets each get
  // their own SVG gradient definition without colliding.
  const gradId = `sv-spark-${label}-${positive ? "up" : "down"}`;

  return (
    <div className="sv">
      <div
        className="sv-value"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {display}
      </div>
      <div className="sv-spark">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={sparkColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={sparkColor}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="sv-bottom">
        <span className={`sv-delta ${positive ? "up" : "down"}`}>
          <span className="sv-delta-arrow">{positive ? "▲" : "▼"}</span>
          <span className="sv-delta-pct">{Math.abs(deltaPct).toFixed(1)}%</span>
          <span className="sv-delta-abs">
            {positive ? "+" : ""}
            {unit === "€" ? fmtEUR(delta) : delta}
          </span>
        </span>
        <span className="sv-period">{period}</span>
      </div>
    </div>
  );
}
