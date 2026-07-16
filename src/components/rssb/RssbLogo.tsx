/**
 * RSSB (Rwanda Social Security Board) logo — circular emblem.
 *
 * Design (from reference):
 *  - Outer orange ring with curved text "RWANDA SOCIAL" (top) / "SECURITY BOARD" (bottom)
 *  - 16-ray orange sunburst radiating from the center
 *  - Inner white circle
 *  - Horizontal deep-blue bar (#0033A0) with bold white "RSSB"
 *  - Optional tagline "Our Health Our Future" rendered to the right
 *
 * Pure SVG — scales to any size via the `size` prop.
 */

type RssbLogoProps = {
  /** Diameter of the circular emblem in pixels. Default 40. */
  size?: number;
  /** Show the "Our Health / Our Future" tagline to the right of the emblem. */
  withTagline?: boolean;
  /** Tagline text size in pixels. Default 11. */
  taglineSize?: number;
  /** Extra className on the wrapping element. */
  className?: string;
  /** Use the simplified compact mark (no curved outer text) — better at tiny sizes. */
  compact?: boolean;
};

export function RssbLogo({
  size = 40,
  withTagline = false,
  taglineSize = 11,
  className = '',
  compact = false,
}: RssbLogoProps) {
  // Brand palette
  const orange = '#F59E0B';      // sunburst + outer ring
  const orangeDeep = '#D97706';  // ray shadow
  const blue = '#1E3A8A';        // center bar (deep professional blue)
  const white = '#FFFFFF';

  // Sunburst: 16 triangular rays around the center.
  const rays = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * 360) / 16;
    return (
      <path
        key={`ray-${i}`}
        d="M 50 50 L 54 8 L 46 8 Z"
        fill={orange}
        transform={`rotate(${angle} 50 50)`}
        opacity={0.92}
      />
    );
  });

  const emblem = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="RSSB — Rwanda Social Security Board"
      className="shrink-0"
    >
      <defs>
        {/* Curved text paths */}
        <path id="rssb-top-arc" d="M 14 50 A 36 36 0 0 1 86 50" fill="none" />
        <path id="rssb-bottom-arc" d="M 86 50 A 36 36 0 0 1 14 50" fill="none" />
        <radialGradient id="rssb-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={orange} stopOpacity="0.35" />
          <stop offset="70%" stopColor={orange} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft glow behind sunburst */}
      <circle cx="50" cy="50" r="48" fill="url(#rssb-sun-glow)" />

      {/* Outer ring */}
      <circle cx="50" cy="50" r="46" fill="none" stroke={orange} strokeWidth="2.5" />

      {/* Curved outer text (hidden in compact mode) */}
      {!compact && (
        <>
          <text
            fill={orange}
            fontSize="7"
            fontWeight="700"
            letterSpacing="1.4"
            fontFamily="Inter, system-ui, sans-serif"
          >
            <textPath href="#rssb-top-arc" startOffset="50%" textAnchor="middle">
              RWANDA SOCIAL
            </textPath>
          </text>
          <text
            fill={orange}
            fontSize="7"
            fontWeight="700"
            letterSpacing="1.4"
            fontFamily="Inter, system-ui, sans-serif"
          >
            <textPath href="#rssb-bottom-arc" startOffset="50%" textAnchor="middle">
              SECURITY BOARD
            </textPath>
          </text>
        </>
      )}

      {/* Sunburst rays (sit between outer ring and inner disc) */}
      <g>{rays}</g>

      {/* Inner white disc */}
      <circle cx="50" cy="50" r="20" fill={white} />

      {/* Deep-blue horizontal bar with RSSB */}
      <rect x="22" y="42.5" width="56" height="15" rx="2.5" fill={blue} />
      <text
        x="50"
        y="53.5"
        textAnchor="middle"
        fill={white}
        fontSize="11"
        fontWeight="800"
        letterSpacing="0.5"
        fontFamily="Inter, system-ui, sans-serif"
      >
        RSSB
      </text>

      {/* Subtle ray depth accent */}
      <circle cx="50" cy="50" r="20" fill="none" stroke={orangeDeep} strokeWidth="0.6" opacity="0.5" />
    </svg>
  );

  if (!withTagline) {
    return <span className={`inline-flex ${className}`}>{emblem}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {emblem}
      <span className="flex flex-col leading-tight" style={{ fontSize: taglineSize }}>
        <span className="font-bold tracking-tight text-foreground" style={{ fontSize: taglineSize + 1 }}>
          Our Health
        </span>
        <span className="font-medium text-muted-foreground" style={{ fontSize: taglineSize - 1 }}>
          Our Future
        </span>
      </span>
    </span>
  );
}

/**
 * Compact square "mark" version — a rounded tile containing the sunburst + RSSB bar.
 * Used as the sidebar / header avatar when the full circular emblem is too detailed.
 */
export function RssbMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  const orange = '#F59E0B';
  const blue = '#1E3A8A';
  const white = '#FFFFFF';

  const rays = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 360) / 12;
    return (
      <path
        key={`mark-ray-${i}`}
        d="M 50 50 L 53 6 L 47 6 Z"
        fill={orange}
        transform={`rotate(${angle} 50 50)`}
        opacity={0.95}
      />
    );
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="RSSB mark"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="rssb-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F1123" />
        </linearGradient>
      </defs>
      {/* Rounded tile background */}
      <rect x="0" y="0" width="100" height="100" rx="22" fill="url(#rssb-mark-bg)" />
      {/* Sunburst */}
      <g>{rays}</g>
      {/* Inner disc */}
      <circle cx="50" cy="50" r="22" fill={white} />
      {/* RSSB bar */}
      <rect x="24" y="42" width="52" height="16" rx="3" fill={blue} />
      <text
        x="50"
        y="53.8"
        textAnchor="middle"
        fill={white}
        fontSize="11"
        fontWeight="800"
        letterSpacing="0.4"
        fontFamily="Inter, system-ui, sans-serif"
      >
        RSSB
      </text>
    </svg>
  );
}
