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
  updateSlide,
  updateSlideUrl,
} from "@/lib/slideshows";
import type { Slide, SlideTransition } from "@/lib/db/schema";

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

export function SlideshowEditor({
  slideshowId,
  initialSlides,
  dashboards,
}: {
  slideshowId: string;
  initialSlides: Slide[];
  dashboards: Array<{ id: string; name: string }>;
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
                  }}
                >
                  {s.type === "dashboard" ? (
                    <Icons.Dashboard size={20} variant="bold" />
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
                      startTransition(async () => {
                        await moveSlide(slideshowId, selected.id, "up");
                      });
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
                      startTransition(async () => {
                        await moveSlide(slideshowId, selected.id, "down");
                      });
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
                        await removeSlide(slideshowId, selected.id);
                      });
                    }}
                    style={{ color: "var(--danger)" }}
                  >
                    <Icons.Close size={12} /> Remove
                  </button>
                </div>
              </div>

              <div className="ss-preview">
                <SlideThumb slide={selected} />
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
                            startTransition(async () => {
                              await updateSlide(slideshowId, selected.id, {
                                durationSec: Math.max(5, selected.durationSec - 5),
                              });
                            });
                          }}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await updateSlide(slideshowId, selected.id, {
                                durationSec: selected.durationSec + 5,
                              });
                            });
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
                            startTransition(async () => {
                              await updateSlide(slideshowId, selected.id, {
                                transition: t,
                              });
                            });
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
                <div className="ss-config-meta">
                  <span className="t-small">
                    <Icons.Wifi size={13} /> Auto-loops indefinitely
                  </span>
                  <span className="t-small">
                    TV URL ·{" "}
                    <code className="t-mono ss-url">
                      app.applivery.com/tv/{slideshowId.slice(0, 8)}
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

function slideLabel(
  slide: Slide,
  dashboards: Array<{ id: string; name: string }>,
) {
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

function SlideThumb({ slide }: { slide: Slide }) {
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
          {slide.type === "dashboard" ? (
            <>
              <Icons.Dashboard size={36} />
              <div className="t-small" style={{ marginTop: 8 }}>
                Live dashboard preview · opens in TV mode
              </div>
            </>
          ) : slide.type === "youtube" ? (
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
  dashboards: Array<{ id: string; name: string }>;
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
      await addDashboardSlide(slideshowId, dashboardId);
      reset();
      onOpenChange(false);
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
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--primary-soft)",
                        color: "var(--primary)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icons.Dashboard size={16} variant="bold" />
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
