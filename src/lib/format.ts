/** Number formatting helpers — used across widgets, TV slides and tables. */

export function fmtEUR(n: number): string {
  if (n >= 1_000_000) return "€" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "€" + (n / 1_000).toFixed(1) + "K";
  return "€" + Math.round(n);
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 0): string {
  return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
}

/**
 * Yes/No formatter — operator-friendly truthy rendering.
 * Treats `0` / `NaN` as "No"; anything else as "Yes".
 */
export function fmtYesNo(n: number): string {
  return Number.isFinite(n) && n !== 0 ? "Yes" : "No";
}

/**
 * Pick a conditional-color stop based on percentage of target.
 *
 *   pct ≤ thresholds[0]               → colors[0]   (e.g. red — below)
 *   thresholds[0] < pct ≤ thresholds[1] → colors[1] (e.g. yellow — middle)
 *   pct > thresholds[1]               → colors[2]   (e.g. green — above)
 *
 * Returns `null` when there's no target (no way to compute a percentage)
 * so the caller can fall back to the design-system colour.
 */
export function pickConditionalColor(
  value: number,
  target: number | null | undefined,
  spec: {
    colors: readonly [string, string, string];
    thresholds: readonly [number, number];
  } | null | undefined,
): string | null {
  if (!spec || !target || !Number.isFinite(target) || target === 0) return null;
  const pct = (value / target) * 100;
  const [low, high] = spec.thresholds;
  if (pct <= low) return spec.colors[0];
  if (pct <= high) return spec.colors[1];
  return spec.colors[2];
}

/**
 * Duration in days — accepts either a raw day count or a millisecond
 * delta and prints a compact form ("3 days" / "2 mo" / "1 yr 2 mo").
 * Falls back to "0 days" for non-finite input.
 */
export function fmtDurationDays(days: number): string {
  if (!Number.isFinite(days)) return "0 days";
  const n = Math.round(days);
  if (n === 0) return "Today";
  if (Math.abs(n) === 1) return "1 day";
  if (Math.abs(n) < 30) return `${n} days`;
  if (Math.abs(n) < 365) return `${Math.round(n / 30)} mo`;
  const years = Math.floor(Math.abs(n) / 365);
  const months = Math.round((Math.abs(n) % 365) / 30);
  const sign = n < 0 ? "-" : "";
  return months
    ? `${sign}${years} yr ${months} mo`
    : `${sign}${years} yr`;
}
