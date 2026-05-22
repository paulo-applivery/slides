"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Client-side wrapper for the session context — keeps the server `<RootLayout>`
 * free of "use client" so we don't accidentally bail out of static rendering.
 */
export function Providers({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
