"use client";

import { fmtEUR } from "@/lib/format";
import type { Rep } from "./types";

/**
 * Animated leaderboard. Rows are keyed by id; positions are written to
 * `--y` CSS custom properties so reorder animates via transform — the
 * FLIP-style technique from the prototype.
 */
export function RankingWidget({ reps }: { reps: Rep[] }) {
  const sorted = [...reps].sort((a, b) => b.value - a.value);
  const positions = sorted.map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <div className="rank-list">
      {positions.map((r) => {
        const pctOfTarget = r.value / r.target;
        const isTop = r.rank === 1;
        return (
          <div
            key={r.id}
            className="rank-row"
            // Row positioning is driven by `--rank-pos` (an index multiplied by
            // the CSS-owned `--row-h`), so TV overrides can bump row height
            // without re-rendering. See .rank-list { --row-h } in app.css.
            style={
              {
                "--rank-pos": r.rank - 1,
                zIndex: 100 - r.rank,
              } as React.CSSProperties
            }
          >
            <div className={`rank-num ${isTop ? "rank-top" : ""}`}>
              <span className="t-mono">{r.rank}</span>
            </div>
            <div className="rank-avatar" style={{ background: r.color }}>
              {r.initials}
            </div>
            <div className="rank-main">
              <div className="rank-name-row">
                <span className="rank-name">{r.name}</span>
                <span className="rank-value t-mono">
                  {r.formatted ?? fmtEUR(r.value)}
                </span>
              </div>
              <div className="rank-bar-track">
                <div
                  className="rank-bar"
                  // Bar fill picks up the row's color (conditionalColors
                  // hex when the wizard set them; the default palette
                  // entry otherwise).
                  style={{
                    width: `${Math.min(100, pctOfTarget * 100)}%`,
                    background: r.color,
                  }}
                />
              </div>
              <div className="rank-meta">
                <span>
                  {Math.round(pctOfTarget * 100)}% of top performer
                </span>
                <span className={`rank-delta ${r.delta >= 0 ? "up" : "down"}`}>
                  {r.delta >= 0 ? "↑" : "↓"} {Math.abs(r.delta)} this week
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
