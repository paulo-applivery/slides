"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/Icon";

/**
 * Mobile confirmation card. One tap calls `/api/tv/pair/confirm`; on
 * success the TV's poll picks up the new session within ~2s.
 */
export function PairConfirmCard({
  token,
  slideshowName,
  signerEmail,
}: {
  token: string;
  slideshowName: string;
  signerEmail: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tv/pair/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Server returned ${res.status}`);
        }
        setConfirmed(true);
        // Give the user a beat to read the success state, then send them home.
        setTimeout(() => router.replace("/slideshows"), 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pair.");
      }
    });
  }

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(800px 500px at 80% -10%, var(--primary-tint), transparent 60%)," +
            "radial-gradient(600px 400px at -10% 110%, rgba(2, 65, 227, 0.04), transparent 60%)",
        }}
      />
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 32,
          position: "relative",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: confirmed ? "var(--success-soft)" : "var(--primary-soft)",
            color: confirmed ? "var(--success)" : "var(--primary)",
            margin: "0 auto 6px",
            display: "grid",
            placeItems: "center",
            transition: "all 200ms ease-out",
          }}
        >
          {confirmed ? <Icons.Check size={24} /> : <Icons.TV size={24} />}
        </div>
        <h1 className="t-h2" style={{ marginBottom: 4 }}>
          {confirmed ? "Paired" : "Pair this TV"}
        </h1>
        <p className="t-body" style={{ color: "var(--text-tertiary)", margin: 0 }}>
          {confirmed ? (
            <>
              The TV will switch to the slideshow in a moment. Redirecting
              you back to <span className="t-mono">/slideshows</span>…
            </>
          ) : (
            <>
              You&rsquo;re about to pair this TV to play{" "}
              <strong style={{ color: "var(--text-primary)" }}>{slideshowName}</strong>{" "}
              as <span className="t-mono">{signerEmail}</span>.
            </>
          )}
        </p>
        {!confirmed && (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={pending}
            onClick={confirm}
            style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
          >
            {pending ? "Pairing…" : "Pair this TV"}
          </button>
        )}
        {!confirmed && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => router.replace("/slideshows")}
            style={{ width: "100%", justifyContent: "center" }}
          >
            Cancel
          </button>
        )}
        {error && (
          <p
            className="t-small"
            style={{
              margin: 0,
              color: "var(--danger)",
              background: "var(--danger-soft)",
              padding: "10px 12px",
              borderRadius: 10,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
