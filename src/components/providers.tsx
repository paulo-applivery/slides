"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * Client-side wrapper for context providers — keeps the server `<RootLayout>`
 * free of "use client" so we don't accidentally bail out of static rendering.
 *
 * `ThemeProvider` owns the app-shell light/dark preference. Background
 * effects are now per-slide (TV playback only) — see `SlideBackground`.
 */
export function Providers({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionProvider session={session}>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
