"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, addCollection } from "@iconify/react";
import { Icons } from "@/components/ui/Icon";

/**
 * Full Solar icon picker — React port of the project's Vue
 * `IconPicker.vue`. A modal grid with search, style tabs, and infinite
 * scroll over the entire `@iconify-json/solar` set (~1,200 base icons ×
 * several styles).
 *
 * Icon ids are stored in the canonical Iconify form `solar:<base>-<style>`
 * (e.g. `solar:chart-2-bold`), so they render anywhere via
 * `@iconify/react`'s `<Icon>` — see `ChipIcon`.
 *
 * The full Solar JSON (~3 MB) is imported **dynamically** the first time
 * the modal opens, so it never touches the main bundle — only operators
 * editing a widget pay the lazy-chunk cost, once. We `addCollection` the
 * data so the grid renders offline instantly instead of firing one API
 * request per tile.
 */

const STYLES = [
  { value: "bold", label: "Bold" },
  { value: "linear", label: "Linear" },
  { value: "outline", label: "Outline" },
  { value: "bold-duotone", label: "Duotone" },
] as const;

/** Longest-suffix-first so `home-bold-duotone` strips to `home`, not `home-bold`. */
const STYLE_SUFFIXES = [
  "bold-duotone",
  "line-duotone",
  "linear",
  "outline",
  "broken",
  "bold",
];

/** Common picks shown before the full set finishes loading. */
const POPULAR = [
  "home", "star", "heart", "user", "settings", "phone", "letter", "chat-round", "camera", "lock",
  "shield", "check-circle", "close-circle", "add-circle", "minus-circle", "info-circle",
  "danger", "bell", "calendar", "clock-circle", "map-point", "global", "link", "share",
  "download", "upload", "folder", "document", "gallery", "videocamera", "music-note", "microphone",
  "play", "pause", "stop", "refresh", "magnifer", "filter", "sort", "chart", "graph-up",
  "wallet", "cart-large", "bag", "tag", "gift", "medal-ribbon", "crown", "fire", "bolt",
  "rocket", "lightbulb", "magic-stick", "palette", "pen", "ruler", "scissors", "key",
  "eye", "like", "dislike", "bookmark", "flag", "pin", "clipboard", "notebook",
  "monitor", "laptop", "smartphone", "tablet", "printer", "database", "server", "cloud",
  "wi-fi-router", "bluetooth", "cpu", "chip", "code", "bug", "programming", "widget",
  "users-group-rounded", "hand-shake", "diploma", "square-academic-cap", "case",
  "buildings", "city", "shop", "card", "money-bag", "dollar", "euro", "percent",
  "arrow-right", "arrow-left", "arrow-up", "arrow-down", "double-alt-arrow-right",
  "alt-arrow-right", "square-arrow-right", "round-arrow-right",
  "headphones-round", "speaker", "volume-loud", "verified-check", "shield-check", "shield-star",
  "cup-star", "chart-square", "pie-chart", "presentation-graph", "clipboard-list",
  "checklist-minimalistic", "list", "menu-dots", "hamburger-menu", "widget-add",
  "layers", "copy", "trash-bin-trash", "pen-new-square", "tuning", "slider-vertical",
];

