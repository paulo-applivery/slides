"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icons } from "@/components/ui/Icon";
import {
  addDashboardSlide,
  addUrlSlide,
  addYoutubeSlide,
  moveSlide,
  removeSlide,
  requestTvRefresh,
  updateSlide,
  updateSlideAppearance,
  updateSlideshowTheme,
  updateSlideUrl,
} from "@/lib/slideshows";
import type { DashboardLayout, Slide, SlideTransition } from "@/lib/db/schema";
import {
  DEFAULT_SLIDE_APPEARANCE,
  type BackgroundEffect,
  type SlideshowTheme,
} from "@/lib/appearance";
import { toast } from "@/lib/toast";

/**
 * Run a void-returning server action, surfacing any throw as an error
 * toast. Used for the editor's frequent slide tweaks (move / duration /
 * transition / appearance) where a silent failure would otherwise leave
 * the UI looking stuck.
 */
async function guard(fn: () => Promise<void>, errorTitle: string) {
  try {
    await fn();
  } catch (err) {
    toast.error({
      title: errorTitle,
      description: err instanceof Error ? err.message : undefined,
    });
  }
}

/**
 * Two-pane editor.
 *
 *   Left  → ordered slide list + "add slide" picker (modal). Reorder via
 *           up/down (drag in slice 2 with @dnd-kit).
 *   Right → preview thumbnail + per-slide config (duration stepper +
 *           transition segmented).
 *
 * All mutations go through server actions; `useTransition` keeps the UI
 * responsive while they fly.
 */

const TRANSITIONS: SlideTransition[] = ["crossfade", "slide", "cut"];

/**
 * Dashboard reference passed to the editor. Carries `layout` so we can
 * render a wireframe thumbnail of the widget grid, and `theme` so the
 * thumbnail's backdrop matches how the dashboard will actually appear.
 */
export type DashboardRef = {
  id: string;
  name: string;
  layout: DashboardLayout | null;
  theme: "light" | "dark";
};

