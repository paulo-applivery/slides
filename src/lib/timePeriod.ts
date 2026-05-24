/**
 * Time-period model — how an operator says "show me Q2" without baking
 * an absolute date range into the layout.
 *
 * Stored on `widget.display.timePeriod`. A resolver turns it into a
 * concrete `{ start, end }` at render time using the current clock so
 * presets like "Current Month" auto-roll forward each month.
 *
 * Shape mirrors Plecto's tabbed picker (Current / Previous / Next /
 * All time / Advanced / Fixed) without adopting its proprietary
 * preset names — we use the granularity + offset directly so the
 * resolver stays a small finite-state thing.
 */

import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  format,
} from "date-fns";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

/** Persisted shape. */
export type TimePeriod =
  /** Today / Current Week / Current Month / Current Quarter / Current Year */
  | { kind: "current"; granularity: Granularity }
  /** Yesterday / Previous Week / Previous Month / Previous Quarter / Previous Year */
  | { kind: "previous"; granularity: Granularity }
  /** Tomorrow / Next Week / Next Month / Next Quarter / Next Year */
  | { kind: "next"; granularity: Granularity }
  /** Last N days/weeks/months/quarters/years (counts back from today). */
  | { kind: "rolling"; n: number; granularity: Granularity }
  /** Week-/Month-/Quarter-/Year-to-date — start of period to today (inclusive). */
  | { kind: "toDate"; granularity: Exclude<Granularity, "day"> }
  /** No filter; the executor sees an open range. */
  | { kind: "allTime" }
  /** Explicit ISO date range (yyyy-MM-dd). */
  | { kind: "fixed"; start: string; end: string };

/** Resolved by `resolveTimePeriod()` — concrete dates + human label. */
export type ResolvedTimePeriod = {
  /** ISO yyyy-MM-dd (inclusive). Null only for `allTime`. */
  start: string | null;
  end: string | null;
  /** Operator-facing label, e.g. "Current Month", "Last 30 days". */
  label: string;
};

const G_LABEL: Record<Granularity, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

const G_LABEL_PLURAL: Record<Granularity, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  quarter: "quarters",
  year: "years",
};

/** Resolve a `TimePeriod` against `now` (defaults to the system clock). */
export function resolveTimePeriod(
  tp: TimePeriod,
  now: Date = new Date(),
): ResolvedTimePeriod {
  switch (tp.kind) {
    case "allTime":
      return { start: null, end: null, label: "All time" };
    case "fixed":
      return {
        start: tp.start,
        end: tp.end,
        label: `${tp.start} → ${tp.end}`,
      };
    case "current": {
      const { start, end } = boundsFor(now, tp.granularity);
      const label =
        tp.granularity === "day"
          ? "Today"
          : `Current ${G_LABEL[tp.granularity]}`;
      return iso(start, end, label);
    }
    case "previous": {
      const shifted = shift(now, tp.granularity, -1);
      const { start, end } = boundsFor(shifted, tp.granularity);
      const label =
        tp.granularity === "day"
          ? "Yesterday"
          : `Previous ${G_LABEL[tp.granularity]}`;
      return iso(start, end, label);
    }
    case "next": {
      const shifted = shift(now, tp.granularity, +1);
      const { start, end } = boundsFor(shifted, tp.granularity);
      const label =
        tp.granularity === "day" ? "Tomorrow" : `Next ${G_LABEL[tp.granularity]}`;
      return iso(start, end, label);
    }
    case "toDate": {
      const { start } = boundsFor(now, tp.granularity);
      return iso(
        start,
        endOfDay(now),
        `${G_LABEL[tp.granularity]} to date`,
      );
    }
    case "rolling": {
      // "Last N units" — inclusive of today, looking back N units.
      const startBase =
        tp.granularity === "day"
          ? subDays(startOfDay(now), tp.n - 1)
          : shift(startOfPeriod(now, tp.granularity), tp.granularity, -(tp.n - 1));
      return iso(
        startBase,
        endOfDay(now),
        `Last ${tp.n} ${G_LABEL_PLURAL[tp.granularity]}`,
      );
    }
  }
}

function iso(start: Date, end: Date, label: string): ResolvedTimePeriod {
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    label,
  };
}

