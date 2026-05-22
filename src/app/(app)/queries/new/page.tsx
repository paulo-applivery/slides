import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { canEdit, type Role } from "@/lib/roles";
import { QueryWizard } from "@/components/queries/QueryWizard";
import { CLIENT_METRICS } from "@/lib/queries/catalog";

export default async function NewQueryPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  if (!canEdit(role)) redirect("/queries");

  return (
    <>
      <TopBar crumbs={["Queries"]} name="New query" />
      <main className="main">
        <QueryWizard metrics={CLIENT_METRICS} />
      </main>
    </>
  );
}