export function SlideshowEditor({
  slideshowId,
  initialSlides,
  initialTheme,
  dashboards,
  tvHost,
}: {
  slideshowId: string;
  initialSlides: Slide[];
  /** Slideshow-wide TV theme override (auto / light / dark). */
  initialTheme: SlideshowTheme;
  dashboards: DashboardRef[];
  /** Request host for the advertised TV URL (e.g. "localhost:3000"). */
  tvHost: string;
}) {
  // Derive directly from the prop — every mutation goes through a server
  // action that calls `revalidatePath`, which re-renders the page server
  // component and streams fresh `initialSlides` down. Freezing them in
  // `useState` would make the editor immutable after the first render.
  const slides = initialSlides;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSlides[0]?.id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = slides.find((s) => s.id === selectedId) ?? slides[0];
  const totalSec = slides.reduce((a, s) => a + s.durationSec, 0);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  return (
    <div className="main slideshow-main">
      <div className="ss-grid">
        {/* Left — slide list */}
        <div className="ss-left">
          <div className="ss-left-head">
            <div>
              <div className="t-micro">Sequence</div>
              <div className="ss-left-title">
                {slides.length} slides ·{" "}
                <span className="t-mono">
                  {minutes}:{String(seconds).padStart(2, "0")}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPickerOpen(true)}
            >
              <Icons.Plus size={14} /> Add slide
            </button>
          </div>

          <SlideshowThemeControl
            slideshowId={slideshowId}
            initialTheme={initialTheme}
          />

          <div className="ss-list">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`ss-slide ${selectedId === s.id ? "active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="ss-slide-handle">
                  <Icons.Drag size={14} />
                </span>
                <span className="ss-slide-num t-mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="ss-slide-thumb"
                  style={{
                    background: `linear-gradient(135deg, ${typeAccent(s.type)}33, transparent)`,
                    overflow: "hidden",
                  }}
                >
                  {s.type === "dashboard" ? (
                    <DashboardMiniPreview
                      dashboard={dashboards.find(
                        (d) => d.id === s.dashboardId,
                      )}
                      compact
                    />
                  ) : s.type === "youtube" ? (
                    <Icons.Youtube size={20} style={{ color: "#FF0033" }} />
                  ) : (
                    <Icons.Globe size={20} style={{ color: "var(--success)" }} />
                  )}
                </span>
                <span className="ss-slide-meta">
                  <span className="ss-slide-name">
                    {slideLabel(s, dashboards)}
                  </span>
                  <span className="ss-slide-sub">
                    {humanType(s.type)} · {s.transition}
                  </span>
                </span>
                <span className="ss-slide-dur t-mono">{s.durationSec}s</span>
              </button>
            ))}
            {slides.length === 0 && (
              <button
                type="button"
                className="ss-slide-add"
                onClick={() => setPickerOpen(true)}
              >
                <Icons.Plus size={14} /> Add your first slide
              </button>
            )}
          </div>
        </div>

        {/* Right — preview + config */}
        <div className="ss-right">
          {selected ? (
            <>
              <div className="ss-preview-head">
                <div>
                  <div className="t-micro">
                    Preview · slide{" "}
                    {slides.findIndex((s) => s.id === selected.id) + 1} of {slides.length}
                  </div>
                  <div className="ss-preview-title">
                    {slideLabel(selected, dashboards)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={pending || slides[0].id === selected.id}
                    onClick={() => {
                      startTransition(() =>
                        guard(
                          () => moveSlide(slideshowId, selected.id, "up"),
                          "Couldn't reorder slide",
                        ),
                      );
                    }}
                  >
                    <Icons.ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={
                      pending || slides[slides.length - 1].id === selected.id
                    }
                    onClick={() => {
                      startTransition(() =>
                        guard(
                          () => moveSlide(slideshowId, selected.id, "down"),
                          "Couldn't reorder slide",
                        ),
                      );
                    }}
                  >
                    <Icons.ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("Remove this slide?")) return;
                      startTransition(async () => {
                        try {
                          await removeSlide(slideshowId, selected.id);
                          toast.success({ title: "Slide removed" });
                        } catch (err) {
                          toast.error({
                            title: "Couldn't remove slide",
                            description: err instanceof Error ? err.message : undefined,
                          });
                        }
                      });
                    }}
                    style={{ color: "var(--danger)" }}
                  >
                    <Icons.Close size={12} /> Remove
                  </button>
                </div>
              </div>

              <div className="ss-preview">
                <SlideThumb slide={selected} dashboards={dashboards} />
              </div>

              <div className="ss-config">
                {(selected.type === "youtube" || selected.type === "url") && (
                  <UrlField
                    key={selected.id}
                    slideshowId={slideshowId}
                    slideId={selected.id}
                    initial={selected.url}
                    kind={selected.type}
                  />
                )}
                <div className="ss-config-grid">
                  <div className="ss-config-row">
                    <label className="ss-config-label">Display duration</label>
                    <div className="ss-stepper">
                      <input
                        className="ss-input ss-input-mono"
                        value={`${selected.durationSec}s`}
                        readOnly
                      />
                      <div className="ss-stepper-btns">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(() =>
                              guard(
                                () =>
                                  updateSlide(slideshowId, selected.id, {
                                    durationSec: Math.max(5, selected.durationSec - 5),
                                  }),
                                "Couldn't update duration",
                              ),
                            );
                          }}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(() =>
                              guard(
                                () =>
                                  updateSlide(slideshowId, selected.id, {
                                    durationSec: selected.durationSec + 5,
                                  }),
                                "Couldn't update duration",
                              ),
                            );
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="ss-config-row">
                    <label className="ss-config-label">Transition</label>
                    <div className="ss-segmented">
                      {TRANSITIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`ss-seg ${selected.transition === t ? "active" : ""}`}
                          disabled={pending}
                          onClick={() => {
                            startTransition(() =>
                              guard(
                                () =>
                                  updateSlide(slideshowId, selected.id, {
                                    transition: t,
                                  }),
                                "Couldn't update transition",
                              ),
                            );
                          }}
                        >
                          {t === "crossfade"
                            ? "Crossfade"
                            : t === "slide"
                              ? "Slide"
                              : "Cut"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <SlideAppearanceControls
                  key={selected.id}
                  slideshowId={slideshowId}
                  slide={selected}
                />
                <RefreshTvsButton slideshowId={slideshowId} />
                <div className="ss-config-meta">
                  <span className="t-small">
                    <Icons.Wifi size={13} /> Auto-loops indefinitely
                  </span>
                  <span className="t-small">
                    TV URL ·{" "}
                    <code className="t-mono ss-url">
                      {tvHost}/t/{slideshowId.slice(0, 8)}
                    </code>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                padding: 64,
                color: "var(--text-tertiary)",
                textAlign: "center",
              }}
            >
              <Icons.Slideshow size={40} />
              <h3 className="t-h3" style={{ marginTop: 12 }}>
                No slides yet
              </h3>
              <p className="t-body" style={{ maxWidth: 360, margin: "8px 0 18px" }}>
                Add a dashboard slide to start building your TV loop.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPickerOpen(true)}
              >
                <Icons.Plus size={14} /> Add slide
              </button>
            </div>
          )}
        </div>
      </div>

      <AddSlideDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        slideshowId={slideshowId}
        dashboards={dashboards}
      />
    </div>
  );
}

const BG_OPTIONS: Array<{ value: BackgroundEffect; label: string }> = [
  { value: null, label: "None" },
  { value: "pixelBlast", label: "Pixel Blast" },
  { value: "softAurora", label: "Soft Aurora" },
  { value: "iridescence", label: "Iridescence" },
];

/**
 * Slideshow-wide TV theme override (Auto / Light / Dark).
 *
 * "Auto" keeps each slide's own theme (dashboard slides follow their bound
 * dashboard, media slides stay dark) — the original behavior. Light/Dark
 * force that theme across every slide on TV. Commits through
 * `updateSlideshowTheme`, which bumps the slideshow's `updatedAt` so live
 * screens pick the change up on their next version poll.
 */
const SLIDESHOW_THEME_OPTIONS: { v: SlideshowTheme; label: string }[] = [
  { v: "auto", label: "Auto" },
  { v: "light", label: "Light" },
  { v: "dark", label: "Dark" },
];

function SlideshowThemeControl({
  slideshowId,
  initialTheme,
}: {
  slideshowId: string;
  initialTheme: SlideshowTheme;
}) {
  // Optimistic local value so the segmented control reflects the click
  // instantly; the server action revalidates the page behind it.
  const [theme, setTheme] = useState<SlideshowTheme>(initialTheme);
  const [pending, startTransition] = useTransition();
  return (
    <div className="ss-theme-control">
      <span className="t-micro">TV theme</span>
      <div className="ss-segmented">
        {SLIDESHOW_THEME_OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            className={`ss-seg ${theme === o.v ? "active" : ""}`}
            disabled={pending}
            onClick={() => {
              setTheme(o.v);
              startTransition(() =>
                guard(
                  () => updateSlideshowTheme(slideshowId, o.v),
                  "Couldn't update theme",
                ),
              );
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Manual "push refresh to live TVs" control.
 *
 * Edits already reach screens within ~10s via the version poll, but this
 * button forces it instantly: `requestTvRefresh` bumps the slideshow's
 * `updatedAt`, which every polling TV (anonymous + signed-in preview) sees
 * on its next tick and acts on. The returned screen count is surfaced in a
 * toast so the operator knows how many paired TVs were nudged.
 */
function RefreshTvsButton({ slideshowId }: { slideshowId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await requestTvRefresh(slideshowId);
          if (res.ok) {
            toast.success({
              title: "Refresh sent",
              description:
                res.screens === 1
                  ? "1 paired screen will update shortly."
                  : `${res.screens} paired screens will update shortly.`,
            });
          } else {
            toast.error({ title: "Couldn't refresh TVs", description: res.error });
          }
        });
      }}
    >
      <Icons.Refresh size={14} /> {pending ? "Sending…" : "Refresh TVs"}
    </button>
  );
}

/**
 * Per-slide visual flair — background effect, glass cards, brand color.
 * Each control commits through `updateSlideAppearance`. These apply only
 * during TV playback (the editor preview is a static placeholder). The
 * parent re-keys this on slide change so the brand-color text input resets.
 */
function SlideAppearanceControls({
  slideshowId,
  slide,
}: {
  slideshowId: string;
  slide: Slide;
}) {
  const appearance = slide.appearance ?? DEFAULT_SLIDE_APPEARANCE;
  const [brand, setBrand] = useState(appearance.brandColor);
  const [pending, startTransition] = useTransition();

  function commit(patch: Parameters<typeof updateSlideAppearance>[2]) {
    startTransition(() =>
      guard(
        () => updateSlideAppearance(slideshowId, slide.id, patch),
        "Couldn't update appearance",
      ),
    );
  }

  return (
    <div className="ss-config-grid" style={{ marginTop: 12 }}>
      <div className="ss-config-row">
        <label className="ss-config-label">Background effect</label>
        <div className="ss-segmented">
          {BG_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              className={`ss-seg ${appearance.background === o.value ? "active" : ""}`}
              disabled={pending}
              onClick={() => commit({ background: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-config-row">
        <label className="ss-config-label">Glass cards</label>
        <div className="ss-segmented">
          {[
            { v: false, label: "Off" },
            { v: true, label: "On" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              className={`ss-seg ${appearance.glassCards === o.v ? "active" : ""}`}
              disabled={pending}
              onClick={() => commit({ glassCards: o.v })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-config-row">
        <label className="ss-config-label">Progress bar</label>
        <div className="ss-segmented">
          {[
            { v: false, label: "Off" },
            { v: true, label: "On" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              className={`ss-seg ${(appearance.showProgress !== false) === o.v ? "active" : ""}`}
              disabled={pending}
              onClick={() => commit({ showProgress: o.v })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-config-row">
        <label className="ss-config-label">Brand color</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={brand}
            disabled={pending}
            onChange={(e) => {
              setBrand(e.target.value);
              commit({ brandColor: e.target.value });
            }}
            style={{
              width: 36,
              height: 36,
              padding: 0,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "transparent",
              cursor: "pointer",
            }}
          />
          <input
            className="ss-input ss-input-mono"
            value={brand}
            disabled={pending}
            onChange={(e) => setBrand(e.target.value)}
            onBlur={() => {
              if (/^#[0-9a-fA-F]{6}$/.test(brand)) commit({ brandColor: brand });
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

function slideLabel(slide: Slide, dashboards: DashboardRef[]) {
  if (slide.type === "dashboard") {
    return (
      dashboards.find((d) => d.id === slide.dashboardId)?.name ??
      "Untitled dashboard"
    );
  }
  if (slide.type === "youtube") return slide.url || "YouTube video";
  return slide.url || "Web URL";
}

function humanType(t: Slide["type"]): string {
  return t === "dashboard" ? "Dashboard" : t === "youtube" ? "YouTube" : "Web URL";
}

function typeAccent(t: Slide["type"]): string {
  return t === "dashboard"
    ? "var(--primary)"
    : t === "youtube"
      ? "#FF0033"
      : "var(--success)";
}

function SlideThumb({
  slide,
  dashboards,
}: {
  slide: Slide;
  dashboards: DashboardRef[];
}) {
  // Dashboard slides get a full wireframe of their widget grid so the
  // operator recognises *which* board this slide shows at a glance.
  if (slide.type === "dashboard") {
    const dashboard = dashboards.find((d) => d.id === slide.dashboardId);
    return (
      <div className="prev-shell">
        <div className="prev-dash-meta">
          <span className="t-micro">{humanType(slide.type)}</span>
          <span className="t-micro" style={{ color: "var(--success)" }}>
            ● LIVE
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
          <DashboardMiniPreview dashboard={dashboard} />
        </div>
      </div>
    );
  }

  return (
    <div className="prev-shell">
      <div className="prev-dash-meta">
        <span className="t-micro">{humanType(slide.type)}</span>
        <span className="t-micro" style={{ color: "var(--success)" }}>
          ● LIVE
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          color: "var(--text-tertiary)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          {slide.type === "youtube" ? (
            <>
              <Icons.Youtube size={36} style={{ color: "#FF0033" }} />
              <div className="t-small" style={{ marginTop: 8 }}>
                YouTube embed · autoplays muted on the TV
              </div>
              <div
                className="t-mono"
                style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}
              >
                {slide.url}
              </div>
            </>
          ) : (
            <>
              <Icons.Globe size={36} style={{ color: "var(--success)" }} />
              <div className="t-small" style={{ marginTop: 8 }}>
                Web URL embed · falls back to a card if the site blocks
                iframing
              </div>
              <div
                className="t-mono"
                style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}
              >
                {slide.url}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-widget-type accent for the wireframe tiles. Kept distinct enough
 * that an operator can tell a gauge board from a funnel board at thumb
 * size without reading any labels.
 */
const WIDGET_TINT: Record<DashboardLayout["widgets"][number]["type"], string> = {
  gauge: "var(--primary)",
  bar: "#22C55E",
  funnel: "#8B5CF6",
  ranking: "#F59E0B",
  singleValue: "#0EA5E9",
  text: "var(--text-tertiary)",
  image: "#14B8A6",
};

/**
 * Wireframe thumbnail of a dashboard's widget grid. Renders each widget
 * as a tinted tile positioned in a 12-column grid (the same column count
 * the real canvas uses), normalised so the whole layout fits a 16:9 box.
 * No queries run — it's a structural preview, so it's cheap enough to
 * render once per slide in the list plus the large preview pane.
 */
function DashboardMiniPreview({
  dashboard,
  compact = false,
}: {
  dashboard: DashboardRef | undefined;
  compact?: boolean;
}) {
  const widgets = dashboard?.layout?.widgets ?? [];
  const isLight = dashboard?.theme === "light";
  const surface = isLight ? "#F4F6FB" : "#0B1020";

  // Missing dashboard (deleted after the slide was added) or an empty
  // board → fall back to the plain dashboard glyph rather than an empty
  // rectangle, so the slide still reads as "a dashboard".
  if (!dashboard || widgets.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: compact ? undefined : 120,
          borderRadius: compact ? 6 : 12,
          background: surface,
          display: "grid",
          placeItems: "center",
          color: "var(--text-tertiary)",
        }}
      >
        <Icons.Dashboard size={compact ? 18 : 32} />
      </div>
    );
  }

  const COLS = 12;
  const rows = Math.max(
    1,
    ...widgets.map((w) => w.pos.y + Math.max(1, w.pos.h)),
  );
  // Tile inset (as a % of a cell) so adjacent widgets read as separate
  // cards. Smaller in compact mode where every pixel counts.
  const gap = compact ? 3 : 5;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        aspectRatio: compact ? undefined : "16 / 9",
        borderRadius: compact ? 6 : 12,
        background: surface,
        overflow: "hidden",
      }}
    >
      {widgets.map((w) => {
        const tint = WIDGET_TINT[w.type] ?? "var(--primary)";
        const cw = Math.max(1, w.pos.w);
        const ch = Math.max(1, w.pos.h);
        return (
          <div
            key={w.id}
            title={humanWidgetType(w.type)}
            style={{
              position: "absolute",
              left: `calc(${(w.pos.x / COLS) * 100}% + ${gap}px)`,
              top: `calc(${(w.pos.y / rows) * 100}% + ${gap}px)`,
              width: `calc(${(cw / COLS) * 100}% - ${gap * 2}px)`,
              height: `calc(${(ch / rows) * 100}% - ${gap * 2}px)`,
              borderRadius: compact ? 2 : 4,
              background: `color-mix(in srgb, ${tint} 26%, ${surface})`,
              border: `1px solid color-mix(in srgb, ${tint} 55%, transparent)`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

function humanWidgetType(
  t: DashboardLayout["widgets"][number]["type"],
): string {
  return t === "singleValue"
    ? "Single value"
    : t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * URL field used by YouTube + URL slides. Validates on blur via the
 * `updateSlideUrl` server action and surfaces errors inline.
 */
function UrlField({
  slideshowId,
  slideId,
  initial,
  kind,
}: {
  slideshowId: string;
  slideId: string;
  initial: string;
  kind: "youtube" | "url";
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    if (value === initial) return;
    setError(null);
    startTransition(async () => {
      const res = await updateSlideUrl(slideshowId, slideId, value);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="ss-config-row" style={{ marginBottom: 4 }}>
      <label className="ss-config-label">
        {kind === "youtube" ? "YouTube URL" : "Web URL"}
      </label>
      <input
        className="ss-input ss-input-mono"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={
          kind === "youtube"
            ? "https://youtu.be/… or https://www.youtube.com/watch?v=…"
            : "https://…"
        }
        spellCheck={false}
        disabled={pending}
      />
      {error && (
        <p
          className="t-small"
          style={{ color: "var(--danger)", marginTop: 6, marginBottom: 0 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

type SlideKind = "dashboard" | "youtube" | "url";

function AddSlideDialog({
  open,
  onOpenChange,
  slideshowId,
  dashboards,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slideshowId: string;
  dashboards: DashboardRef[];
}) {
  const [kind, setKind] = useState<SlideKind>("dashboard");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reset() {
    setKind("dashboard");
    setUrlValue("");
    setUrlError(null);
    setPendingKey(null);
  }

  function pickDashboard(dashboardId: string) {
    setPendingKey(dashboardId);
    startTransition(async () => {
      try {
        await addDashboardSlide(slideshowId, dashboardId);
        toast.success({ title: "Slide added" });
        reset();
        onOpenChange(false);
      } catch (err) {
        setPendingKey(null);
        toast.error({
          title: "Couldn't add slide",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function submitUrl() {
    setUrlError(null);
    setPendingKey("__url");
    startTransition(async () => {
      const res =
        kind === "youtube"
          ? await addYoutubeSlide(slideshowId, urlValue)
          : await addUrlSlide(slideshowId, urlValue);
      if (!res.ok) {
        setUrlError(res.error);
        setPendingKey(null);
        return;
      }
      toast.success({ title: "Slide added" });
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(1, 2, 88, 0.32)",
            backdropFilter: "blur(2px)",
            zIndex: 50,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(620px, 96vw)",
            maxHeight: "86vh",
            overflow: "auto",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            boxShadow: "var(--shadow-lg)",
            padding: 24,
            zIndex: 51,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div>
              <Dialog.Title asChild>
                <div className="t-h3">Add a slide</div>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p
                  className="t-small"
                  style={{ margin: 0, color: "var(--text-tertiary)" }}
                >
                  Dashboards show live revenue; YouTube and URL slides display
                  any embeddable content full-screen.
                </p>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="widget-iconbtn"
                aria-label="Close"
                style={{ width: 32, height: 32 }}
              >
                <Icons.Close size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Type selector */}
          <div className="ss-segmented" style={{ marginBottom: 16 }}>
            <TypeTab kind="dashboard" current={kind} setKind={setKind}>
              <Icons.Dashboard size={14} /> Dashboard
            </TypeTab>
            <TypeTab kind="youtube" current={kind} setKind={setKind}>
              <Icons.Youtube size={14} /> YouTube
            </TypeTab>
            <TypeTab kind="url" current={kind} setKind={setKind}>
              <Icons.Globe size={14} /> Web URL
            </TypeTab>
          </div>

          {kind === "dashboard" &&
            (dashboards.length === 0 ? (
              <p className="t-small" style={{ color: "var(--text-muted)" }}>
                No dashboards exist yet — create one first.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => pickDashboard(d.id)}
                    disabled={!!pendingKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      background: "var(--bg-elev-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      if (!pendingKey)
                        e.currentTarget.style.borderColor = "var(--border-brand)";
                    }}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border)")
                    }
                  >
                    <span
                      style={{
                        width: 64,
                        height: 40,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                      }}
                    >
                      <DashboardMiniPreview dashboard={d} compact />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {d.name}
                    </span>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {pendingKey === d.id ? (
                        <Icons.Refresh size={14} />
                      ) : (
                        <Icons.ChevronRight size={14} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}

          {(kind === "youtube" || kind === "url") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitUrl();
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label
                htmlFor="slide-url"
                className="t-micro"
                style={{ marginBottom: 0 }}
              >
                {kind === "youtube" ? "YouTube URL" : "Web URL"}
              </label>
              <input
                id="slide-url"
                type="url"
                autoFocus
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder={
                  kind === "youtube"
                    ? "https://youtu.be/… or https://www.youtube.com/watch?v=…"
                    : "https://status.example.com"
                }
                spellCheck={false}
                className="ss-input ss-input-mono"
                disabled={pendingKey === "__url"}
              />
              <p
                className="t-small"
                style={{ color: "var(--text-muted)", margin: 0 }}
              >
                {kind === "youtube"
                  ? "Videos autoplay muted and loop. We strip controls and branding so it looks like a broadcast."
                  : "The TV embeds the URL in an iframe. Sites that block embedding fall back to a card."}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={pendingKey === "__url" || urlValue.trim().length === 0}
                >
                  <Icons.Plus size={14} />{" "}
                  {pendingKey === "__url" ? "Adding…" : "Add slide"}
                </button>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-sm">
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
              {urlError && (
                <p
                  className="t-small"
                  style={{
                    color: "var(--danger)",
                    background: "var(--danger-soft)",
                    padding: "8px 12px",
                    borderRadius: 10,
                    margin: 0,
                  }}
                >
                  {urlError}
                </p>
              )}
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TypeTab({
  kind,
  current,
  setKind,
  children,
}: {
  kind: SlideKind;
  current: SlideKind;
  setKind: (next: SlideKind) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ss-seg ${current === kind ? "active" : ""}`}
      onClick={() => setKind(kind)}
    >
      {children}
    </button>
  );
}
