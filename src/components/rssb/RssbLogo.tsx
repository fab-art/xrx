'use client';

/**
 * RSSB (Rwanda Social Security Board) logo — now renders the official logo
 * photograph (public/rssb-emblem.png and public/rssb-logo.png) instead of an
 * SVG recreation.
 *
 * Two variants:
 *  - Emblem only (default, `withTagline=false`): uses /rssb-emblem.png
 *    (square crop of just the circular emblem — best for sidebars, headers,
 *     favicons, small sizes).
 *  - Full logo with tagline (`withTagline=true`): uses /rssb-logo.png
 *    (circular emblem + "Our Health Our Future" wordmark).
 *
 * Both source PNGs have a transparent background so they render cleanly on
 * light and dark surfaces.
 */

type RssbLogoProps = {
  /** Height of the emblem in pixels (width auto-scales). Default 40. */
  size?: number;
  /** Show the full logo including the "Our Health / Our Future" tagline. */
  withTagline?: boolean;
  /** Extra className on the wrapping element. */
  className?: string;
};

export function RssbLogo({
  size = 40,
  withTagline = false,
  className = '',
}: RssbLogoProps) {
  const src = withTagline ? '/rssb-logo.png' : '/rssb-emblem.png';
  // Full logo is ~1.83× wider than tall (600×327); emblem is square.
  const width = withTagline ? Math.round(size * (600 / 327)) : size;

  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src={src}
        alt="RSSB — Rwanda Social Security Board"
        width={width}
        height={size}
        className="shrink-0 select-none"
        style={{ width, height: size }}
        draggable={false}
      />
    </span>
  );
}

/**
 * Compact square "mark" version — alias of the emblem, kept for backwards
 * compatibility with components that imported `RssbMark`.
 */
export function RssbMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/rssb-emblem.png"
      alt="RSSB mark"
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
