/**
 * Static text widget — renders an operator-authored block of text.
 *
 * Content comes from the widget's `display.text` (not a query), so this
 * is a pure presentational component. Sizing follows the same fluid
 * `cqh` + `--chart-text-scale` model the charts use, so the text grows
 * with the cell on a big TV and shrinks on a dense grid. Line breaks in
 * the source are preserved (`white-space: pre-wrap`).
 */
export type TextWidgetProps = {
  text: string;
  /** Horizontal alignment of the text block. Defaults to left. */
  align?: "left" | "center" | "right";
};

export function TextWidget({ text, align = "left" }: TextWidgetProps) {
  const trimmed = text.trim();
  return (
    <div
      className="text-widget"
      style={{
        textAlign: align,
        // Vertically center short copy, top-align long copy that
        // overflows — `center` keeps a one-liner pinned to the middle
        // of the cell which is what reads best on a dashboard.
        width: "100%",
      }}
    >
      {trimmed ? (
        trimmed
      ) : (
        <span style={{ color: "var(--text-muted)" }}>Add text…</span>
      )}
    </div>
  );
}
