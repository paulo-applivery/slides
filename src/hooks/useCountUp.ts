"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a numeric value from its previous render to the next over `duration`
 * milliseconds, using an ease-out cubic. Used by KPI displays and the gauge.
 *
 * Lifted from the prototype's widgets.jsx so the visual behaviour stays
 * identical.
 *
 * Pass `introFromZero` to make the very first render an intro: the display
 * starts at 0 (on both server and client, so hydration matches) and counts
 * up to `value` once mounted. Honours `prefers-reduced-motion` by snapping
 * straight to the target.
 */
export function useCountUp(
  value: number,
  duration = 900,
  introFromZero = false,
): number {
  const initial = introFromZero ? 0 : value;
  const [display, setDisplay] = useState(initial);
  const state = useRef({ from: initial, to: value, start: 0 });

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }
    state.current.from = display;
    state.current.to = value;
    state.current.start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - state.current.start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v =
        state.current.from + (state.current.to - state.current.from) * eased;
      setDisplay(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // We intentionally only react to `value`; `display` is a derived state
    // we read at the moment the animation starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}
