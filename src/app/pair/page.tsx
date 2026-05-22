import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pairingTokens, slideshows } from "@/lib/db/schema";
import { PairConfirmCard } from "@/components/tv/PairConfirmCard";

/**
 * Mobile pairing confirmation. Reached by scanning the QR on the TV.
 *
 * - Requires a signed-in user (middleware redirects to /login?from=/pair?token=…)
 * - Looks up the pairing token; renders status accordingly
 * - The actual confirmation hits `/api/tv/pair/confirm` from the client
 *   so we get a clean error / pending UI state
 */
export const dynamic = "force-dynamic";

export default async function PairPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const session = await auth();
  if (!session?.user?.workspaceId) {
    redirect(`/login?from=${encodeURIComponent(`/pair?token=${searchParams?.token ?? ""}`)}`);
  }
  const token = searchParams?.token?.trim() ?? "";
  if (!token) {
    return <PairStatus title="No pairing token" subtitle="Scan the QR on the TV again to get a fresh link." />;
  }

  const pair = await db.query.pairingTokens.findFirst({
    where: eq(pairingTokens.token, token),
  });
  if (!pair) {
    return (
      <PairStatus
        title="Pairing link not found"
        subtitle="The QR may have expired. Reload the TV screen and scan the new code."
      />
    );
  }
  if (pair.usedAt) {
    return (
      <PairStatus
        title="Already paired"
        subtitle="This TV was paired from another device. Reload the TV to start fresh."
      />
    );
  }
  if (pair.expiresAt.getTime() < Date.now()) {
    return (
      <PairStatus
        title="Pairing link expired"
        subtitle="Reload the TV screen and scan the new code (each token lasts 5 minutes)."
      />
    );
  }

  const ss = await db.query.slideshows.findFirst({
    where: eq(slideshows.id, pair.slideshowId),
    columns: { id: true, name: true, workspaceId: true },
  });
  if (!ss || ss.workspaceId !== session.user.workspaceId) {
    return (
      <PairStatus
        title="Not your workspace"
        subtitle="This TV belongs to a different workspace. Sign in with the right account and try again."
      />
    );
  }

  return (
    <PairConfirmCard
      token={token}
      slideshowName={ss.name}
      signerEmail={session.user.email ?? "you"}
    />
  );
}

/** Centered notice card for short-circuit states (missing/used/expired token). */
function PairStatus({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 32,
          textAlign: "center",
        }}
      >
        <h1 className="t-h3" style={{ marginBottom: 6 }}>
          {title}
        </h1>
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          {subtitle}
        </p>
      </div>
    </main>
  );
}
