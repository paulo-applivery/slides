"use server";

/**
 * Slideshow CRUD + slide-level mutations.
 *
 * Mutations bounce through `mutateSlides` so the JSON column stays
 * consistent. All operations scoped to the caller's workspace + role.
 */
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { slideshows, type Slide, type SlideTransition } from "@/lib/db/schema";
import { canEdit, type Role } from "@/lib/roles";
import { parseYoutubeId, validateExternalUrl } from "@/lib/tv/slides";

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireWorkspace() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  const role = (session?.user?.role ?? null) as Role | null;
  if (!workspaceId) throw new ForbiddenError();
  return { workspaceId, role, userId: session!.user!.id };
}

async function requireEditor() {
  const { workspaceId, role, userId } = await requireWorkspace();
  if (!canEdit(role)) throw new ForbiddenError();
  return { workspaceId, role, userId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listSlideshows() {
  const { workspaceId } = await requireWorkspace();
  return db
    .select({
      id: slideshows.id,
      name: slideshows.name,
      slides: slideshows.slides,
      updatedAt: slideshows.updatedAt,
    })
    .from(slideshows)
    .where(eq(slideshows.workspaceId, workspaceId))
    .orderBy(desc(slideshows.updatedAt));
}

export async function getSlideshow(id: string) {
  const { workspaceId } = await requireWorkspace();
  return db.query.slideshows.findFirst({
    where: and(eq(slideshows.id, id), eq(slideshows.workspaceId, workspaceId)),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level mutations
// ─────────────────────────────────────────────────────────────────────────────

export async function createSlideshow(name?: string): Promise<void> {
  const { workspaceId, userId } = await requireEditor();
  const finalName = (name?.trim() || "Untitled slideshow").slice(0, 120);

  const id = crypto.randomUUID();
  await db.insert(slideshows).values({
    id,
    workspaceId,
    name: finalName,
    createdBy: userId,
    slides: [],
  });
  revalidatePath("/slideshows");
  redirect(`/slideshows/${id}/edit`);
}

export async function renameSlideshow(id: string, name: string): Promise<void> {
  const { workspaceId } = await requireEditor();
  const finalName = name.trim().slice(0, 120);
  if (!finalName) return;
  await db
    .update(slideshows)
    .set({ name: finalName, updatedAt: new Date() })
    .where(and(eq(slideshows.id, id), eq(slideshows.workspaceId, workspaceId)));
  revalidatePath("/slideshows");
  revalidatePath(`/slideshows/${id}/edit`);
  revalidatePath(`/tv/${id}`);
}

export async function deleteSlideshow(id: string): Promise<void> {
  const { workspaceId } = await requireEditor();
  await db
    .delete(slideshows)
    .where(and(eq(slideshows.id, id), eq(slideshows.workspaceId, workspaceId)));
  revalidatePath("/slideshows");
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide-level mutations
// ─────────────────────────────────────────────────────────────────────────────

async function mutateSlides(
  slideshowId: string,
  workspaceId: string,
  fn: (current: Slide[]) => Slide[],
) {
  const row = await db.query.slideshows.findFirst({
    where: and(
      eq(slideshows.id, slideshowId),
      eq(slideshows.workspaceId, workspaceId),
    ),
    columns: { id: true, slides: true },
  });
  if (!row) throw new Error("Slideshow not found.");
  const next = fn(row.slides ?? []);
  await db
    .update(slideshows)
    .set({ slides: next, updatedAt: new Date() })
    .where(eq(slideshows.id, slideshowId));
  revalidatePath(`/slideshows/${slideshowId}/edit`);
  revalidatePath(`/tv/${slideshowId}`);
}

export async function addDashboardSlide(
  slideshowId: string,
  dashboardId: string,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      type: "dashboard",
      dashboardId,
      durationSec: 30,
      transition: "crossfade",
    },
  ]);
}

export async function addYoutubeSlide(
  slideshowId: string,
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const videoId = parseYoutubeId(rawUrl);
  if (!videoId) {
    return {
      ok: false,
      error: "Paste a YouTube URL like https://youtu.be/… or https://www.youtube.com/watch?v=…",
    };
  }
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      type: "youtube",
      url: rawUrl.trim(),
      durationSec: 60,
      transition: "crossfade",
    },
  ]);
  return { ok: true };
}

export async function addUrlSlide(
  slideshowId: string,
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateExternalUrl(rawUrl);
  if (!validated.ok) return validated;
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) => [
    ...current,
    {
      id: crypto.randomUUID(),
      type: "url",
      url: validated.url,
      durationSec: 20,
      transition: "crossfade",
    },
  ]);
  return { ok: true };
}

/** Update a YouTube/URL slide's `url`. Validates the input per slide type. */
export async function updateSlideUrl(
  slideshowId: string,
  slideId: string,
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workspaceId } = await requireEditor();
  // Snapshot the slide so we can validate the URL against its type.
  const row = await db.query.slideshows.findFirst({
    where: and(
      eq(slideshows.id, slideshowId),
      eq(slideshows.workspaceId, workspaceId),
    ),
    columns: { slides: true },
  });
  const slide = row?.slides.find((s) => s.id === slideId);
  if (!slide) return { ok: false, error: "Slide not found." };
  if (slide.type === "dashboard") {
    return { ok: false, error: "Dashboard slides don't have a URL." };
  }
  if (slide.type === "youtube") {
    if (!parseYoutubeId(rawUrl)) {
      return { ok: false, error: "Not a YouTube URL." };
    }
  } else {
    const v = validateExternalUrl(rawUrl);
    if (!v.ok) return v;
  }
  await mutateSlides(slideshowId, workspaceId, (current) =>
    current.map((s) =>
      s.id === slideId && (s.type === "youtube" || s.type === "url")
        ? { ...s, url: rawUrl.trim() }
        : s,
    ),
  );
  return { ok: true };
}

export async function removeSlide(
  slideshowId: string,
  slideId: string,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) =>
    current.filter((s) => s.id !== slideId),
  );
}

export async function moveSlide(
  slideshowId: string,
  slideId: string,
  direction: "up" | "down",
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) => {
    const i = current.findIndex((s) => s.id === slideId);
    if (i === -1) return current;
    const target = direction === "up" ? i - 1 : i + 1;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    const [picked] = next.splice(i, 1);
    next.splice(target, 0, picked);
    return next;
  });
}

export async function updateSlide(
  slideshowId: string,
  slideId: string,
  patch: { durationSec?: number; transition?: SlideTransition },
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateSlides(slideshowId, workspaceId, (current) =>
    current.map((s) =>
      s.id === slideId
        ? {
            ...s,
            durationSec:
              patch.durationSec != null
                ? Math.max(5, Math.min(600, patch.durationSec))
                : s.durationSec,
            transition: patch.transition ?? s.transition,
          }
        : s,
    ),
  );
}
