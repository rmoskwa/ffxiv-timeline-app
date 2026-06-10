// Placement legality — "where may this Bar go?"
//
// One module owns every rule about where a mitigation instance may sit on a
// (player slot, mit type) sub-lane:
//   • charge-row bucketing (sticky charge_row, derived fallback),
//   • same-row neighbors blocking by their EFFECTIVE footprint
//     (max of effective cooldown and active duration),
//   • shared-recast partners blocking every charge-row for their effective
//     cooldown window,
//   • the drag clamp range for an existing Bar (row neighbors, partners,
//     offset-glued children, the timeline edge),
//   • the execution-zone bounds and 2s GCD-floor gap for gated children.
//
// The canvas hover ghost / click placement (MitSubLane), the drag clamps
// (MitBar), and the Simple Timeline View's Mit picker availability
// (SimpleGridMitPicker) are thin adapters over these functions, so the two
// views can never disagree about what is legal — by construction, not by
// hand-kept parallel copies. See docs/adr/0002-simple-view-live-projection.md.
//
// Pure domain module: seconds in, seconds out — no pixels, no React. The
// mit-library lookup is injected (MitTypeLookup), as in damage.ts.
// Bounds-checking of a raw cursor position and snapping are NOT this module's
// concern — the canvas snaps before calling; the Mit picker places at an
// exact hit time and never snaps.
//
// Tests in placement.test.ts.

import { assignChargeRows } from "./charges";
import {
  effectiveBarFootprintSeconds,
  effectiveCooldownSeconds,
  type MitInstanceState,
  type MitTypeLookup,
} from "./damage";
import type { MitigationInstance, MitigationType } from "./types";

// Multi-charge gated children (today: SCH Consolation) must keep a 2s gap
// between their casts — the SCH GCD floor. If a future child adds itself
// with max_charges > 1, lift this into a type-level field.
export const GATED_CHILD_MIN_GAP_SECONDS = 2;

// A half-open [startSec, endSec) span that blocks placement: a same-(slot,
// type) neighbor's effective footprint, or a shared-recast partner's
// effective cooldown window.
export interface BlockingInterval {
  startSec: number;
  endSec: number;
}

// Pure scalar core: the candidate placement occupies [candidateSec,
// candidateSec + footprintSec); legal iff it overlaps no blocker.
export function isPlacementLegal(
  candidateSec: number,
  footprintSec: number,
  blockers: readonly BlockingInterval[],
): boolean {
  const candidateEnd = candidateSec + footprintSec;
  for (const b of blockers) {
    if (candidateSec < b.endSec && candidateEnd > b.startSec) return false;
  }
  return true;
}

// Bucket one sub-lane's placements into charge-rows. Sticky row-of-record:
// instance.charge_row when set and in range (placements from the current
// schema); derived chronologically when not (loaded saves pre-dating the
// field). The derived fallback only fires when charge_row is undefined —
// surviving placements never re-flow onto other rows just because a neighbor
// was deleted.
export function chargeRowBuckets(
  laneInstances: readonly MitigationInstance[],
  mitType: MitigationType,
): MitigationInstance[][] {
  const derived = assignChargeRows(laneInstances, mitType);
  const maxRow = Math.max(1, mitType.max_charges);
  const buckets: MitigationInstance[][] = Array.from({ length: maxRow }, () => []);
  for (const inst of laneInstances) {
    const sticky = inst.charge_row;
    const rowIdx =
      sticky !== undefined && sticky >= 0 && sticky < maxRow
        ? sticky
        : (derived.get(inst.id)?.rowIndex ?? 0);
    buckets[rowIdx]?.push(inst);
  }
  return buckets;
}

export interface SubLanePlacementArgs {
  mitType: MitigationType;
  slotId: string;
  // Same-(slot, type) placements on this sub-lane, resolved by the caller.
  laneInstances: readonly MitigationInstance[];
  // Shared-recast partner types of mitType (getSharedRecastPartners at the seam).
  partnerTypes: readonly MitigationType[];
  allMits: readonly MitigationInstance[];
  lookupMitType: MitTypeLookup;
  mitStates: ReadonlyMap<string, MitInstanceState>;
}

