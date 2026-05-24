// Pin-echo glyphs — small target_pattern shapes that sit at a boss pin's tip
// (boss-label redesign PRD §"Pin glyphs"). Each glyph uses currentColor so the
// parent marker's color (orange, red when lethal, yellow when targets unset)
// flows through without per-glyph CSS.

import type { TargetPattern } from "@/domain/types";

const STROKE = 1;

const PATTERN_TITLE: Record<TargetPattern, string> = {
  raidwide: "Raidwide",
  tankbuster_single: "Single-target tankbuster",
  tankbuster_shared: "Shared tankbuster",
  spread: "Spread",
  stack: "Stack",
  targeted: "Targeted",
};

export function PinEchoGlyph({ pattern }: { pattern: TargetPattern }) {
  const title = PATTERN_TITLE[pattern];
  switch (pattern) {
    case "raidwide":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" role="img">
          <title>{title}</title>
          <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />
        </svg>
      );
    case "tankbuster_single":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" role="img">
          <title>{title}</title>
          <circle cx="5" cy="5" r="4" />
        </svg>
      );
    case "tankbuster_shared":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" role="img">
          <title>{title}</title>
          <circle cx="5" cy="5" r="3.2" />
          <circle cx="9" cy="5" r="3.2" />
        </svg>
      );
    case "spread":
      // Three triangles fanning out (up, lower-left, lower-right).
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" role="img">
          <title>{title}</title>
          <polygon points="6,0.5 7.4,3.5 4.6,3.5" />
          <polygon points="10.8,8 7.5,7 8,9.7" />
          <polygon points="1.2,8 4.5,7 4,9.7" />
        </svg>
      );
    case "stack":
      // Concentric: stroke ring + filled center dot.
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" role="img">
          <title>{title}</title>
          <circle
            cx="5"
            cy="5"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE * 1.2}
          />
          <circle cx="5" cy="5" r="1.4" fill="currentColor" />
        </svg>
      );
    case "targeted":
      // Crosshair: circle + four ticks.
      return (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          role="img"
        >
          <title>{title}</title>
          <circle cx="5" cy="5" r="3" />
          <line x1="5" y1="0.5" x2="5" y2="2" />
          <line x1="5" y1="8" x2="5" y2="9.5" />
          <line x1="0.5" y1="5" x2="2" y2="5" />
          <line x1="8" y1="5" x2="9.5" y2="5" />
        </svg>
      );
  }
}
