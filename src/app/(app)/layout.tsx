import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import { DataSourcesFooter } from "@/components/shell/DataSourcesFooter";
import { NavBackdrop } from "@/components/shell/NavBackdrop";

/**
 * The `(app)` route group is the authenticated shell — sidebar always
 * mounted, route content (page.tsx) renders the top bar + main canvas.
 *
 * `DataSourcesFooter` is rendered server-side and passed into the
 * client `Sidebar` as a slot so the bottom strip reflects the DB.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  return (
    <div className="app">
      <Sidebar footer={<DataSourcesFooter />} />
      <NavBackdrop />
      {children}
    </div>
  );
}