export interface SubLanePlacement {
  // Footprint a NEW placement of this type occupies: max(cooldown, duration)
  // from the data values — worst case, since the new placement's eventual
  // absorption state is unknown until a boss hit interacts with it.
  footprintSec: number;
  // Charge-row buckets (chargeRowBuckets).
  rows: readonly (readonly MitigationInstance[])[];
  // Per row, parallel to rows[i]: each placement's effective-footprint span.
  // Effective = max(effective CD, active duration), so a shrunken bar (e.g. a
  // Tempera Coat whose shield was absorbed) frees up the space behind it, and
  // a buff whose active window exceeds its CD (Holy Sheltron) still blocks
  // its entire active period.
  rowBlockers: readonly (readonly BlockingInterval[])[];
  // Shared-recast partner placements on this slot, parallel to partnerWindows.
  partnerInstances: readonly MitigationInstance[];
  // Each partner's effective cooldown window — these block every charge-row.
  // Partner active duration is irrelevant: the two mits never share an active
  // window (one is always locked when the other is cast), so only its CD.
  partnerWindows: readonly BlockingInterval[];
}

// Resolve everything legality needs to know about one (slot, mit type)
// sub-lane. The result is a plain value — query it with legalRowPlacement /
// firstLegalRow / blockedUntilSec, or read the intervals directly to paint.
export function resolveSubLanePlacement(args: SubLanePlacementArgs): SubLanePlacement {
  const { mitType, slotId, laneInstances, partnerTypes, allMits, lookupMitType, mitStates } = args;
  const rows = chargeRowBuckets(laneInstances, mitType);
  const rowBlockers = rows.map((row) =>
    row.map((m) => ({
      startSec: m.effect_time,
      endSec:
        m.effect_time + effectiveBarFootprintSeconds(m, mitType, allMits, lookupMitType, mitStates),
    })),
  );
  const partnerInstances: MitigationInstance[] = [];
  const partnerWindows: BlockingInterval[] = [];
  if (partnerTypes.length > 0) {
    for (const m of allMits) {
      if (m.player_slot_id !== slotId) continue;
      if (!partnerTypes.some((p) => p.id === m.type_id)) continue;
      const t = lookupMitType(m.type_id);
      if (!t) continue;
      partnerInstances.push(m);
      partnerWindows.push({
        startSec: m.effect_time,
        endSec: m.effect_time + effectiveCooldownSeconds(m, t, allMits, lookupMitType, mitStates),
      });
    }
  }
  return {
    footprintSec: Math.max(mitType.cooldown_seconds, mitType.duration_seconds),
    rows,
    rowBlockers,
    partnerInstances,
    partnerWindows,
  };
}

// Is placing a NEW instance at candidateSec legal on the given charge-row?
export function legalRowPlacement(
  placement: SubLanePlacement,
  rowIndex: number,
  candidateSec: number,
): boolean {
  const blockers = [...(placement.rowBlockers[rowIndex] ?? []), ...placement.partnerWindows];
  return isPlacementLegal(candidateSec, placement.footprintSec, blockers);
}

// First charge-row where a NEW placement at candidateSec is legal (matches a
// canvas click), or -1 when every row is blocked.
export function firstLegalRow(placement: SubLanePlacement, candidateSec: number): number {
  for (let i = 0; i < placement.rows.length; i++) {
    if (legalRowPlacement(placement, i, candidateSec)) return i;
  }
  return -1;
}

// When a lane is blocked at candidateSec: the soonest second it frees up —
// the latest end among row blockers overlapping the candidate footprint.
// Returns candidateSec itself when nothing overlaps.
export function blockedUntilSec(placement: SubLanePlacement, candidateSec: number): number {
  let until = candidateSec;
  for (const row of placement.rowBlockers) {
    for (const b of row) {
      if (candidateSec < b.endSec && candidateSec + placement.footprintSec > b.startSec) {
        until = Math.max(until, b.endSec);
      }
    }
  }
  return until;
}

