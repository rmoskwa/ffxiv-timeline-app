// Legal re-anchor targets for a gated child in the Simple Timeline View. When a
// child chip is selected, the grid offers to move it onto a boss-hit row; this
// computes which rows are valid. Mirrors the canvas drag clamp (MitBar.tsx):
// the child can't share the parent's cast (+1s start) or sit on the last legal
// frame of the zone (-1s end), can't sit within the 2s GCD-floor gap of a
// sibling charge, and never past the timeline edge.
//
// Pure scalar module per docs/adr/0001-view-layer-pure-modules.md: takes hit
// times and pre-resolved scalars only. Only the child's current Home row is
// excluded — every other legal hit is a re-anchor target, including ones the
// child currently covers (the React shell turns those rows' Coverage markers
// into slots). See docs/adr/0002-simple-view-live-projection.md.
//
// Two kinds of legal row:
//   • Activation row — a hit inside the zone [zoneMin, zoneMax]. The child is
//     placed at the hit itself (effectTime === hit time).
//   • Coverage-only row — a hit just past the zone end (zoneMax < hit ≤ zoneMax
//     + durationSec) that the child's active window can still reach. The child
//     is placed inside the zone at hit − durationSec (clamped into the zone), so
//     the clicked hit lands at the TAIL of the active window. Offered only when
//     no other hit falls between the placed time and the clicked hit, so the
//     clicked hit is the child's First covered hit (its solid Home chip).
//
// Each legal row carries the effectTime the caller should write to the child's
// effect_time when that row is clicked.
//
// Tests in simple-grid-placement.test.ts.

// Matches GATED_CHILD_MIN_GAP_SECONDS in MitBar.tsx / MitInspectorPanel.tsx.
const GATED_CHILD_MIN_GAP_SECONDS = 2;

export interface ChildAnchorParams {
  // Parent instance effect_time, in seconds — the zone origin.
  parentEffectTime: number;
  // Child's execution zone length (execution_zone_seconds ?? parent duration).
  execZoneSeconds: number;
  // Child's active window length (duration_seconds) — reaches coverage-only rows.
  durationSec: number;
  // Fight length, in seconds; placement never lands past it. Infinity if unset.
  fightDurationSec: number;
  // effect_time of every OTHER charge of the same child (gap exclusion).
  siblingEffectTimes: readonly number[];
  // The child's current Home row index — excluded (it stays the solid selected
  // chip). null when the child covers no hit. Every other legal hit is a target.
  homeHitIndex: number | null;
}

// Returns the legal re-anchor targets, ascending by hitIndex. Each carries the
// effectTime to write to the child's effect_time when that row is clicked.
// `hitTimes` is ascending in display order (the caller sorts).
export function legalChildAnchorRows(
  hitTimes: readonly number[],
  params: ChildAnchorParams,
): { hitIndex: number; effectTime: number }[] {
  const zoneMin = params.parentEffectTime + 1;
  const zoneMax = Math.min(
    params.parentEffectTime + params.execZoneSeconds - 1,
    params.fightDurationSec,
  );
  const rows: { hitIndex: number; effectTime: number }[] = [];
  for (let i = 0; i < hitTimes.length; i++) {
    if (i === params.homeHitIndex) continue;
    const h = hitTimes[i];
    if (h === undefined) continue;
    if (h >= zoneMin && h <= zoneMax) {
      // Activation row: placed at the hit itself.
      if (params.siblingEffectTimes.some((s) => Math.abs(h - s) < GATED_CHILD_MIN_GAP_SECONDS)) {
        continue;
      }
      rows.push({ hitIndex: i, effectTime: h });
    } else if (h > zoneMax && h <= zoneMax + params.durationSec) {
      // Coverage-only row: placed inside the zone so the hit lands at the tail
      // of the active window.
      const ef = Math.min(zoneMax, Math.max(zoneMin, h - params.durationSec));
      // Clear gate: the clicked hit must be the child's First covered hit, so no
      // hit may fall between the placed time and it.
      if (hitTimes.some((t) => t >= ef && t < h)) continue;
      if (params.siblingEffectTimes.some((s) => Math.abs(ef - s) < GATED_CHILD_MIN_GAP_SECONDS)) {
        continue;
      }
      rows.push({ hitIndex: i, effectTime: ef });
    }
  }
  return rows;
}
