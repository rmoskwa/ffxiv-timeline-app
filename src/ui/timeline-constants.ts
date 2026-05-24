// Timeline canvas geometry & zoom ladder.
//
// Zoom is reactive (see `use-zoom.ts`); the px/s value is read at render time
// by every renderer that positions or sizes by time. Lane duration is fixed
// per v0.1 (PRD §13.2). Only px/s scales.

export const LANE_DURATION_SEC = 600; // 10-minute default canvas

// Zoom bounds. DEFAULT_PX_PER_SEC = 12 matches the prior fixed zoom so existing
// layouts feel unchanged on first launch. MIN fits the full 10-min lane in a
// ~600px viewport; MAX gives ~80px per second for sub-second placement work.
export const MIN_PX_PER_SEC = 1;
export const MAX_PX_PER_SEC = 80;
export const DEFAULT_PX_PER_SEC = 12;

// Step factor for header [−] / [+] buttons and per-wheel-notch zoom.
// 1.25 → 3 clicks ≈ 2×, smooth enough to scrub through zoom levels.
export const ZOOM_BUTTON_FACTOR = 1.25;
export const ZOOM_WHEEL_FACTOR = 1.1;

// Tick ladder. Renderer picks the smallest interval that yields ≥ MIN_TICK_GAP_PX
// between ticks. Label every Nth tick (next ladder step up) so labels don't crowd.
const TICK_LADDER: readonly number[] = [1, 5, 15, 30, 60] as const;
const MIN_TICK_GAP_PX = 50;

export function pickTickIntervalSec(pxPerSec: number): number {
  for (const t of TICK_LADDER) {
    if (t * pxPerSec >= MIN_TICK_GAP_PX) return t;
  }
  return TICK_LADDER[TICK_LADDER.length - 1] ?? 60;
}

export function pickLabelIntervalSec(tickIntervalSec: number): number {
  const idx = TICK_LADDER.indexOf(tickIntervalSec);
  if (idx < 0 || idx >= TICK_LADDER.length - 1) return tickIntervalSec;
  return TICK_LADDER[idx + 1] ?? tickIntervalSec;
}

export function clampZoom(pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec)) return DEFAULT_PX_PER_SEC;
  return Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pxPerSec));
}

// v0.1 heatmap: party-wide HP constant (PRD §6.1 — real per-job HP deferred).
// A hit is "lethal" if any player's post-mit damage ≥ PLAYER_MAX_HP.
export const PLAYER_MAX_HP = 100_000;

export function secondsToTimecode(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Snap a viewport-relative cursor X to the nearest whole second within the lane,
// clamped to the lane bounds. Shared by every click-to-place / hover-ghost
// renderer so click commits and ghost previews always agree.
export function snapClientXToSecond(
  cursorClientX: number,
  laneLeft: number,
  pxPerSec: number,
): number {
  const offsetX = cursorClientX - laneLeft;
  return Math.max(0, Math.min(LANE_DURATION_SEC, Math.round(offsetX / pxPerSec)));
}
