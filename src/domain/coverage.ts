// Coverage logic: does a given mitigation reduce damage for a given player on
// a given hit? Pure function — no React, no I/O.
//
// Three conditions must hold for coverage:
//   1. The hit's effect_time falls within the mit's active window.
//   2. The mit has a non-zero % for the hit's damage_type.
//   3. The mit's `affects` reaches this player AND the hit's target_pattern
//      actually lands on this player.

import type {
  BossAbilityInstance,
  BossAbilityType,
  DamageType,
  MitAffects,
  MitigationInstance,
  MitigationType,
  PlayerSlot,
  Roster,
  TargetPattern,
} from "./types";
import { mitPercentFor, resolveBossAbility } from "./types";

// A "resolved" hit folds the type defaults + any per-instance overrides into a
// single object so coverage logic doesn't need both inputs.
export interface ResolvedHit {
  effect_time: number;
  damage_type: DamageType;
  target_pattern: TargetPattern;
  target_slot_ids: string[];
}

export function resolveHit(instance: BossAbilityInstance, type: BossAbilityType): ResolvedHit {
  const r = resolveBossAbility(instance, type);
  return {
    effect_time: instance.effect_time,
    damage_type: r.damage_type,
    target_pattern: r.target_pattern,
    target_slot_ids: instance.target_slot_ids,
  };
}

// Does the hit's target pattern actually land on this player?
export function hitLandsOn(hit: ResolvedHit, playerSlotIdx: number, roster: Roster): boolean {
  const player = roster[playerSlotIdx];
  if (!player) return false;
  return hitLandsOnPlayer(hit, player);
}

function hitLandsOnPlayer(hit: ResolvedHit, player: PlayerSlot): boolean {
  switch (hit.target_pattern) {
    case "raidwide":
      return true;
    case "targeted":
      return hit.target_slot_ids.includes(player.id);
  }
}

// Does this mit, given its `affects` field, reach this player?
function mitReachesPlayer(
  affects: MitAffects,
  mitOwnerSlotId: string,
  mitTargetSlotIds: readonly string[],
  player: PlayerSlot,
): boolean {
  switch (affects) {
    case "self":
      return player.id === mitOwnerSlotId;
    case "party":
    case "boss_debuff":
      return true;
    case "target":
      // Oblation / Aquaveil / Exaltation: covers only the user-picked target.
      // Empty target_slot_ids means the user hasn't picked yet — no coverage.
      return mitTargetSlotIds.includes(player.id);
    case "target_or_self":
      // DRK TBN: picker offers all 8 slots including the caster.
      return mitTargetSlotIds.includes(player.id);
    case "none":
      // Utility entries reach nobody for coverage purposes.
      return false;
  }
}

export function mitCovers(
  mit: MitigationInstance,
  mitType: MitigationType,
  hit: ResolvedHit,
  forPlayerSlotIdx: number,
  roster: Roster,
  // Charged-mit overwrite: when a later same-(type, recipient) instance starts
  // during this one's natural window, the engine treats this one as ending at
  // the later's effect_time (exclusive). Caller supplies it for the (mit,
  // recipient) pair under consideration. When omitted, the natural inclusive
  // window applies — the existing behavior for all 1-charge mits.
  truncatedEndExclusive?: number,
): boolean {
  const player = roster[forPlayerSlotIdx];
  if (!player) return false;

  // 1. Temporal window: [mit.effect_time, mit.effect_time + duration] by
  //    default; [mit.effect_time, truncatedEndExclusive) when overwritten.
  const mitStart = mit.effect_time;
  if (hit.effect_time < mitStart) return false;
  if (truncatedEndExclusive !== undefined) {
    if (hit.effect_time >= truncatedEndExclusive) return false;
  } else {
    if (hit.effect_time > mitStart + mitType.duration_seconds) return false;
  }

  // 2. Damage-type match (any non-zero % for this hit's damage type counts)
  if (mitPercentFor(mitType, hit.damage_type) <= 0) return false;

  // 3a. Hit must actually land on this player.
  if (!hitLandsOnPlayer(hit, player)) return false;

  // 3b. Mit must actually reach this player.
  if (!mitReachesPlayer(mitType.affects, mit.player_slot_id, mit.target_slot_ids, player))
    return false;

  return true;
}
