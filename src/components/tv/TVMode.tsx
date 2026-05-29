"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icons } from "@/components/ui/Icon";
import { parseYoutubeId, youtubeEmbedUrl } from "@/lib/tv/slides";
import type { DashboardLayout, Slide } from "@/lib/db/schema";
import type { TvWidgetResult } from "@/app/api/tv/data/route";
import { DEFAULT_SLIDE_APPEARANCE, DEFAULT_BRAND_COLOR } from "@/lib/appearance";
import { SlideBackground } from "@/components/theme/SlideBackground";
import { TVDashboardSlide } from "./TVDashboardSlide";

/**
 * Full-bleed slideshow renderer.
 *
 * Forces dark theme via `data-theme="dark"` on the document root for the
 * duration of the mount, irrespective of the user's app preference — per
 * the brief, TV mode is the canonical dark surface.
 *
 * Auto-advances slides on each slide's `durationSec`. Cursor hides after
 * 3 seconds of inactivity for a clean broadcast look.
 *
 * Phase 4 slice 1: dashboard slides only, demo widget data (SEED) — Phase 3
 * binding hasn't propagated through to TV yet; we render the widget shapes
 * based on the dashboard's layout for visual completeness.
 */
type TvDashboard = {
  id: string;
  name: string;
  layout: DashboardLayout | null;
  /** The dashboard's stored light/dark — applied while its slide plays. */
  theme?: "light" | "dark";
  /** Present only when the API ran widget queries (Phase 4 slice 5+). */
  widgetResults?: Record<string, TvWidgetResult>;
};

