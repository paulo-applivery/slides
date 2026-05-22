/**
 * Module augmentation for next-auth — adds the app-specific fields we put
 * on the session in `src/auth.ts`.
 */
import "next-auth";
import "next-auth/jwt";

type Role = "admin" | "editor" | "viewer";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      workspaceId: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    workspaceId?: string | null;
    role?: Role;
  }
}
