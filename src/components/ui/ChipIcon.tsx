"use client";

import { Icon } from "@iconify/react";
import { Icons, type IconName } from "@/components/ui/Icon";

/**
 * Renders a chip icon from either source:
 *
 *  - **Iconify id** (contains a `:`, e.g. `solar:home-bold`) — drawn via
 *    `@iconify/react`, which fetches + caches the SVG. This is what the
 *    full icon picker produces.
 *  - **Legacy key** (e.g. `TrendUp`) — a hand-rolled SVG from the
 *    original curated set. Kept so chips saved before the full picker
 *    landed keep their icon.
 *
 * Returns null for an unknown legacy key so a stale value degrades to
 * "no icon" rather than a crash.
 */
export function ChipIcon({ icon, size }: { icon: string; size: number }) {
  if (icon.includes(":")) {
    return <Icon icon={icon} width={size} height={size} />;
  }
  const Legacy = Icons[icon as IconName];
  return Legacy ? <Legacy size={size} /> : null;
}
