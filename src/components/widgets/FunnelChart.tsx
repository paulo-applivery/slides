"use client";

import {
  Cell,
  Funnel,
  FunnelChart as RFunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { fmtInt } from "@/lib/format";
import { useThemeTokens } from "@/lib/theme";
import type { FunnelStage } from "./types";

/**
 * Recharts FunnelChart — the textbook stage-by-stage funnel visualization.
 *
 * Conversion rates between stages are surfaced below the chart in a
 * standalone strip; the funnel itself is the canonical trapezoid shape.
 *
 * Colors walk from `--primary` to `--success` so the last stage (closed-won)
 * lands on the success token without leaving the brand palette.
 */
export type FunnelChartProps = {
  stages: FunnelStage[];
};

const TOKENS = [
  "--primary",
  "--primary-hover",
  "--accent",
  "--success",
  "--text-tertiary",
  "--text-primary",
  "--border-strong",
  "--bg",
  "--text-muted",
] as const;

function lerp(hex1: string, hex2: string, k: number): string {
  // Accepts 3- or 6-char hex; falls back to hex1 for non-hex inputs (CSS
  // variables that came back as rgba). Cheap channel-wise mix.
  const parse = (s: string) => {
    const h = s.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  if (!hex1.startsWith("#") || !hex2.startsWith("#")) return hex1;
  const a = parse(hex1);
  const b = parse(hex2);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function FunnelChart({ stages }: FunnelChartProps) {
  const t = useThemeTokens(TOKENS);

  // Walk from --primary → --success across the stages
  const colorAt = (i: number) => {
    if (!t["--primary"] || !t["--success"]) return t["--primary"];
    const k = stages.length === 1 ? 0 : i / (stages.length - 1);
    return lerp(t["--primary"], t["--success"], k);
  };

  const data = stages.map((s, i) => ({
    name: s.label,
    value: s.value,
    formatted: s.formatted ?? fmtInt(s.value),
    fill: colorAt(i),
  }));

  return (
    <div className="funnel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RFunnelChart>
            <Tooltip
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
              formatter={(v) => fmtInt(Number(v))}
            />
            <Funnel dataKey="value" data={data} isAnimationActive>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
              <LabelList
                position="right"
                fill={t["--text-primary"]}
                stroke="none"
                dataKey="name"
                fontSize={12}
                fontWeight={500}
              />
              <LabelList
                position="inside"
                fill="#fff"
                stroke="none"
                dataKey="formatted"
                fontSize={13}
                fontFamily="var(--font-mono)"
              />
            </Funnel>
          </RFunnelChart>
        </ResponsiveContainer>
      </div>
      {/* Conversion strip — bespoke design system component sitting below the
          standard chart so we keep the stage-to-stage % info without
          re-inventing the funnel itself. */}
      <ul
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, stages.length - 1)}, 1fr)`,
          gap: 8,
          listStyle: "none",
          padding: 0,
          margin: 0,
        }}
      >
        {stages.slice(1).map((s, i) => {
          const conv = (s.value / stages[i].value) * 100;
          return (
            <li
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "8px 10px",
                background: "var(--bg-elev-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              <span className="t-micro" style={{ fontSize: 10 }}>
                {stages[i].label} → {s.label}
              </span>
              <span className="t-mono" style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                {conv.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
