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
// Tests in simple-grid-placement.test.ts.

// Matches GATED_CHILD_MIN_GAP_SECONDS in MitBar.tsx / MitInspectorPanel.tsx.
const GATED_CHILD_MIN_GAP_SECONDS = 2;

export interface ChildAnchorParams {
  // Parent instance effect_time, in seconds — the zone origin.
  parentEffectTime: number;
  // Child's execution zone length (execution_zone_seconds ?? parent duration).
  execZoneSeconds: number;
  // Fight length, in seconds; placement never lands past it. Infinity if unset.
  fightDurationSec: number;
  // effect_time of every OTHER charge of the same child (gap exclusion).
  siblingEffectTimes: readonly number[];
  // The child's current Home row index — excluded (it stays the solid selected
  // chip). null when the child covers no hit. Every other legal hit is a target.
  homeHitIndex: number | null;
}

// Returns the indices into `hitTimes` that are legal re-anchor targets,
// ascending. `hitTimes` is ascending in display order (the caller sorts).
export function legalChildAnchorRows(
  hitTimes: readonly number[],
  params: ChildAnchorParams,
): number[] {
  const zoneMin = params.parentEffectTime + 1;
  const zoneMax = Math.min(
    params.parentEffectTime + params.execZoneSeconds - 1,
    params.fightDurationSec,
  );
  const rows: number[] = [];
  for (let i = 0; i < hitTimes.length; i++) {
    if (i === params.homeHitIndex) continue;
    const h = hitTimes[i];
    if (h === undefined || h < zoneMin || h > zoneMax) continue;
    if (params.siblingEffectTimes.some((s) => Math.abs(h - s) < GATED_CHILD_MIN_GAP_SECONDS)) {
      continue;
    }
    rows.push(i);
  }
  return rows;
}
