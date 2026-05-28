"use client";

import { useEffect, useState, useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import { setDashboardTheme } from "@/lib/dashboards";
import type { DashboardTheme } from "@/lib/appearance";

/**
 * Per-dashboard light/dark control.
 *
 * Two jobs in one mount:
 *   1. Applies the dashboard's theme to `<html data-theme>` for as long as
 *      this dashboard is on screen, restoring the previous value on
 *      unmount (navigating away). This is what makes a dashboard "carry"
 *      its own light/dark, overriding the app-shell default while viewing.
 *   2. Renders a Sun/Moon toggle that persists the choice via the
 *      `setDashboardTheme` server action. Hidden for non-editors — they
 *      still get the applied theme, just no toggle.
 */
export function DashboardThemeControl({
  dashboardId,
  initialTheme,
  editable,
}: {
  dashboardId: string;
  initialTheme: DashboardTheme;
  editable: boolean;
}) {
  const [theme, setTheme] = useState<DashboardTheme>(initialTheme);
  const [pending, startTransition] = useTransition();

  // Drive <html data-theme> off the local theme; restore on unmount.
  // The `data-theme-locked` flag tells ThemeProvider to back off so its
  // shell-theme effect doesn't overwrite our value on a full page load.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute("data-theme");
    html.setAttribute("data-theme", theme);
    html.setAttribute("data-theme-locked", "1");
    return () => {
      html.removeAttribute("data-theme-locked");
      if (prev) html.setAttribute("data-theme", prev);
      else html.removeAttribute("data-theme");
    };
  }, [theme]);

  if (!editable) return null;

  const next: DashboardTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      aria-label={`Switch to ${next} mode`}
      title={`Theme: ${theme} — switch to ${next}`}
      disabled={pending}
      onClick={() => {
        setTheme(next);
        startTransition(async () => {
          await setDashboardTheme(dashboardId, next);
        });
      }}
    >
      {theme === "dark" ? <Icons.Moon size={16} /> : <Icons.Sun size={16} />}
    </button>
  );
}
