// Mit-window resolutions. Given the full set of mit instances, compute the
// derived "when does each instance's effect apply" maps that the damage walk
// (and any future analyses) consume. None of these functions touch boss hits,
// HP, or barrier pools — outputs depend only on the mit set's internal
// structure.
//
// Single entry point: `precomputeMitWindows`. Sub-passes are also exported
// individually for direct testing.

import type { MitTypeLookup } from "./damage";
import {
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
  nonStackingGroup,
  type Roster,
  recipientIncludes,
} from "./types";

export interface MitWindows {
  // Earliest dispel time per instance id (caster slot). Sourced from
  // `consumes_many` consumers and from held-ability truncation. Earliest wins.
  readonly dispelledEnds: ReadonlyMap<string, number>;
  // Per `consumes_many` consumer: count of distinct types it actually
  // dispelled on the caster slot. Drives the per-dispelled-effect barrier
  // bonus and the `dispel_bonus_applied` UI marker.
  readonly consumerDispelCounts: ReadonlyMap<string, number>;
  // Per (instance id, recipient id): exclusive upper bound for this mit's
  // effective active window on that recipient, when truncated by a same-group
  // refresh or by dispel. Absent ⇒ natural window.
  readonly effectiveEnds: ReadonlyMap<string, ReadonlyMap<string, number>>;
  // Per instance id with `conditional_bonus`: was the gate satisfied at cast
  // time? Snapshot once; applies for the full active window when true.
  readonly conditionalSatisfied: ReadonlyMap<string, boolean>;
}

export function precomputeMitWindows(
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
): MitWindows {
  const { instanceEnds: dispelledEnds, consumerCounts: consumerDispelCounts } =
    computeDispelledEnds(allMits, lookupMitType);
  const effectiveEnds = computeEffectiveEnds(allMits, lookupMitType, roster, dispelledEnds);
  const conditionalSatisfied = computeConditionalSatisfaction(
    allMits,
    lookupMitType,
    dispelledEnds,
  );
  return { dispelledEnds, consumerDispelCounts, effectiveEnds, conditionalSatisfied };
}

// Pre-compute dispel state for every `consumes_many` consumer AND every held
// ability whose intended hold window is interrupted by another mit on the same
// caster slot.
//
//   - `instanceEnds[targetInstId]` = earliest dispel time on the caster slot.
//     Earliest-dispel-wins across both sources (consumes_many and held-trunc);
//     a later event cannot un-end a buff.
//   - `consumerCounts[consumerInstId]` = number of distinct `consumes_many`
//     entries this consumer actually ended (live target instances at its
//     effect_time on its caster slot). Drives the per-consumer barrier bonus.
//     Held-truncation does not contribute to this count.
//
// Held-truncation: a held ability locks the caster out of other actions during
// its hold window (effect_time, effect_time + held_time). If another mit on
// the same caster slot is placed inside that window, the hold ends at the
// blocker's effect_time. The held mit's active window truncates to
// (blocker.effect_time + min_duration_seconds) — the residual after release
// still plays out. Expressed via the same dispel-clip mechanic as
// consumes_many so coverage, max-HP buff windows, conditional gates, and
// bar visualization all honor it for free.
export function computeDispelledEnds(
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
): { instanceEnds: Map<string, number>; consumerCounts: Map<string, number> } {
  const instanceEnds = new Map<string, number>();
  const consumerCounts = new Map<string, number>();
  const recordEnd = (instId: string, t: number) => {
    const existing = instanceEnds.get(instId);
    if (existing == null || t < existing) instanceEnds.set(instId, t);
  };
  for (const consumer of allMits) {
    const consumerType = lookupMitType(consumer.type_id);
    if (!consumerType?.consumes_many?.length) continue;
    const casterId = consumer.player_slot_id;
    const t = consumer.effect_time;
    const dispelledTypeIds = new Set<string>();
    for (const target of allMits) {
      if (target.id === consumer.id) continue;
      if (target.player_slot_id !== casterId) continue;
      if (!consumerType.consumes_many.includes(target.type_id)) continue;
      const targetType = lookupMitType(target.type_id);
      if (!targetType) continue;
      if (t < target.effect_time) continue;
      if (t > target.effect_time + instanceActiveDurationSeconds(targetType, target)) continue;
      recordEnd(target.id, t);
      dispelledTypeIds.add(target.type_id);
    }
    if (dispelledTypeIds.size > 0) consumerCounts.set(consumer.id, dispelledTypeIds.size);
  }
  for (const held of allMits) {
    const heldType = lookupMitType(held.type_id);
    if (heldType?.min_duration_seconds == null) continue;
    const minDur = heldType.min_duration_seconds;
    const activeDur = instanceActiveDurationSeconds(heldType, held);
    const holdTime = activeDur - minDur;
    if (holdTime <= 0) continue;
    const holdEnd = held.effect_time + holdTime;
    const casterId = held.player_slot_id;
    let earliestBlockerT: number | null = null;
    for (const other of allMits) {
      if (other.id === held.id) continue;
      if (other.player_slot_id !== casterId) continue;
      // Gated children of this held instance are continuations, not
      // interruptions. (No held ability has children today — guard is
      // future-proofing.)
      if (other.parent_instance_id === held.id) continue;
      if (other.effect_time <= held.effect_time) continue;
      if (other.effect_time >= holdEnd) continue;
      if (earliestBlockerT == null || other.effect_time < earliestBlockerT) {
        earliestBlockerT = other.effect_time;
      }
    }
    if (earliestBlockerT != null) {
      recordEnd(held.id, earliestBlockerT + minDur);
    }
  }
  return { instanceEnds, consumerCounts };
}

