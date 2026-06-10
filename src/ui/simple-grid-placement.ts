// Legal re-anchor targets for a gated child in the Simple Timeline View. When a
// child chip is selected, the grid offers to move it onto a boss-hit row; this
// computes which rows are valid. The zone bounds (+1s from the parent's cast,
// -1s from the zone end, never past the timeline edge) and the 2s GCD-floor
// sibling gap come from the shared Placement module (domain/placement.ts) —
// the same rules the canvas drag clamp uses, so the two can't drift.
//
// Pure scalar module per docs/adr/0001-view-layer-pure-modules.md: takes hit
// times and pre-resolved scalars only (the Placement imports are themselves
// scalar-pure). Only the child's current Home row is excluded — every other
// legal hit is a re-anchor target, including ones the child currently covers
// (the React shell turns those rows' Coverage markers into slots). See
// docs/adr/0002-simple-view-live-projection.md.
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

import { childZoneBounds, GATED_CHILD_MIN_GAP_SECONDS } from "@/domain/placement";

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
  const { minSec: zoneMin, maxSec: zoneMax } = childZoneBounds(
    params.parentEffectTime,
    params.execZoneSeconds,
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

// Recompute a gated child's co-located stack after a Simple-view re-anchor or
// removal. The parent's Home hit T is the stable anchor: charges at or before it
// (effectTime ≤ T) are "co-located" — they ride the parent's row — while charges
// past it sit "away" on their own hit. The −2s-per-co-located-charge shift is
// re-derived from how many charges remain co-located, so the parent slides up
// as charges leave the stack and back down as they return (e.g. SCH
// Summon Seraph rides T−4 with two Consolations and bumps to T−2 when one
// leaves). The parent lands at T − 2·(co-located count); the co-located charges
// fill the tight 2s stack ending exactly on T; away charges keep their time.
//
// `charges` is the POST-operation set of this child type under the parent — the
// moved charge carries its new effectTime; a removed charge is simply absent.
// Returns the effect_time each affected instance should be written to, parent
// included. This is the Simple-view-only inverse of the store's parent→child
// gluing; the canvas never calls it. Tests in simple-grid-placement.test.ts.
export function restackGatedChildren(
  parentId: string,
  parentHomeTime: number,
  charges: readonly { id: string; effectTime: number }[],
): { id: string; effectTime: number }[] {
  const away = charges.filter((c) => c.effectTime > parentHomeTime);
  const coLocated = charges
    .filter((c) => c.effectTime <= parentHomeTime)
    .sort((a, b) => a.effectTime - b.effectTime);
  const parentEffectTime = parentHomeTime - 2 * coLocated.length;
  const updates = [{ id: parentId, effectTime: parentEffectTime }];
  coLocated.forEach((c, i) => {
    updates.push({ id: c.id, effectTime: parentEffectTime + 2 * (i + 1) });
  });
  for (const c of away) updates.push({ id: c.id, effectTime: c.effectTime });
  return updates;
}
