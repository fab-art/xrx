'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * ProgressRing — circular SVG progress indicator (donut chart).
 *
 * - The ring fills clockwise starting from the top (12 o'clock).
 * - The fill animates smoothly via a CSS transition on `stroke-dashoffset`,
 *   so any change to `value` (or mounting) tweens the ring to its new state.
 * - Children (typically a percentage label or icon) render centered inside.
 * - When `value >= max`, the ring stroke switches to a "complete" tint
 *   (defaults to var(--color-primary); override with the `completeStroke`
 *   prop). Consumers can detect completion via the `complete` boolean
 *   they compute themselves; this component simply mirrors the colors.
 */
export interface ProgressRingProps {
  /** Current value (>= 0). */
  value: number;
  /** Maximum value. Defaults to 100. */
  max?: number;
  /** Diameter in pixels. Defaults to 56. */
  size?: number;
  /** Stroke width in pixels. Defaults to 6. */
  strokeWidth?: number;
  /** Stroke color of the filled arc. Defaults to var(--color-primary). */
  stroke?: string;
  /** Stroke color of the background track. Defaults to var(--color-muted). */
  trackStroke?: string;
  /** Optional children rendered absolutely-centered inside the ring. */
  children?: ReactNode;
  /** Accessible label for screen readers (e.g. "60% of workflow complete"). */
  ariaLabel?: string;
}

export function ProgressRing({
  value,
  max = 100,
  size = 56,
  strokeWidth = 6,
  stroke = 'var(--color-primary)',
  trackStroke = 'var(--color-muted)',
  children,
  ariaLabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedMax = max > 0 ? max : 1;
  const rawPct = Math.max(0, Math.min(clampedMax, value)) / clampedMax;
  const pct = rawPct; // 0..1
  const isComplete = rawPct >= 1;

  // Animate the fill from 0 → pct on mount (and on subsequent pct changes,
  // the CSS transition handles the smooth tween).
  const [animatedPct, setAnimatedPct] = useState(0);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      // Defer one frame so the initial 0 offset renders before transitioning.
      requestAnimationFrame(() => {
        setAnimatedPct(pct);
        mountedRef.current = true;
      });
    } else {
      setAnimatedPct(pct);
    }
  }, [pct]);

  const dashOffset = circumference * (1 - animatedPct);
  const center = size / 2;

  const pctLabel = `${Math.round(pct * 100)}%`;
  const label = ariaLabel ?? `${Math.round(pct * 100)}% complete`;

  return (
    <div
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackStroke}
          strokeWidth={strokeWidth}
        />
        {/* Foreground arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isComplete ? 'var(--color-primary)' : stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease',
          }}
        />
      </svg>
      {/* Centered content */}
      {children !== undefined && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          {children}
        </div>
      )}
      {/* Visually hidden label for screen readers when no children */}
      {children === undefined && (
        <span className="sr-only">{pctLabel}</span>
      )}
    </div>
  );
}
