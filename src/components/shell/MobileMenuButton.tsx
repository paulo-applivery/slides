"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Mobile-only hamburger that toggles the sidebar drawer by flipping the
 * `nav-open` class on the `.app` shell. The class is the single source of
 * truth (the backdrop also clears it), so we read the live DOM state on
 * each click rather than trusting local state. Closes automatically on
 * navigation. Hidden on desktop via CSS (`.mobile-menu-btn`).
 */
export function MobileMenuButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (e.g. tapping a nav link).
  useEffect(() => {
    document.querySelector(".app")?.classList.remove("nav-open");
    setOpen(false);
  }, [pathname]);

  return (
    <button
      type="button"
      className="mobile-menu-btn btn btn-ghost btn-icon"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={() => {
        const app = document.querySelector(".app");
        const next = !app?.classList.contains("nav-open");
        app?.classList.toggle("nav-open", next);
        setOpen(next);
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
  );
}
