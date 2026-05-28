"use client";

import { useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import { createDashboard } from "@/lib/dashboards";
import { toast } from "@/lib/toast";

/**
 * "New dashboard" CTA. Wraps the createDashboard server action in a
 * useTransition so the button can show a pending state without blocking
 * other UI. The action itself does the redirect on the server.
 *
 * Two visual variants:
 *  - default: matches the .btn .btn-primary chrome on the dashboards list
 *  - "compact": .btn-sm size, used in the empty state's secondary slot
 */
export function NewDashboardButton({
  variant = "default",
  label = "New dashboard",
}: {
  variant?: "default" | "compact";
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const className =
    variant === "compact" ? "btn btn-sm" : "btn btn-primary";

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await createDashboard();
          } catch (err) {
            toast.error({
              title: "Couldn't create dashboard",
              description: err instanceof Error ? err.message : undefined,
            });
          }
        });
      }}
    >
      <Icons.Plus size={14} /> {pending ? "Creating…" : label}
    </button>
  );
}
