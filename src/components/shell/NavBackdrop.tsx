"use client";

/**
 * Dim layer behind the mobile sidebar drawer. Rendered as a direct child of
 * `.app` so it stacks correctly between the main content and the drawer.
 * Tapping it closes the drawer by clearing the `nav-open` class that
 * `MobileMenuButton` toggles. CSS controls visibility (hidden on desktop,
 * fades in under `.app.nav-open`).
 */
export function NavBackdrop() {
  return (
    <div
      className="nav-backdrop"
      aria-hidden
      onClick={() =>
        document.querySelector(".app")?.classList.remove("nav-open")
      }
    />
  );
}
