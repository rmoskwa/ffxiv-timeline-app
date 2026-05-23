// Fixed-zoom v0.1 (PRD §18 open question — parked as fixed + horizontal scroll).
// Revisit when zoom controls land in v0.2.

export const PX_PER_SEC = 12;
export const LANE_DURATION_SEC = 600; // 10-minute default canvas
export const TICK_INTERVAL_SEC = 30; // minor tick every 30s
export const LABEL_INTERVAL_SEC = 60; // labeled tick every 60s
export const LANE_WIDTH_PX = LANE_DURATION_SEC * PX_PER_SEC;

// dnd-kit drag-data type tags. Lets onDragEnd route on what kind of payload was dropped.
export const DRAG_TYPE_BOSS_ABILITY_TYPE = "boss-ability-type" as const;
export const DROP_TARGET_BOSS_LANE = "boss-lane" as const;
export const DRAG_TYPE_MIT = "mit" as const;
export const DROP_TARGET_PLAYER_LANE = "player-lane" as const;

export function secondsToTimecode(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