export function TVMode({
  slideshow,
  dashboardsById,
}: {
  slideshow: { id: string; name: string; slides: Slide[] };
  dashboardsById: Record<string, TvDashboard>;
}) {
  // TV mode is intentionally chrome-free: no exit button, no top bar,
  // no footer. The screen runs unattended in a sales floor and any
  // visible UI element is either noise (workspace name, clock) or a
  // hazard (accidental click drops broadcast). Just the dashboard,
  // with 24px breathing room — see `.tv-slide` in screens.css.
  // Unpair still happens programmatically (session expiry,
  // server-side revoke) via the TVApp wrapper.
  const [idx, setIdx] = useState(0);

  const slides = slideshow.slides;
  const current = slides[idx];

  // Per-slide activation counter. Chart widgets play their intro
  // animation on mount, but all slides stay mounted for the crossfade
  // (only `.is-active` toggles opacity) — so without help the intros
  // fire once at page load and never again. Bumping a slide's counter
  // each time it becomes active feeds a remount key below, replaying
  // the charts' intros every rotation. Only the incoming slide
  // remounts; the outgoing one keeps its final frame while fading.
  const [activations, setActivations] = useState<Record<string, number>>(
    () => (slides[0] ? { [slides[0].id]: 1 } : {}),
  );
  const prevIdxRef = useRef(idx);
  useEffect(() => {
    if (prevIdxRef.current === idx) return;
    prevIdxRef.current = idx;
    const id = slides[idx]?.id;
    if (!id) return;
    setActivations((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
  }, [idx, slides]);

  // Resolve the active slide's effective appearance:
  //   - theme follows the bound dashboard (dashboard slides); media slides
  //     (youtube / url) fall back to dark.
  //   - background / glass / brand come from the slide's own flair.
  const activeAppearance = current?.appearance ?? DEFAULT_SLIDE_APPEARANCE;
  const activeTheme: "light" | "dark" =
    current?.type === "dashboard"
      ? (dashboardsById[current.dashboardId]?.theme ?? "dark")
      : "dark";

  // Lock scroll for the whole TV mount; capture + restore the document
  // theme so we don't bleed the slideshow's appearance into the app shell
  // when the editor navigates back. The per-slide effect below mutates
  // data-theme / data-glass / --brand as slides advance; this cleanup
  // unwinds all of it on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const prevTheme = html.getAttribute("data-theme");
    // Tell ThemeProvider to back off for the TV mount; otherwise its
    // shell-theme effect can overwrite our per-slide data-theme on a
    // full page load (child effects fire before parent ones).
    html.setAttribute("data-theme-locked", "1");
    document.body.style.overflow = "hidden";
    return () => {
      html.removeAttribute("data-theme-locked");
      if (prevTheme) html.setAttribute("data-theme", prevTheme);
      else html.removeAttribute("data-theme");
      html.removeAttribute("data-glass");
      html.style.removeProperty("--brand");
      html.style.removeProperty("--primary");
      document.body.style.overflow = "";
    };
  }, []);

  // Apply the active slide's theme + flair to <html> as slides advance.
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", activeTheme);
    if (activeAppearance.glassCards) html.setAttribute("data-glass", "on");
    else html.removeAttribute("data-glass");
    if (activeAppearance.brandColor !== DEFAULT_BRAND_COLOR) {
      html.style.setProperty("--brand", activeAppearance.brandColor);
      html.style.setProperty("--primary", activeAppearance.brandColor);
    } else {
      html.style.removeProperty("--brand");
      html.style.removeProperty("--primary");
    }
  }, [activeTheme, activeAppearance.glassCards, activeAppearance.brandColor]);

  // Slide auto-advance.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(
      () => setIdx((i) => (i + 1) % Math.max(1, slides.length)),
      current.durationSec * 1000,
    );
    return () => clearTimeout(t);
  }, [current, slides.length]);

  // Cursor-hide after idle.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const reset = () => {
      document.body.style.cursor = "";
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        document.body.style.cursor = "none";
      }, 3000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    return () => {
      if (t) clearTimeout(t);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", reset);
    };
  }, []);

  if (slides.length === 0) {
    return (
      <div className="tv-root">
        <div className="tv-glow" />
        <div
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            height: "100%",
            padding: 48,
            textAlign: "center",
          }}
        >
          <div>
            <Icons.Slideshow size={48} />
            <h1
              className="t-h1"
              style={{ marginTop: 14, color: "var(--text-primary)" }}
            >
              No slides yet
            </h1>
            <p
              className="t-body"
              style={{ marginTop: 8, color: "var(--text-tertiary)" }}
            >
              Add a slide on the editor and reopen this TV page.
            </p>
            <Link
              href={`/slideshows/${slideshow.id}/edit`}
              className="btn btn-primary"
              style={{ marginTop: 18 }}
            >
              <Icons.Slideshow size={14} /> Open editor
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-root">
      <div className="tv-glow" />
      <SlideBackground effect={activeAppearance.background} />

      <TVBeam
        key={`${current.id}-${idx}-${current.durationSec}`}
        durationSec={current.durationSec}
      />

      {/* Slide stage. YouTube + URL slides skip the padded `.tv-paired`
          chrome via `.tv-slide-fullbleed` so the iframe runs edge-to-edge.
          Previously this was paired with a bottom chrome (slide-dots +
          "Slide N of M"), but TV mode is supposed to be broadcast-clean
          — operators read the visual content, not navigation aids — so
          the footer is gone. Reclaiming that ~80px of vertical space
          also gives every widget on the dashboard slide more cqh to
          breathe (see `.tv-slide { inset: 72px 0 24px }` in
          screens.css). */}
      <div className="tv-stage">
        {slides.map((s, i) => {
          const fullbleed = s.type === "youtube" || s.type === "url";
          const active = i === idx;
          // Remount dashboard content each activation so chart intros
          // replay; media slides keep a stable key (no intro to replay,
          // and remounting an iframe would reload the video).
          const contentKey =
            s.type === "dashboard" ? `${s.id}::${activations[s.id] ?? 0}` : s.id;
          return (
            <div
              key={s.id}
              data-transition={s.transition}
              className={`${fullbleed ? "tv-slide-fullbleed" : "tv-slide"} ${active ? "is-active" : ""}`}
            >
              <SlideContent
                key={contentKey}
                slide={s}
                dashboard={
                  s.type === "dashboard" ? dashboardsById[s.dashboardId] : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Center the 3px progress stroke 1.5px in from the SVG edge: its outer half
// lands exactly on the viewport boundary, without an inset-frame margin.
const BEAM_INSET = 1.5;
const BEAM_RADIUS = 18;

/**
 * Renders a timed progress stroke in viewport pixel coordinates, keeping the
 * rounded perimeter and fill timing accurate at every aspect ratio.
 */
function TVBeam({ durationSec }: { durationSec: number }) {
  const [viewport, setViewport] = useState<{ width: number; height: number }>();

  useEffect(() => {
    const measure = () => {
      const next = {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      };
      setViewport((prev) =>
        prev?.width === next.width && prev.height === next.height ? prev : next,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!viewport) return null;

  const width = Math.max(1, viewport.width - BEAM_INSET * 2);
  const height = Math.max(1, viewport.height - BEAM_INSET * 2);
  const radius = Math.min(BEAM_RADIUS, width / 2, height / 2);
  const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const beamStyle = {
    "--tv-beam-duration": `${Math.max(1, durationSec)}s`,
    "--tv-beam-perimeter": `${perimeter}px`,
  } as CSSProperties;

  return (
    <svg
      className="tv-beam"
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden="true"
      style={beamStyle}
    >
      <rect
        className="tv-beam-rail"
        x={BEAM_INSET}
        y={BEAM_INSET}
        width={width}
        height={height}
        rx={radius}
      />
      <rect
        className="tv-beam-progress-glow"
        x={BEAM_INSET}
        y={BEAM_INSET}
        width={width}
        height={height}
        rx={radius}
        strokeDasharray={`${perimeter} ${perimeter}`}
      />
      <rect
        className="tv-beam-progress"
        x={BEAM_INSET}
        y={BEAM_INSET}
        width={width}
        height={height}
        rx={radius}
        strokeDasharray={`${perimeter} ${perimeter}`}
      />
    </svg>
  );
}

/** Renders the inside of a single slide based on its type. */
function SlideContent({
  slide,
  dashboard,
}: {
  slide: Slide;
  dashboard?: TvDashboard;
}) {
  if (slide.type === "dashboard") {
    if (!dashboard) {
      return (
        <div
          className="tv-layout-gauge"
          style={{ display: "grid", placeItems: "center" }}
        >
          <p
            className="t-body"
            style={{ color: "var(--text-tertiary)", textAlign: "center" }}
          >
            This slide references a dashboard that no longer exists.
          </p>
        </div>
      );
    }
    return (
      <TVDashboardSlide
        dashboard={{
          id: dashboard.id,
          name: dashboard.name,
          layout: dashboard.layout,
          widgetResults: dashboard.widgetResults ?? {},
        }}
      />
    );
  }
  if (slide.type === "youtube") return <YouTubeSlide url={slide.url} />;
  if (slide.type === "url") return <UrlSlide url={slide.url} />;
  return null;
}

function YouTubeSlide({ url }: { url: string }) {
  const videoId = parseYoutubeId(url);
  if (!videoId) {
    return (
      <div
        className="tv-layout-gauge"
        style={{ display: "grid", placeItems: "center" }}
      >
        <p
          className="t-body"
          style={{ color: "var(--text-tertiary)", textAlign: "center" }}
        >
          Couldn&rsquo;t resolve a YouTube video from{" "}
          <span className="t-mono">{url}</span>
        </p>
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#000",
        borderRadius: "var(--radius-2xl)",
        overflow: "hidden",
      }}
    >
      <iframe
        title="YouTube slide"
        src={youtubeEmbedUrl(videoId)}
        allow="autoplay; encrypted-media; picture-in-picture"
        // YouTube serves an `X-Frame-Options: SAMEORIGIN` for /watch but
        // /embed/ is intentionally embeddable. No fallback needed.
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
        }}
      />
    </div>
  );
}

/**
 * Web URL slide.
 *
 * We just render the iframe — no client-side "blocked" detection. A
 * load-timeout heuristic gave too many false positives (sites that simply
 * loaded slowly were marked blocked). If a URL truly can't be embedded
 * (`X-Frame-Options: DENY` / `CSP: frame-ancestors`), the browser will
 * show its native blocked-frame UI and the operator can pick a different
 * URL from the slideshow editor. A future iteration can add a server-side
 * HEAD preflight to surface that warning at edit time instead of at play
 * time.
 */
function UrlSlide({ url }: { url: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg)",
        borderRadius: "var(--radius-2xl)",
        overflow: "hidden",
      }}
    >
      <iframe
        title="Web URL slide"
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </div>
  );
}
