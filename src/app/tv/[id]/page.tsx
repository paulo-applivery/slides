import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { slideshows } from "@/lib/db/schema";
import { fetchTvSlideshowData } from "@/lib/tv/data";
import { TVApp } from "@/components/tv/TVApp";
import { TVMode } from "@/components/tv/TVMode";

/**
 * `/tv/[id]` has two entry paths:
 *
 *   1. A signed-in editor opens it from the slideshow editor's Preview
 *      or Launch button. We have a NextAuth session — skip the QR flow
 *      entirely, fetch the slideshow + widget data server-side, render
 *      `<TVMode>` directly.
 *
 *   2. An anonymous TV browser (no session) lands on the URL — render
 *      the client `<TVApp>` which mints a pairing token, shows the QR,
 *      and polls for confirmation.
 *
 * The QR pairing flow remains the canonical path for actual physical TVs;
 * this bypass is for the editor's preview/launch UX.
 */
export const dynamic = "force-dynamic";

export default async function TVPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const userWorkspaceId = session?.user?.workspaceId ?? null;

  if (userWorkspaceId) {
    // Cheap workspace check — we don't render slideshows belonging to
    // other workspaces under the user's session.
    const ss = await db.query.slideshows.findFirst({
      where: eq(slideshows.id, params.id),
      columns: { workspaceId: true },
    });
    if (ss && ss.workspaceId === userWorkspaceId) {
      const data = await fetchTvSlideshowData(userWorkspaceId, params.id);
      if (data) {
        return (
          <TVMode
            slideshow={data.slideshow}
            dashboardsById={data.dashboardsById}
            workspaceName={data.workspaceName}
            // No onUnpair: the exit button is a Link back to the editor
            // (handled inside TVMode). Editors aren't really "paired".
          />
        );
      }
    }
  }

  // Fallback: anonymous TV, or a signed-in user looking at a slideshow
  // outside their workspace. Either way, hand off to the QR flow.
  return <TVApp slideshowId={params.id} />;
}
