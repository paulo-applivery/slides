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

export function BarChart({ data }: BarChartProps) {
  const t = useThemeTokens(TOKENS);

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
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: t["--text-muted"] }}
          />
          <YAxis
            stroke={t["--text-muted"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: t["--text-muted"] }}
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
              fontSize: 12,
              padding: "8px 12px",
            }}
            labelStyle={{ color: t["--text-primary"], fontWeight: 500 }}
            itemStyle={{ fontFamily: "var(--font-mono)" }}
            formatter={(v) => fmtEUR(Number(v))}
          />
          <Bar dataKey="prev" name="Previous" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={`prev-${d.label}`} fill={t["--bg-elev-3"]} />
            ))}
          </Bar>
          <Bar dataKey="value" name="This period" radius={[3, 3, 0, 0]}>
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
