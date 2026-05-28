/**
 * Toast notifications — powered by `sileo` (physics-based React toasts).
 *
 * Import `toast` from here rather than reaching for `sileo` directly, so the
 * app depends on one stable internal path and a single configured surface.
 * The <Toaster> is mounted once in `src/app/layout.tsx`.
 *
 * Unlike string-based libraries, sileo takes an options object:
 *
 *   import { toast } from "@/lib/toast";
 *
 *   toast.success({ title: "Saved", description: "Dashboard updated." });
 *   toast.error({ title: "Couldn't save", description: "Try again." });
 *
 *   await toast.promise(saveDashboard(), {
 *     loading: { title: "Saving…" },
 *     success: { title: "Saved" },
 *     error:   { title: "Failed to save" },
 *   });
 *
 * Other methods: toast.show / warning / info / action, toast.dismiss(id),
 * toast.clear().
 */
export { sileo as toast } from "sileo";
export type { SileoOptions, SileoPosition, SileoState } from "sileo";
