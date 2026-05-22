import type { ReactNode } from "react";
import { Icons } from "@/components/ui/Icon";

/**
 * Empty-canvas state for a dashboard with no widgets yet.
 *
 * Mirrors the prototype's `.widget-add` dashed card pattern but full-width.
 * Pass an `cta` slot (typically `<AddWidgetButton primary />`) — the empty
 * state lives in a server component so it can't host the client button on
 * its own.
 */
export function EmptyCanvas({
  editable,
  cta,
}: {
  editable: boolean;
  cta?: ReactNode;
}) {
  return (
    <main className="main">
      <div className="widget-add" style={{ minHeight: 360, padding: 48 }}>
        <div className="widget-add-inner">
          <span className="widget-add-icon">
            <Icons.Plus size={18} />
          </span>
          <div className="t-h4" style={{ marginTop: 4 }}>
            {editable ? "Add your first widget" : "No widgets yet"}
          </div>
          <p
            className="t-small"
            style={{ maxWidth: 360, textAlign: "center", margin: 0 }}
          >
            {editable
              ? "Pick a widget type and bind it to a saved query to start visualizing live revenue."
              : "An editor or admin needs to add widgets before you'll see data here."}
          </p>
          {editable && cta}
        </div>
      </div>
    </main>
  );
}
