import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Icons } from "@/components/ui/Icon";
import { InlineRename } from "@/components/slideshows/InlineRename";
import { SlideshowEditor } from "@/components/slideshows/SlideshowEditor";
import { getSlideshow } from "@/lib/slideshows";
import { canEdit, type Role } from "@/lib/roles";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";

/**
 * Slideshow editor — left ordered slide list, right preview + per-slide
 * config. Pulls the workspace's dashboards so the user can pick what each
 * slide references.
 */
export default async function SlideshowEditPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);
  if (!editable) redirect(`/tv/${params.id}`);

  const slideshow = await getSlideshow(params.id);
  if (!slideshow) notFound();

  // Real request host for the advertised TV URL — so it reads
  // `localhost:3000/t/…` in dev and the actual domain in prod instead
  // of a hardcoded guess. Falls back to the production host when the
  // header is somehow absent (e.g. certain edge runtimes).
  const tvHost = headers().get("host") ?? "app.applivery.com";

  // Dashboards available for the "add slide" picker. We pull `layout`
  // and `theme` too so the editor can render a wireframe thumbnail of
  // each dashboard's widget grid (no query execution needed).
  const workspaceDashboards = await db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      layout: dashboards.layout,
      theme: dashboards.theme,
    })
    .from(dashboards)
    .where(
      and(
        eq(dashboards.workspaceId, session.user.workspaceId),
        eq(dashboards.archived, false),
      ),
    );

  return (
    <>
      <TopBar
        crumbs={["Slideshows"]}
        name={<InlineRename id={slideshow.id} initialName={slideshow.name} />}
        actions={
          <>
            <Link
              href={`/tv/${slideshow.id}`}
              target="_blank"
              className="btn btn-ghost"
            >
              <Icons.Eye size={14} /> Preview
            </Link>
            <Link
              href={`/tv/${slideshow.id}`}
              target="_blank"
              className="btn btn-primary"
            >
              <Icons.TV size={14} /> Launch on TV
            </Link>
          </>
        }
      />
      <SlideshowEditor
        slideshowId={slideshow.id}
        initialSlides={slideshow.slides}
        dashboards={workspaceDashboards}
        tvHost={tvHost}
      />
    </>
  );
}
