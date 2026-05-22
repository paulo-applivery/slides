import { redirect } from "next/navigation";

/**
 * Root redirects straight to the dashboards list. In Phase 1 (auth) this
 * will check the session and either send signed-in users to /dashboards or
 * unauthenticated users to /login.
 */
export default function Home() {
  redirect("/dashboards");
}
