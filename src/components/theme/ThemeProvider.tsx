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
 * App-level appearance prefs.
 *
 * All four pieces are owned by a single client provider so the toggles
 * in the topbar settings menu can flip them in lockstep:
 *
 *   - theme  → light | dark | system
 *   - background → null | pixelBlast | softAurora | iridescence
 *   - glassCards → bool (translucent widget surfaces + backdrop blur)
 *   - brandColor → hex; the seeded brand stays the default, but the
 *                  operator can override and the WebGL backgrounds
 *                  pick it up via the color prop.
 *
 * Persistence: `localStorage` keyed per-browser. Not per-workspace yet
 * because the TV needs the choice to follow the dashboard, and we
 * already pair via cookies — that's a follow-up if the user wants
 * shared workspace prefs.
 */
export type ThemePref = "light" | "dark" | "system";
export type BackgroundEffect = null | "pixelBlast" | "softAurora" | "iridescence";

export type Appearance = {
  theme: ThemePref;
  background: BackgroundEffect;
  glassCards: boolean;
  brandColor: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  background: null,
  glassCards: false,
  brandColor: "#5C8BFF",
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

  // Reflect resolved theme + brand color onto <html> so design-system
  // CSS variables (in tokens.css) pick them up everywhere. The brand
  // color override is exposed as both `--brand` and `--primary` since
  // some chart components key off one and not the other.
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", resolved);
    if (appearance.brandColor !== DEFAULT_APPEARANCE.brandColor) {
      html.style.setProperty("--brand", appearance.brandColor);
      html.style.setProperty("--primary", appearance.brandColor);
    } else {
      html.style.removeProperty("--brand");
      html.style.removeProperty("--primary");
    }
    if (appearance.glassCards) {
      html.setAttribute("data-glass", "on");
    } else {
      html.removeAttribute("data-glass");
    }
  }, [resolved, appearance.brandColor, appearance.glassCards]);

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
