"use client";

import { useEffect, useState } from "react";

/**
 * Most chart libraries (Recharts) take hex / rgba
 * strings, not CSS custom properties. This hook resolves a list of design
 * system tokens to their current values so charts re-render correctly when
 * the theme attribute on `<html>` flips.
 */
export function useThemeTokens<T extends readonly string[]>(
  tokens: T,
): Record<T[number], string> {
  // Initial = empty strings so SSR markup matches CSR on first paint; the
  // effect below fills them on mount and on theme changes.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokens.map((t) => [t, ""])),
  );

  useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const t of tokens) {
        next[t] = styles.getPropertyValue(t).trim();
      }
      setValues(next);
    };
    read();

    // Re-read whenever the theme attribute on <html> changes.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
    // tokens is a tuple read at mount; we intentionally don't track changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return values as Record<T[number], string>;
}
