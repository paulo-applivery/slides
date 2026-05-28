import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind conflict resolution.
 * Standard shadcn/ui helper — used by `@/components/ui/*`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