/** Start/end of the natural period containing `d` for the given granularity. */
function boundsFor(d: Date, g: Granularity): { start: Date; end: Date } {
  switch (g) {
    case "day":
      return { start: startOfDay(d), end: endOfDay(d) };
    case "week":
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(d), end: endOfMonth(d) };
    case "quarter":
      return { start: startOfQuarter(d), end: endOfQuarter(d) };
    case "year":
      return { start: startOfYear(d), end: endOfYear(d) };
  }
}

function startOfPeriod(d: Date, g: Granularity): Date {
  return boundsFor(d, g).start;
}

function shift(d: Date, g: Granularity, n: number): Date {
  switch (g) {
    case "day":
      return addDays(d, n);
    case "week":
      return addWeeks(d, n);
    case "month":
      return addMonths(d, n);
    case "quarter":
      return addQuarters(d, n);
    case "year":
      return addYears(d, n);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Picker preset catalogue
// ─────────────────────────────────────────────────────────────────────────────

export type PickerCategory =
  | "current"
  | "previous"
  | "next"
  | "allTime"
  | "advanced"
  | "fixed";

export const PICKER_CATEGORIES: Array<{ id: PickerCategory; label: string }> = [
  { id: "current", label: "Current" },
  { id: "previous", label: "Previous" },
  { id: "next", label: "Next" },
  { id: "allTime", label: "All time" },
  { id: "advanced", label: "Advanced" },
  { id: "fixed", label: "Fixed" },
];

/** The clickable preset list for each category. */
export const PICKER_PRESETS: Record<
  PickerCategory,
  Array<{ label: string; period: TimePeriod }>
> = {
  current: [
    { label: "Today", period: { kind: "current", granularity: "day" } },
    { label: "Current Week", period: { kind: "current", granularity: "week" } },
    { label: "Current Month", period: { kind: "current", granularity: "month" } },
    { label: "Current Quarter", period: { kind: "current", granularity: "quarter" } },
    { label: "Current Year", period: { kind: "current", granularity: "year" } },
    { label: "Week to date", period: { kind: "toDate", granularity: "week" } },
    { label: "Month to date", period: { kind: "toDate", granularity: "month" } },
    { label: "Quarter to date", period: { kind: "toDate", granularity: "quarter" } },
    { label: "Year to date", period: { kind: "toDate", granularity: "year" } },
  ],
  previous: [
    { label: "Yesterday", period: { kind: "previous", granularity: "day" } },
    { label: "Previous Week", period: { kind: "previous", granularity: "week" } },
    { label: "Previous Month", period: { kind: "previous", granularity: "month" } },
    { label: "Previous Quarter", period: { kind: "previous", granularity: "quarter" } },
    { label: "Previous Year", period: { kind: "previous", granularity: "year" } },
    { label: "Last 7 days", period: { kind: "rolling", n: 7, granularity: "day" } },
    { label: "Last 30 days", period: { kind: "rolling", n: 30, granularity: "day" } },
    { label: "Last 90 days", period: { kind: "rolling", n: 90, granularity: "day" } },
    { label: "Last 12 months", period: { kind: "rolling", n: 12, granularity: "month" } },
  ],
  next: [
    { label: "Tomorrow", period: { kind: "next", granularity: "day" } },
    { label: "Next Week", period: { kind: "next", granularity: "week" } },
    { label: "Next Month", period: { kind: "next", granularity: "month" } },
    { label: "Next Quarter", period: { kind: "next", granularity: "quarter" } },
    { label: "Next Year", period: { kind: "next", granularity: "year" } },
  ],
  allTime: [{ label: "All time", period: { kind: "allTime" } }],
  // Advanced + Fixed are rendered as forms, not preset lists.
  advanced: [],
  fixed: [],
};

/** Best guess at which category a given TimePeriod belongs to. */
export function categoryOf(tp: TimePeriod): PickerCategory {
  if (tp.kind === "fixed") return "fixed";
  if (tp.kind === "allTime") return "allTime";
  if (tp.kind === "rolling") return tp.granularity === "day" ? "previous" : "advanced";
  if (tp.kind === "next") return "next";
  if (tp.kind === "previous") return "previous";
  return "current";
}
