import { useEffect, useRef, useState } from 'react';

/**
 * useCountUp — animates a number from its previous value to the target value
 * using requestAnimationFrame with an easeOutCubic curve.
 *
 * - Skips animation entirely (returns the target immediately) when the user
 *   prefers reduced motion.
 * - Restarts from the current animated value when the target changes, so
 *   transitions between values stay smooth (no jarring jump back to 0).
 */
export function useCountUp(target: number, durationMs = 800): number {
  const [display, setDisplay] = useState<number>(0);
  const fromRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef<boolean>(false);

  // Detect reduced-motion preference once on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    // Skip animation under reduced-motion preference — jump straight to target.
    if (prefersReducedMotionRef.current) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    // No-op if the target is unchanged.
    if (from === target) {
      setDisplay(target);
      return;
    }
    // For tiny deltas or non-finite targets, skip animation for safety.
    if (!Number.isFinite(target) || Math.abs(target - from) < 0.5) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const start = performance.now();
    startRef.current = start;
    const delta = target - from;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const next = from + delta * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    // Cancel any in-flight animation and kick off a new one.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Persist the latest display as the starting point for the next run.
      fromRef.current = display;
    };
  }, [target, durationMs]);

  return display;
}

/**
 * useCountUpFormatted — convenience wrapper that animates a number and formats
 * it with `toLocaleString()` on every frame, for currency-style displays.
 */
export function useCountUpFormatted(target: number, durationMs = 800): string {
  const value = useCountUp(target, durationMs);
  // Use Math.round so we don't show fractional currency mid-animation.
  return Math.round(value).toLocaleString();
}
