/**
 * YouTube IFrame Player API loader + minimal typings.
 *
 * TV / kiosk browsers (Tizen, webOS, Android TV, Fire stick) routinely
 * ignore URL-param muted autoplay (`autoplay=1&mute=1`), leaving the embed
 * a black frame that never starts. Driving the player through the IFrame
 * API and calling `playVideo()` explicitly on `onReady` is the established
 * way to get reliable unattended playback — and `onError` lets us surface a
 * message instead of a silent black screen when a video can't be embedded.
 *
 * The API script exposes a single global `onYouTubeIframeAPIReady` callback,
 * so we load it once and hand every caller the same resolved namespace.
 */

export interface YTPlayer {
  playVideo(): void;
  mute(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

export interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onStateChange?: (e: YTPlayerEvent) => void;
    onError?: (e: YTPlayerEvent) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Resolve the YouTube IFrame API namespace, loading the script once. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    // Never resolves during SSR; the effect that awaits it only runs client-side.
    return new Promise<YTNamespace>(() => {});
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve) => {
    // Chain in case something else already registered the global callback.
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

export type { YTNamespace };