export function IconPicker({
  value,
  onChange,
}: {
  /** Current icon id (iconify form, legacy key, or undefined). */
  value?: string;
  /** Called with the new icon id, or `undefined` when cleared. */
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [style, setStyle] =
    useState<(typeof STYLES)[number]["value"]>("bold");
  const [visibleCount, setVisibleCount] = useState(96);
  const [allBaseNames, setAllBaseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadAllIcons = useCallback(async () => {
    if (allBaseNames.length > 0) return;
    setLoading(true);
    try {
      const mod = (await import("@iconify-json/solar")) as unknown as {
        icons?: { icons: Record<string, unknown>; prefix: string };
        default?: { icons: Record<string, unknown>; prefix: string };
      };
      const data = mod.icons ?? mod.default;
      if (data?.icons) {
        // Register the collection so <Icon> renders from bundled data
        // (offline, no per-tile API calls).
        addCollection(data as Parameters<typeof addCollection>[0]);
        const bases = new Set<string>();
        for (const name of Object.keys(data.icons)) {
          let base = name;
          for (const s of STYLE_SUFFIXES) {
            if (name.endsWith("-" + s)) {
              base = name.slice(0, -(s.length + 1));
              break;
            }
          }
          bases.add(base);
        }
        setAllBaseNames(Array.from(bases).sort());
      }
    } finally {
      setLoading(false);
    }
  }, [allBaseNames.length]);

  function openModal() {
    setOpen(true);
    setSearch("");
    setVisibleCount(96);
    void loadAllIcons();
    // Focus the search field on next paint.
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const source = allBaseNames.length > 0 ? allBaseNames : POPULAR;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matched = q ? source.filter((n) => n.includes(q)) : source;
    return matched.slice(0, visibleCount).map((n) => `solar:${n}-${style}`);
  }, [search, source, visibleCount, style]);

  const totalMatches = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? source.filter((n) => n.includes(q)).length : source.length;
  }, [search, source]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      setVisibleCount((c) => c + 96);
    }
  }

  const displayName = (icon: string) =>
    icon
      .replace(/^solar:/, "")
      .replace(
        /-(bold-duotone|line-duotone|linear|outline|broken|bold)$/,
        "",
      );

  return (
    <div>
      {/* Trigger */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={openModal}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 38,
            padding: "0 12px",
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            cursor: "pointer",
            color: "var(--text-primary)",
            fontSize: 13,
          }}
        >
          {value ? (
            value.includes(":") ? (
              <Icon icon={value} width={20} height={20} />
            ) : (
              <LegacyPreview iconKey={value} />
            )
          ) : (
            <span
              style={{
                width: 20,
                height: 20,
                display: "grid",
                placeItems: "center",
                border: "1px dashed var(--border-strong)",
                borderRadius: 6,
                color: "var(--text-muted)",
                fontSize: 11,
              }}
            >
              ?
            </span>
          )}
          <span
            style={{
              flex: 1,
              textAlign: "left",
              color: value ? "var(--text-primary)" : "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value ? displayName(value) : "Choose icon…"}
          </span>
          <Icons.ChevronDown size={14} />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title="Remove icon"
            className="widget-iconbtn"
            style={{ width: 32, height: 32 }}
          >
            <Icons.Close size={12} />
          </button>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(1, 2, 88, 0.4)",
              backdropFilter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: "min(520px, 96vw)",
              maxHeight: "78vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                className="t-h4"
                style={{ margin: 0, color: "var(--text-primary)", fontWeight: 500 }}
              >
                Choose icon
              </span>
              <button
                type="button"
                className="widget-iconbtn"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ width: 30, height: 30 }}
              >
                <Icons.Close size={14} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 16px 0" }}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleCount(96);
                }}
                placeholder="Search icons…"
                style={{
                  width: "100%",
                  height: 36,
                  padding: "0 12px",
                  background: "var(--bg-elev-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>

            {/* Style tabs */}
            <div style={{ display: "flex", gap: 4, padding: "10px 16px 4px" }}>
              {STYLES.map((s) => {
                const active = style === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStyle(s.value)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: active ? "var(--primary)" : "transparent",
                      background: active ? "var(--primary-soft)" : "transparent",
                      color: active ? "var(--primary)" : "var(--text-secondary)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Count */}
            <div
              className="t-small"
              style={{ padding: "2px 16px 6px", color: "var(--text-muted)" }}
            >
              {totalMatches} icons{search ? " matching" : ""}
              {loading ? " · loading…" : ""}
            </div>

            {/* Grid */}
            <div
              onScroll={onScroll}
              style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 4,
                }}
              >
                {filtered.map((icon) => {
                  const active = value === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      title={displayName(icon)}
                      onClick={() => {
                        onChange(icon);
                        setOpen(false);
                      }}
                      style={{
                        aspectRatio: "1 / 1",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 8,
                        border: `1px solid ${active ? "var(--primary)" : "transparent"}`,
                        background: active
                          ? "var(--primary-soft)"
                          : "transparent",
                        color: active ? "var(--primary)" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!active)
                          e.currentTarget.style.background = "var(--bg-elev-2)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Icon icon={icon} width={22} height={22} />
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0 && (
                <p
                  className="t-small"
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    color: "var(--text-muted)",
                  }}
                >
                  No icons found.
                </p>
              )}
              {filtered.length < totalMatches && (
                <div style={{ textAlign: "center", paddingTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setVisibleCount((c) => c + 96)}
                  >
                    Load more ({totalMatches - filtered.length} remaining)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny preview for a legacy hand-rolled icon key in the trigger button. */
function LegacyPreview({ iconKey }: { iconKey: string }) {
  const Legacy = (Icons as Record<string, ((p: { size?: number }) => React.ReactNode) | undefined>)[
    iconKey
  ];
  return Legacy ? <Legacy size={20} /> : null;
}
