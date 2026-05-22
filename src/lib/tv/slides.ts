/**
 * Slide-type helpers — URL parsing + validation used by the editor and TV
 * renderer.
 */

/**
 * Extract a YouTube video id from any of the common URL shapes:
 *   - https://www.youtube.com/watch?v=abc123
 *   - https://youtu.be/abc123
 *   - https://www.youtube.com/embed/abc123
 *   - https://m.youtube.com/watch?v=abc123
 *   - https://www.youtube.com/shorts/abc123
 *
 * Returns `null` when the URL doesn't smell like YouTube.
 */
export function parseYoutubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return id || null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const m = url.pathname.match(/^\/(embed|shorts)\/([\w-]{6,})/);
    if (m) return m[2];
  }
  return null;
}

/**
 * Loose validation for a web URL that's safe to drop in an iframe — must be
 * a syntactically valid http(s) URL. We can't pre-check `X-Frame-Options`
 * server-side (CORS) so the TV renderer falls back to a card if the iframe
 * never loads.
 */
export function validateExternalUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a URL." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are allowed." };
  }
  return { ok: true, url: url.toString() };
}

/**
 * Build the YouTube embed URL with the right query params for an unattended
 * TV: autoplay on, sound off, loop, no controls / branding.
 */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: videoId, // required for `loop=1` to work
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
