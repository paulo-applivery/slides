/** Role utilities — pure functions, safe to import from server or client. */

export type Role = "admin" | "editor" | "viewer";

/** Editors and admins can mutate dashboards; viewers can only read. */
export function canEdit(role: Role | null | undefined): boolean {
  return role === "admin" || role === "editor";
}
