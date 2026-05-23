// Coverage logic: does a given mitigation reduce damage for a given player on
// a given hit? Pure function — no React, no I/O. PRD §4, §5.3.
//
// Three conditions must hold for coverage:
//   1. The hit's effect_time falls within the mit's active window.
//   2. The mit's damage_types_affected includes the hit's damage_type.
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
import { resolveBossAbility } from "./types";

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
    case "spread":
    case "stack":
      return true;
    case "tankbuster_single":
    case "tankbuster_shared":
    case "targeted":
      return hit.target_slot_ids.includes(player.id);
  }
}

// Does this mit, given its `affects` field, reach this player?
function mitReachesPlayer(
  affects: MitAffects,
  mitOwnerSlotId: string,
  player: PlayerSlot,
): boolean {
  switch (affects) {
    case "self":
      return player.id === mitOwnerSlotId;
    case "party":
    case "boss_debuff":
      return true;
    case "target":
      // No v0.1 mit uses `affects: target` (would require a per-instance
      // target slot on MitigationInstance — not modeled). Treat as no-op.
      return false;
  }
}

export function mitCovers(
  mit: MitigationInstance,
  mitType: MitigationType,
  hit: ResolvedHit,
  forPlayerSlotIdx: number,
  roster: Roster,
): boolean {
  const player = roster[forPlayerSlotIdx];
  if (!player) return false;

  // 1. Temporal window: [mit.effect_time, mit.effect_time + duration]
  const mitStart = mit.effect_time;
  const mitEnd = mit.effect_time + mitType.duration_seconds;
  if (hit.effect_time < mitStart || hit.effect_time > mitEnd) return false;

  // 2. Damage-type match
  if (!mitType.damage_types_affected.includes(hit.damage_type)) return false;

  // 3a. Hit must actually land on this player.
  if (!hitLandsOnPlayer(hit, player)) return false;

  // 3b. Mit must actually reach this player.
  if (!mitReachesPlayer(mitType.affects, mit.player_slot_id, player)) return false;

  return true;
}