// Per (mit instance, recipient) → exclusive upper bound for the mit's active
// window when the next same-(group, recipient) instance starts inside its
// natural duration, or when a `consumes_many` consumer dispels this instance
// on the caster slot. Absent entries → no overwrite or dispel; mitCovers uses
// the natural inclusive window. Dispel truncation is folded in only for the
// caster slot for `consumes_many` (caster-only) — held-truncation expands
// across every recipient of the dispelled mit (party-wide instances lose
// coverage on all 8 slots).
//
// "Group" here is `type.non_stacking_group ?? type.id`: same-type-id instances
// fold into the implicit group (two SCH Expedients refresh each other) and
// cross-type entries sharing a `non_stacking_group` also coalesce (PLD Reprisal
// + WAR Reprisal share the "reprisal" debuff slot).
export function computeEffectiveEnds(
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
  dispelledEnds: ReadonlyMap<string, number>,
): Map<string, Map<string, number>> {
  interface Group {
    instances: MitigationInstance[];
  }
  const groups = new Map<string, Group>();
  for (const m of allMits) {
    const mt = lookupMitType(m.type_id);
    if (!mt) continue;
    const groupKey = nonStackingGroup(mt);
    for (const rid of recipientIdsForOverwrite(mt, m, roster)) {
      const key = `${groupKey}|${rid}`;
      let g = groups.get(key);
      if (!g) {
        g = { instances: [] };
        groups.set(key, g);
      }
      g.instances.push(m);
    }
  }

  const ends = new Map<string, Map<string, number>>();
  const setEnd = (instId: string, recipientId: string, t: number) => {
    let inner = ends.get(instId);
    if (!inner) {
      inner = new Map();
      ends.set(instId, inner);
    }
    const existing = inner.get(recipientId);
    inner.set(recipientId, existing != null ? Math.min(existing, t) : t);
  };
  for (const [key, g] of groups) {
    if (g.instances.length < 2) continue;
    const recipientId = key.slice(key.indexOf("|") + 1);
    const sorted = [...g.instances].sort((a, b) => a.effect_time - b.effect_time);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (!cur || !next) continue;
      const mt = lookupMitType(cur.type_id);
      if (!mt) continue;
      const natural = cur.effect_time + instanceActiveDurationSeconds(mt, cur);
      if (next.effect_time < natural) {
        setEnd(cur.id, recipientId, next.effect_time);
      }
    }
  }

  // Fold in dispel truncation. Expanded across every recipient of the
  // dispelled mit so party-wide instances (held-truncated Passage of Arms)
  // lose coverage on all 8 slots, not just the caster. For self-only
  // dispelled instances (the consumes_many case — Damnation, Thrill,
  // Bloodwhetting), `recipientIdsForOverwrite` returns just the caster, so
  // the original caster-only behavior is preserved. If an existing per-player
  // overwrite truncation is tighter, `setEnd`'s Math.min keeps it.
  for (const [instId, dispelEnd] of dispelledEnds) {
    const m = allMits.find((x) => x.id === instId);
    if (!m) continue;
    const mt = lookupMitType(m.type_id);
    if (!mt) continue;
    for (const rid of recipientIdsForOverwrite(mt, m, roster)) {
      setEnd(instId, rid, dispelEnd);
    }
  }

  return ends;
}

// Cast-time snapshot for every instance whose type carries a `conditional_bonus`.
// Returns a Map keyed by instance id; value `true` ⇒ the bonus applies for the
// entire active window. Gate passes when at least one entry whose id is in
// `requires_active` (a) has its active window covering `inst.effect_time` and
// (b) resolves to a recipient set that includes the caster of `inst`. The
// gating window is the natural `[effect_time, effect_time + duration]`; no
// re-evaluation happens during the per-hit walk.
export function computeConditionalSatisfaction(
  allMits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  dispelledEnds: ReadonlyMap<string, number>,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const m of allMits) {
    const mt = lookupMitType(m.type_id);
    if (!mt?.conditional_bonus) continue;
    const required = mt.conditional_bonus.requires_active;
    const casterId = m.player_slot_id;
    let satisfied = false;
    for (const other of allMits) {
      if (other.id === m.id) continue;
      if (!required.includes(other.type_id)) continue;
      const ot = lookupMitType(other.type_id);
      if (!ot) continue;
      if (m.effect_time < other.effect_time) continue;
      if (m.effect_time > other.effect_time + instanceActiveDurationSeconds(ot, other)) continue;
      // A gating entry dispelled on its caster slot before this instance's
      // cast time no longer counts (exclusive at dispel time).
      const dispelEnd = dispelledEnds.get(other.id);
      if (dispelEnd != null && other.player_slot_id === casterId && m.effect_time >= dispelEnd) {
        continue;
      }
      if (!recipientIncludes(ot.affects, other, casterId)) continue;
      satisfied = true;
      break;
    }
    out.set(m.id, satisfied);
  }
  return out;
}

// Recipient ids used when grouping instances for (type_id, recipient) overwrite.
// boss_debuff folds into per-player groups because the engine evaluates coverage
// per player; using each player's id keeps the per-hit lookup in the damage
// walk uniform across affects kinds.
function recipientIdsForOverwrite(
  mt: MitigationType,
  m: MitigationInstance,
  roster: Roster,
): string[] {
  switch (mt.affects) {
    case "self":
      return [m.player_slot_id];
    case "target":
    case "target_or_self":
      return [...m.target_slot_ids];
    case "party":
    case "boss_debuff":
      return roster.map((s) => s.id);
    case "none":
      return [];
  }
}
