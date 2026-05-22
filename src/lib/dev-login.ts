/**
 * Dev-only credentials login.
 *
 * Hard-blocked in production: even if someone leaves the env flag on, the
 * `authorize` function will return null when NODE_ENV === "production".
 *
 * In dev, takes any work-email-shaped string, upserts a user row, runs the
 * same workspace bootstrap the Google flow does, and returns a session user.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { attachUserToWorkspace } from "@/lib/workspace";

/** Returns true only when the dev shortcut is allowed for this process. */
export function devLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  // Default to ON in local dev so the user doesn't have to set anything.
  // Set ENABLE_DEV_LOGIN=false to disable.
  return process.env.ENABLE_DEV_LOGIN !== "false";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Look up or create a user by email; ensure they're attached to a
 * workspace (first user on a domain → admin; others → editor under
 * domain-auto policy).
 */
export async function loginAsDevUser(emailRaw: string) {
  if (!devLoginEnabled()) return null;
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name ?? nameFromEmail(email),
      image: existing.image ?? null,
    };
  }

  const id = randomUUID();
  await db.insert(users).values({
    id,
    email,
    name: nameFromEmail(email),
  });
  await attachUserToWorkspace(id, email);

  return { id, email, name: nameFromEmail(email), image: null };
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
