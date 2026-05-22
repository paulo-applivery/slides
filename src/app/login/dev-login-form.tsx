"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Dev-only sign-in: type any work email, get signed in as that user.
 * Hidden in production by the parent server component.
 */
export function DevLoginForm({ from }: { from?: string }) {
  const [email, setEmail] = useState("paulo@volta.so");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("dev", {
      email,
      redirect: false,
      callbackUrl: from || "/dashboards",
    });
    setLoading(false);
    if (res?.error) {
      setError("That email didn't work. Use a valid `name@domain.tld`.");
      return;
    }
    // Hard navigate so middleware re-reads the freshly-set session cookie.
    window.location.href = res?.url || "/dashboards";
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: 14,
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        textAlign: "left",
      }}
    >
      <div
        className="t-micro"
        style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <span>Development</span>
        <span style={{ color: "var(--warning)" }}>local only</span>
      </div>
      <label
        htmlFor="dev-email"
        className="t-small"
        style={{ display: "block", marginBottom: 6, color: "var(--text-secondary)" }}
      >
        Sign in as
      </label>
      <input
        id="dev-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@volta.so"
        style={{
          width: "100%",
          height: 38,
          padding: "0 12px",
          borderRadius: 10,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          marginBottom: 10,
        }}
      />
      <button
        type="submit"
        className="btn"
        disabled={loading}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {loading ? "Signing in…" : "Continue as this user"}
      </button>
      {error && (
        <p className="t-small" style={{ marginTop: 8, color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <p
        className="t-small"
        style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 11 }}
      >
        Bypasses Google. First user on a domain bootstraps the workspace and
        becomes admin.
      </p>
    </form>
  );
}
