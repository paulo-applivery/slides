"use client";

import { useState, useTransition } from "react";
import { connectStripeAction } from "@/lib/integrations/actions";
import { Icons } from "@/components/ui/Icon";

/**
 * Inline connect form for the Stripe integration card.
 *
 * In Phase 2 we accept a raw secret/restricted key — simplest path that works
 * in both dev and prod. A proper OAuth (Stripe Connect Standard) flow lands
 * once we wire deploy.
 *
 * The form expands on demand to keep the resting card compact. Validation
 * + sync happen server-side; we surface the result back via useActionState.
 */
export function StripeConnectForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        <Icons.Plug size={14} /> Connect Stripe
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await connectStripeAction(undefined, formData);
          if (!res.ok) setError(res.error ?? "Connection failed.");
          else setOpen(false);
        });
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "100%",
      }}
    >
      <label className="t-micro" htmlFor="stripe-api-key">
        Stripe secret key
      </label>
      <input
        id="stripe-api-key"
        name="apiKey"
        type="password"
        placeholder="sk_test_… or rk_test_…"
        autoComplete="off"
        autoFocus
        required
        style={{
          height: 38,
          padding: "0 12px",
          borderRadius: 10,
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      />
      <p className="t-small" style={{ color: "var(--text-muted)", margin: 0 }}>
        We store this encrypted (AES-GCM). Get one at{" "}
        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--primary)" }}
        >
          dashboard.stripe.com/apikeys
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="t-small" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
