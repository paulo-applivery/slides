"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppBackground } from "@/components/theme/AppBackground";

/**
 * Client-side wrapper for context providers — keeps the server `<RootLayout>`
 * free of "use client" so we don't accidentally bail out of static rendering.
 *
 * `ThemeProvider` owns the appearance prefs (theme, background effect,
 * glass cards, brand color). `<AppBackground>` mounts the chosen
 * WebGL background behind every route as a fixed full-bleed layer.
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
      <ThemeProvider>
        <AppBackground />
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
