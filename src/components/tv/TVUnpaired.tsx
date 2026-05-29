"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "@/components/ui/Icon";

/**
 * Unpaired TV screen — left column is brand + instructions + countdown,
 * right column is the QR card with PIN fallback.
 *
 * State machine:
 *   1) Mount → POST /api/tv/pair/start → store token + show QR/PIN
 *   2) Begin GET /api/tv/pair/poll every 2s
 *   3) When poll returns `paired` → call onPaired(sessionToken)
 *   4) When poll returns `expired` → mint a new token (auto)
 */
type PairState = {
  token: string;
  pin: string;
  qrDataUrl: string;
  expiresAt: number;
};

export function TVUnpaired({
  slideshowId,
  onPaired,
}: {
  slideshowId: string;
  onPaired: (sessionToken: string) => void;
}) {
  const [pair, setPair] = useState<PairState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Force dark theme.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "dark");
    document.body.style.overflow = "hidden";
    return () => {
      if (prev) html.setAttribute("data-theme", prev);
      else html.removeAttribute("data-theme");
      document.body.style.overflow = "";
    };
  }, []);

  // Mint a token on mount and whenever the previous one expires.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setError(null);
      try {
        const res = await fetch("/api/tv/pair/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slideshowId }),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const body = await res.json();
        if (cancelled) return;
        setPair({
          token: body.token,
          pin: body.pin,
          qrDataUrl: body.qrDataUrl,
          expiresAt: Date.parse(body.expiresAt),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to start pairing.");
      }
    };
    start();
    return () => {
      cancelled = true;
    };
  }, [slideshowId]);

  // Tick the countdown every second.
  useEffect(() => {
    if (!pair) return;
    const tick = () => {
      const ms = Math.max(0, pair.expiresAt - Date.now());
      setRemaining(Math.floor(ms / 1000));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pair]);

  // Poll for confirmation every 2s. On expiry, mint a fresh token.
  useEffect(() => {
    if (!pair) return;
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/tv/pair/poll?token=${encodeURIComponent(pair.token)}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (body.status === "paired" && body.sessionToken) {
          if (pollRef.current) clearInterval(pollRef.current);
          onPaired(body.sessionToken);
          return;
        }
        if (body.status === "expired") {
          setPair(null); // triggers the start effect again
        }
      } catch {
        // Soft — keep polling.
      }
    };
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pair, onPaired]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <div className="tv-root">
      <div className="tv-glow" />
      <div className="tv-unpaired">
        <div className="tv-up-grid">
          <div className="tv-up-left">
            <div className="tv-up-brand">
              <CompassMark />
              <span>Applivery Atlas</span>
            </div>
            <h1 className="tv-up-h1">Pair this screen</h1>
            <p className="tv-up-sub">
              Scan the QR with your phone, or enter the PIN at{" "}
              <span className="t-mono">app.applivery.com/pair</span> on a
              signed-in device.
            </p>
            <ol className="tv-up-steps">
              <li>
                <span className="tv-up-step-num">1</span>
                Open the camera on your phone
              </li>
              <li>
                <span className="tv-up-step-num">2</span>
                Scan the code → tap &ldquo;Pair this TV&rdquo;
              </li>
              <li>
                <span className="tv-up-step-num">3</span>
                The slideshow starts automatically
              </li>
            </ol>
            {error && (
              <p
                className="t-small"
                style={{
                  color: "var(--danger)",
                  background: "var(--danger-soft)",
                  padding: "8px 12px",
                  borderRadius: 10,
                }}
              >
                {error}
              </p>
            )}
          </div>
          <div className="tv-up-right">
            <div className="tv-up-qrcard">
              <div className="tv-up-qrwrap">
                {pair?.qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pair.qrDataUrl}
                    alt="Pair QR code"
                    width={260}
                    height={260}
                    style={{ display: "block" }}
                  />
                ) : (
                  <div style={{ width: 260, height: 260 }} />
                )}
              </div>
              <div className="tv-up-pin">
                <div
                  className="t-micro"
                  style={{ textAlign: "center", marginBottom: 6 }}
                >
                  Or use this PIN
                </div>
                <div className="tv-up-pin-val t-mono">
                  {pair ? formatPin(pair.pin) : "— — —"}
                </div>
                <div className="tv-up-pin-expiry">
                  expires in{" "}
                  <span className="t-mono">
                    {mm}:{String(ss).padStart(2, "0")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="tv-up-foot">
          <span className="tv-up-foot-l">
            <span className="badge badge-success">
              <span
                className="dot"
                style={{ animation: "pulse 2s ease-in-out infinite" }}
              />
              Waiting for pairing
            </span>
          </span>
          <span className="tv-up-foot-r t-mono">
            <Icons.TV size={11} /> {pair?.token.slice(0, 8).toLowerCase() ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "428901" → "428 901" */
function formatPin(pin: string): string {
  if (pin.length !== 6) return pin;
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

/**
 * Animated compass brand mark — fitting for "Atlas" on a screen that is
 * literally "waiting for pairing" (i.e. seeking). An inline SVG so the
 * pieces (glow, face, ticks, radar sweep, seeking needle, hub) animate
 * independently via CSS. All motion is paused under
 * `prefers-reduced-motion` (see screens.css).
 */
function CompassMark() {
  // 12 tick marks every 30°. The four cardinals are "major" (longer);
  // north (0°) is brand-tinted.
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <span className="tv-compass" aria-hidden="true">
      <svg
        className="tv-compass-svg"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="tv-compass-face" cx="38%" cy="32%" r="80%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="55%" stopColor="rgba(20,30,60,0.55)" />
            <stop offset="100%" stopColor="rgba(6,10,24,0.85)" />
          </radialGradient>
          <linearGradient id="tv-compass-needle" x1="50" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9CB8FF" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
          <radialGradient id="tv-compass-sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(124,165,255,0.45)" />
            <stop offset="100%" stopColor="rgba(124,165,255,0)" />
          </radialGradient>
        </defs>

        {/* Breathing glow halo */}
        <circle className="tv-compass-glow" cx="50" cy="50" r="44" />

        {/* Glassy face + rings */}
        <circle cx="50" cy="50" r="46" fill="url(#tv-compass-face)" />
        <circle
          className="tv-compass-ring"
          cx="50"
          cy="50"
          r="46"
          fill="none"
        />
        <circle
          className="tv-compass-ring-inner"
          cx="50"
          cy="50"
          r="37"
          fill="none"
        />

        {/* Rotating radar sweep wedge */}
        <g className="tv-compass-sweep">
          <path
            d="M50 50 L27 11 A46 46 0 0 1 73 11 Z"
            fill="url(#tv-compass-sweep)"
          />
        </g>

        {/* Tick marks */}
        <g className="tv-compass-ticks">
          {ticks.map((a) => {
            const major = a % 90 === 0;
            const north = a === 0;
            return (
              <line
                key={a}
                x1="50"
                y1={major ? 8 : 10}
                x2="50"
                y2={major ? 15 : 13}
                transform={`rotate(${a} 50 50)`}
                className={
                  north
                    ? "tv-compass-tick tv-compass-tick-n"
                    : major
                      ? "tv-compass-tick tv-compass-tick-major"
                      : "tv-compass-tick"
                }
              />
            );
          })}
        </g>

        {/* Seeking needle */}
        <g className="tv-compass-needle">
          <path d="M50 17 L56 50 L50 47 L44 50 Z" fill="url(#tv-compass-needle)" />
          <path d="M50 83 L44 50 L50 53 L56 50 Z" fill="rgba(255,255,255,0.32)" />
        </g>

        {/* Center hub */}
        <circle className="tv-compass-hub" cx="50" cy="50" r="4" />
        <circle className="tv-compass-hub-dot" cx="50" cy="50" r="1.6" />
      </svg>
    </span>
  );
}
