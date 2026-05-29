"use client";

import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtEUR } from "@/lib/format";
import { useThemeTokens } from "@/lib/theme";
import type { BarDatum } from "./types";

/**
 * Grouped bar chart — current period (primary) vs previous period (ghost).
 *
 * Built on Recharts so we get standard interactions (tooltip, responsive
 * resize) for free. Colors are read from CSS variables via useThemeTokens
 * so theme switches re-render the chart.
 */
export type BarChartProps = {
  data: BarDatum[];
  /**
   * Chart text-size multiplier. Recharts renders axis ticks as SVG
   * `font-size` attributes (not CSS), so they can't read the
   * `--chart-text-scale` var the other charts inherit — we take it as a
   * prop and multiply the numeric sizes directly. `1` is the default.
   */
  textScale?: number;
};

const TOKENS = [
  "--primary",
  "--bg-elev-3",
  "--border",
  "--text-muted",
  "--bg",
  "--text-primary",
  "--border-strong",
] as const;

export function BarChart({ data, textScale = 1 }: BarChartProps) {
  const t = useThemeTokens(TOKENS);
  const tickSize = 10 * textScale;
  const tooltipSize = 12 * textScale;

  return (
    <div className="bars-wrap" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart
          data={data}
          margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          barCategoryGap="22%"
          barGap={2}
        >
          <CartesianGrid stroke={t["--border"]} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            stroke={t["--text-muted"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: tickSize, fontFamily: "var(--font-mono)", fill: t["--text-muted"] }}
          />
          <YAxis
            stroke={t["--text-muted"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: tickSize, fontFamily: "var(--font-mono)", fill: t["--text-muted"] }}
            tickFormatter={(v: number) => fmtEUR(v).replace("€", "")}
            width={40}
          />
          <Tooltip
            cursor={{ fill: t["--bg-elev-3"], opacity: 0.4 }}
            contentStyle={{
              background: t["--bg"],
              border: `1px solid ${t["--border-strong"]}`,
              borderRadius: 10,
              boxShadow: "var(--shadow-md)",
              color: t["--text-primary"],
              fontSize: tooltipSize,
              padding: "8px 12px",
            }}
            labelStyle={{ color: t["--text-primary"], fontWeight: 500 }}
            itemStyle={{ fontFamily: "var(--font-mono)" }}
            // Prefer the outputFormat-aware `formatted` string on the
            // datum when available; falls back to the EUR formatter for
            // SEED data and the "Previous" series (which has no formatted).
            formatter={(v, _name, item) => {
              const d = item?.payload as BarDatum | undefined;
              return d?.formatted ?? fmtEUR(Number(v));
            }}
          />
          <Bar
            dataKey="prev"
            name="Previous"
            radius={[3, 3, 0, 0]}
            isAnimationActive
            animationBegin={0}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell key={`prev-${d.label}`} fill={t["--bg-elev-3"]} />
            ))}
          </Bar>
          <Bar
            dataKey="value"
            name="This period"
            radius={[3, 3, 0, 0]}
            isAnimationActive
            animationBegin={140}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell
                key={`cur-${d.label}`}
                fill={t["--primary"]}
                style={{ filter: "drop-shadow(0 0 6px rgba(2,65,227,.25))" }}
              />
            ))}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span>
          <span className="lg-sw" style={{ background: t["--bg-elev-3"] }} />
          Previous
        </span>
        <span>
          <span className="lg-sw" style={{ background: t["--primary"] }} />
          This period
        </span>
      </div>
    </div>
  );
}
