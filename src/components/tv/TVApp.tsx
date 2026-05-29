"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TVMode } from "./TVMode";
import { TVUnpaired } from "./TVUnpaired";
import type { DashboardLayout, Slide } from "@/lib/db/schema";
import type { TvWidgetResult } from "@/app/api/tv/data/route";

/**
 * Top-level client for `/tv/[id]`. Holds the auth state machine:
 *
 *   loading  → "checking"  (boot, check localStorage)
 *   paired   → fetch /api/tv/data and render <TVMode>
 *   unpaired → render <TVUnpaired> (mints token, polls for confirmation)
 *
 * Once paired, refreshes the data every 60s so the TV picks up new sync
 * results without manual interaction. On top of that it polls a cheap
 * `/api/tv/version` revision every 10s and refetches immediately when an
 * editor changes the slides or a bound dashboard — so edits reach the
 * screen in seconds rather than waiting on the slow data refresh.
 */
export type TvDataResponse = {
  slideshow: { id: string; name: string; slides: Slide[] };
  dashboardsById: Record<
    string,
    {
      id: string;
      name: string;
      layout: DashboardLayout | null;
      widgetResults: Record<string, TvWidgetResult>;
    }
  >;
  workspaceName: string;
  /** Max `updatedAt` across the slideshow + its dashboards (epoch ms). */
  rev: number;
};

// Full data refetch cadence — keeps widget numbers fresh as the sync
// engine updates mirror tables (those changes don't bump `updatedAt`, so
// the version poll alone wouldn't catch them).
const REFRESH_INTERVAL_MS = 60_000;
// Cheap revision poll — detects editor changes to slides / dashboards.
const VERSION_POLL_MS = 10_000;
const STORAGE_KEY = (slideshowId: string) =>
  `atlas:tv-session:${slideshowId}`;

export function TVApp({ slideshowId }: { slideshowId: string }) {
  const [state, setState] = useState<
    | { kind: "checking" }
    | { kind: "unpaired" }
    | { kind: "paired"; data: TvDataResponse }
    | { kind: "error"; message: string }
  >({ kind: "checking" });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last revision we've rendered. Seeded from every successful data load so
  // the version poll only triggers a refetch when an edit lands afterward.
  const lastRevRef = useRef<number | null>(null);

  const tryWithToken = useCallback(
    async (token: string, silent = false) => {
      try {
        const res = await fetch(
          `/api/tv/data?token=${encodeURIComponent(token)}&slideshowId=${encodeURIComponent(slideshowId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          localStorage.removeItem(STORAGE_KEY(slideshowId));
          setState({ kind: "unpaired" });
          return;
        }
        const data = (await res.json()) as TvDataResponse;
        lastRevRef.current = data.rev;
        setState({ kind: "paired", data });
      } catch (err) {
        // A failed background refresh shouldn't blow up the current view.
        if (silent) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [slideshowId],
  );

  // Boot: do we already have a session for this slideshow?
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY(slideshowId));
    if (stored) tryWithToken(stored);
    else setState({ kind: "unpaired" });
  }, [slideshowId, tryWithToken]);

  // Periodic refresh once paired — keeps numbers fresh as the sync engine
  // updates mirror tables.
  useEffect(() => {
    if (state.kind !== "paired") return;
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      const token = localStorage.getItem(STORAGE_KEY(slideshowId));
      if (token) tryWithToken(token, /* silent */ true);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [state.kind, slideshowId, tryWithToken]);

  // Fast revision poll — an editor saving slides or a bound dashboard bumps
  // the slideshow/dashboard `updatedAt`, which lifts `rev`. When we see a
  // higher rev than the one we rendered, pull the full payload silently
  // (soft in-place swap — no page reload, so no black flash on the TV).
  useEffect(() => {
    if (state.kind !== "paired") return;
    const id = setInterval(async () => {
      const token = localStorage.getItem(STORAGE_KEY(slideshowId));
      if (!token) return;
      try {
        const res = await fetch(
          `/api/tv/version?token=${encodeURIComponent(token)}&slideshowId=${encodeURIComponent(slideshowId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const { rev } = (await res.json()) as { rev: number };
        if (lastRevRef.current !== null && rev > lastRevRef.current) {
          // tryWithToken updates lastRevRef on success, closing the trigger.
          tryWithToken(token, /* silent */ true);
        }
      } catch {
        // Soft — try again next tick.
      }
    }, VERSION_POLL_MS);
    return () => clearInterval(id);
  }, [state.kind, slideshowId, tryWithToken]);

  const onPaired = useCallback(
    (sessionToken: string) => {
      localStorage.setItem(STORAGE_KEY(slideshowId), sessionToken);
      setState({ kind: "checking" });
      tryWithToken(sessionToken);
    },
    [slideshowId, tryWithToken],
  );

  if (state.kind === "checking") {
    return <BootSplash />;
  }

  if (state.kind === "error") {
    return (
      <div className="tv-root">
        <div className="tv-glow" />
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            padding: 64,
          }}
        >
          <p className="t-body" style={{ color: "var(--danger)" }}>
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "unpaired") {
    return <TVUnpaired slideshowId={slideshowId} onPaired={onPaired} />;
  }

  return (
    <TVMode
      slideshow={state.data.slideshow}
      dashboardsById={state.data.dashboardsById}
    />
  );
}

function BootSplash() {
  // Forces dark even before TVMode mounts (which is when the theme attr
  // gets set). Otherwise a fresh load briefly flashes the light surface
  // on a TV expecting a dark backdrop.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "dark");
    return () => {
      if (prev) html.setAttribute("data-theme", prev);
      else html.removeAttribute("data-theme");
    };
  }, []);
  return (
    <div className="tv-root">
      <div className="tv-glow" />
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <p className="t-small" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      </div>
    </div>
  );
}
