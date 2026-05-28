"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * App-shell theme preference.
 *
 * After the appearance rework this provider owns only light/dark/system
 * for the app shell (lists, settings, the dashboards index — pages that
 * don't carry their own theme). Per-dashboard theme overrides it while a
 * dashboard is on screen (see `DashboardThemeControl`), and per-slide
 * flair (background / glass / brand) lives on the slide for TV playback.
 *
 * Persistence: `localStorage`, per-browser.
 */
export type ThemePref = "light" | "dark" | "system";

export type Appearance = {
  theme: ThemePref;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
};

type Ctx = {
  appearance: Appearance;
  setAppearance: (next: Partial<Appearance>) => void;
  /** Effective theme after resolving "system". */
  resolved: "light" | "dark";
};

const ThemeCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "applivery.appearance.v1";

function readStored(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [systemDark, setSystemDark] = useState(false);

  // Hydrate from localStorage post-mount. We can't read it during SSR or
  // initial render — that would force a client-only barrier for the
  // entire app shell. The brief flash of default theme is fine.
  useEffect(() => {
    setAppearanceState(readStored());
    setSystemDark(
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setAppearanceState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage is full / disabled — silent skip; in-memory state
        // is still consistent for the session.
      }
      return next;
    });
  }, []);

  const resolved: "light" | "dark" =
    appearance.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : appearance.theme;

  // Reflect the resolved shell theme onto <html> so design-system CSS
  // variables (in tokens.css) pick it up across pages without their own
  // theme. Dashboard pages and TV mode set data-theme themselves and raise
  // `data-theme-locked` while mounted; we must not clobber them. On a full
  // page load this provider's effect fires *after* the deeper page effect
  // (React runs child effects first), so without the lock check the shell
  // theme would overwrite a dark dashboard back to light.
  useEffect(() => {
    const html = document.documentElement;
    if (html.hasAttribute("data-theme-locked")) return;
    html.setAttribute("data-theme", resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({ appearance, setAppearance, resolved }),
    [appearance, setAppearance, resolved],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppearance(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // SSR / outside-of-provider fallback so server components don't crash.
    return {
      appearance: DEFAULT_APPEARANCE,
      setAppearance: () => {},
      resolved: "light",
    };
  }
  return ctx;
}
