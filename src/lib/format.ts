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
