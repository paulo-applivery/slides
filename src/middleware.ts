/**
 * Edge middleware — redirects unauthenticated traffic away from the
 * authenticated app shell and bounces authed traffic away from /login.
 *
 * Uses the adapter-less `auth.config` so it stays edge-safe (no DB
 * driver / native bindings). Token-only checks; the DB is touched only
 * by route handlers / server components.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/assets",
  "/fonts",
  "/favicon.ico",
  // TV mode is public — auth is via the tv_session token in localStorage,
  // validated by /api/tv/data on every page load. /pair is intentionally
  // NOT here because it needs a NextAuth session.
  "/tv/",
  // Short TV URL — resolves a slideshow-id prefix and redirects to the
  // full /tv/<uuid>. Public for the same reason /tv/ is: a bare TV
  // browser types this in before it has any session.
  "/t/",
  "/api/tv/pair/start",
  "/api/tv/pair/poll",
  "/api/tv/data",
  "/api/tv/version",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const signedIn = !!req.auth;

  // Always allow the auth endpoints + static assets.
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (pathname.startsWith("/login") && signedIn) {
      return NextResponse.redirect(new URL("/dashboards", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!signedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except the Next internal assets and the few public
  // file types we ship from /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/|fonts/).*)"],
};
