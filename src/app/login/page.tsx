import { GoogleSignInButton } from "./google-button";
import { DevLoginForm } from "./dev-login-form";
import { devLoginEnabled } from "@/lib/dev-login";

/**
 * Login screen — Google SSO. Light canvas with a faint ambient brand-tint
 * glow; centered card with the wordmark, tagline, and a single primary CTA.
 *
 * In dev, a Credentials-based shortcut sits below the Google button so you
 * can sign in without setting up OAuth credentials.
 *
 * `from` (query param) is the original path the user tried to visit; we
 * round-trip it through whichever flow completes successfully.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { from?: string };
}) {
  const showDevLogin = devLoginEnabled();

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        overflow: "hidden",
      }}
    >
      {/* Ambient brand-tint glow */}
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
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            aspectRatio: "1 / 1",
            flexShrink: 0,
            borderRadius: 12,
            background: "var(--primary)",
            margin: "0 auto 20px",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 0 0 4px var(--primary-soft)",
          }}
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 70 70" fill="white">
            <path d="M35 0 L70 60 L55 56 L35 22 L15 56 L0 60 Z" />
            <path d="M35 36 L45 56 L35 53 L25 56 Z" />
          </svg>
        </div>
        <h1 className="t-h2" style={{ marginBottom: 6 }}>
          Your revenue. Live.
        </h1>
        <p className="t-body" style={{ marginBottom: 24, color: "var(--text-tertiary)" }}>
          Sign in to Applivery Atlas with your work Google account.
        </p>
        <GoogleSignInButton from={searchParams?.from} />
        {!showDevLogin && (
          <p className="t-small" style={{ marginTop: 18, color: "var(--text-muted)" }}>
            First user in your domain becomes the workspace admin. Subsequent
            colleagues join automatically.
          </p>
        )}
        {showDevLogin && <DevLoginForm from={searchParams?.from} />}
      </div>
    </main>
  );
}
