/**
 * Auth.js route handler — exposes the `/api/auth/*` endpoints
 * (callback, signin, signout, session, csrf, providers).
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