export interface BarDragRangeArgs {
  instance: MitigationInstance;
  type: MitigationType;
  // Other placements on this bar's charge-row — bars on other charge-rows of
  // the same ability are unrelated for drag purposes. May include the
  // instance itself; it is filtered out.
  rowSiblings: readonly MitigationInstance[];
  // Shared-recast partner placements on the same slot.
  partnerInstances: readonly MitigationInstance[];
  // Gated children attached to this bar (offset-glued during drag).
  childInstances: readonly MitigationInstance[];
  fightDurationSec: number;
  // Drag floor: 0 normally, -pre_pull_duration_sec when the timeline has a
  // Pre-pull section (mits may sit before the pull; boss abilities may not).
  minSec?: number;
  allMits: readonly MitigationInstance[];
  lookupMitType: MitTypeLookup;
  mitStates: ReadonlyMap<string, MitInstanceState>;
}

// Legal [minSec, maxSec] for an existing Bar's effect_time during drag.
// Row neighbors and partner cooldown windows clamp from whichever side of the
// bar they sit on; the dragged bar's own right edge uses its own EFFECTIVE
// footprint, for the same absorbed-shield / long-active reasons as
// rowBlockers. Offset-glued children tighten the right edge so dragging never
// pushes a child past fightDurationSec.
export function barDragRange(args: BarDragRangeArgs): { minSec: number; maxSec: number } {
  const {
    instance,
    type,
    rowSiblings,
    partnerInstances,
    childInstances,
    fightDurationSec,
    allMits,
    lookupMitType,
    mitStates,
  } = args;
  const thisFootprint = effectiveBarFootprintSeconds(
    instance,
    type,
    allMits,
    lookupMitType,
    mitStates,
  );
  let minSec = args.minSec ?? 0;
  let maxSec = fightDurationSec;
  const clampAgainst = (b: BlockingInterval) => {
    if (b.startSec < instance.effect_time) {
      minSec = Math.max(minSec, b.endSec);
    } else {
      maxSec = Math.min(maxSec, b.startSec - thisFootprint);
    }
  };
  for (const n of rowSiblings) {
    if (n.id === instance.id) continue;
    clampAgainst({
      startSec: n.effect_time,
      endSec:
        n.effect_time + effectiveBarFootprintSeconds(n, type, allMits, lookupMitType, mitStates),
    });
  }
  for (const p of partnerInstances) {
    const pType = lookupMitType(p.type_id);
    if (!pType) continue;
    clampAgainst({
      startSec: p.effect_time,
      endSec: p.effect_time + effectiveCooldownSeconds(p, pType, allMits, lookupMitType, mitStates),
    });
  }
  for (const child of childInstances) {
    const offset = child.effect_time - instance.effect_time;
    maxSec = Math.min(maxSec, fightDurationSec - offset);
  }
  return { minSec, maxSec };
}

// Execution-zone bounds for a gated child: +1s from the parent's cast (the
// child can't share the parent's cast moment), -1s from the zone end (players
// can't realistically activate at the tail of the buff), and never past the
// timeline edge.
export function childZoneBounds(
  parentEffectTime: number,
  execZoneSec: number,
  fightDurationSec: number,
): { minSec: number; maxSec: number } {
  return {
    minSec: parentEffectTime + 1,
    maxSec: Math.min(parentEffectTime + execZoneSec - 1, fightDurationSec),
  };
}

export interface ChildDragRangeArgs {
  child: MitigationInstance;
  childType: MitigationType;
  parentEffectTime: number;
  execZoneSec: number;
  fightDurationSec: number;
  // All children currently on this parent. May include the child itself and
  // other child types; only same-type siblings constrain the gap.
  siblings: readonly MitigationInstance[];
}

// Drag clamp for a gated child: the execution-zone bounds, tightened by the
// 2s GCD-floor gap against other charges of the same child type (multi-charge
// only — today SCH Consolation).
export function childDragRange(args: ChildDragRangeArgs): { minSec: number; maxSec: number } {
  const bounds = childZoneBounds(args.parentEffectTime, args.execZoneSec, args.fightDurationSec);
  let { minSec, maxSec } = bounds;
  if (args.childType.max_charges > 1) {
    for (const s of args.siblings) {
      if (s.id === args.child.id) continue;
      if (s.type_id !== args.child.type_id) continue;
      if (s.effect_time < args.child.effect_time) {
        minSec = Math.max(minSec, s.effect_time + GATED_CHILD_MIN_GAP_SECONDS);
      } else {
        maxSec = Math.min(maxSec, s.effect_time - GATED_CHILD_MIN_GAP_SECONDS);
      }
    }
  }
  return { minSec, maxSec };
}
