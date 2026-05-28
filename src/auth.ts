/**
 * Auth.js v5 — full configuration (Node runtime only).
 *
 * Extends `auth.config.ts` with the Drizzle adapter and the signIn event.
 * Route handlers (`/api/auth/[...nextauth]/route.ts`) and server components
 * import `auth` from here. Middleware uses `auth.config.ts` directly so it
 * can run at the edge.
 *
 * In development a Credentials provider is added that bypasses Google so
 * you can sign in by typing any work email. Hard-gated by NODE_ENV — even
 * if the env flag leaks into a prod build, the `authorize` returns null.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { attachUserToWorkspace } from "@/lib/workspace";
import { devLoginEnabled, loginAsDevUser } from "@/lib/dev-login";

const devProvider = Credentials({
  id: "dev",
  name: "Dev login",
  credentials: {
    email: { label: "Email", type: "email", placeholder: "you@example.com" },
  },
  async authorize(credentials) {
    if (!devLoginEnabled()) return null;
    const email = typeof credentials?.email === "string" ? credentials.email : "";
    return loginAsDevUser(email);
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Append the dev provider after the Google one defined in authConfig.
  providers: [...authConfig.providers, ...(devLoginEnabled() ? [devProvider] : [])],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    async jwt({ token, user }) {
      // First call (user just signed in): pull workspace + role onto the
      // token so we don't hit the DB on every request.
      if (user?.id) {
        let row = await db.query.users.findFirst({
          where: eq(users.id, user.id),
          columns: { workspaceId: true, role: true },
        });
        // Self-heal: the `signIn` event is fire-and-forget — Auth.js swallows
        // any error it throws — so a workspace attachment that failed on the
        // very first login (e.g. tables not yet migrated) would leave the row
        // with a null workspaceId forever, since `isNewUser` is false on every
        // later login. Re-attach here (this call IS awaited) so the session
        // always carries a workspaceId once one can be resolved.
        if (!row?.workspaceId && user.email) {
          await attachUserToWorkspace(user.id, user.email);
          row = await db.query.users.findFirst({
            where: eq(users.id, user.id),
            columns: { workspaceId: true, role: true },
          });
        }
        token.userId = user.id;
        token.workspaceId = row?.workspaceId ?? null;
        token.role = row?.role ?? "viewer";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? session.user.id;
        session.user.workspaceId = (token.workspaceId as string | null) ?? null;
        session.user.role =
          (token.role as "admin" | "editor" | "viewer") ?? "viewer";
      }
      return session;
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      // The DrizzleAdapter has already inserted the user row by this point;
      // attach them to a workspace based on their email domain.
      // (Dev login does this inside its own authorize, but it's idempotent.)
      if (isNewUser && user.id && user.email) {
        await attachUserToWorkspace(user.id, user.email);
      }
    },
  },
});
