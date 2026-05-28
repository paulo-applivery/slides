/**
 * Edge-safe slice of the Auth.js config — no Drizzle adapter, no `pg`.
 * Imported by `middleware.ts` so it can run on the edge runtime.
 *
 * The full config (with the Drizzle adapter, the `signIn` event, etc.)
 * lives in `./auth.ts` and is used by route handlers + server components.
 */
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  // Auth.js only auto-trusts the Host header on Vercel; behind Cloudflare we
  // must opt in explicitly or every auth route throws `UntrustedHost` (500).
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 }, // 24h
  pages: { signIn: "/login" },
} satisfies NextAuthConfig;
