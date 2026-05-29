import { Icons } from "@/components/ui/Icon";

/**
 * Static image widget — renders an operator-supplied image by URL.
 *
 * The source is a plain URL stored in `display.imageUrl`; we render it
 * with an `<img>` so the browser handles loading/caching. `fit` maps to
 * `object-fit`: `contain` (default) shows the whole image letterboxed,
 * `cover` fills the cell and crops. No upload/download happens here —
 * it's just an `<img src>` reference.
 */
export type ImageWidgetProps = {
  src?: string;
  /** object-fit mode. Defaults to `contain`. */
  fit?: "contain" | "cover";
  /** Accessible alt text — falls back to empty (decorative). */
  alt?: string;
};

export function ImageWidget({ src, fit = "contain", alt }: ImageWidgetProps) {
  const url = src?.trim();
  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 80,
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
          <Icons.Image size={28} />
          <span className="t-small">Add an image URL</span>
        </div>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary
    // operator-supplied external URLs can't be statically optimised by
    // next/image (no known domains); a plain <img> is correct here.
    <img
      src={url}
      alt={alt ?? ""}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        display: "block",
        borderRadius: "inherit",
      }}
    />
  );
}
