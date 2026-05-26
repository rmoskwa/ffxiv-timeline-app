// Conflict detection for the timeline.
// v0.1 categories:
//   - orphan_mit: mit bound to a slot whose job no longer matches the mit's job
//     (e.g., after a job swap).
//   - unset_target: a `targeted` boss instance or affects:target mit instance
//     whose target hasn't been picked yet — its damage math returns 0 until
//     the user resolves it.
//   - missing_consumed_mit: a mit with a `consumes` relationship was placed
//     when no instance of the consumed mit type is active on the caster slot
//     at the placement's effect_time (e.g. PCT Tempera Grassa without
//     Tempera Coat). Soft warning — the engine still runs but the in-game
//     ability would be uncastable.
//
// Pure function — no React, no I/O.

import type { MitInstanceState, MitTypeLookup } from "./damage";
import { targetingForBoss, targetingForMit } from "./targeting";
import type { BossAbilityInstance, BossAbilityType, MitigationInstance, Roster } from "./types";
import { instanceActiveDurationSeconds } from "./types";

export type Conflict =
  | {
      kind: "orphan_mit";
      mit_instance_id: string;
      message: string;
    }
  | {
      kind: "unset_target";
      target_kind: "boss_ability";
      boss_instance_id: string;
      message: string;
    }
  | {
      kind: "unset_target";
      target_kind: "mitigation";
      mit_instance_id: string;
      message: string;
    }
  | {
      kind: "missing_consumed_mit";
      mit_instance_id: string;
      message: string;
    };

export function detectConflicts(
  mits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
  bossInstances: readonly BossAbilityInstance[] = [],
  bossTypes: readonly BossAbilityType[] = [],
  perInstanceState: ReadonlyMap<string, MitInstanceState> = new Map(),
): Conflict[] {
  const conflicts: Conflict[] = [];
  const slotById = new Map(roster.map((s) => [s.id, s]));

  // ─── Orphan mits ──────────────────────────────────────────────────────────
  for (const m of mits) {
    const mt = lookupMitType(m.type_id);
    if (!mt) continue; // schema/reference error — deferred to v0.2
    const slot = slotById.get(m.player_slot_id);
    if (!slot) continue; // dangling FK — also v0.2
    if (slot.job !== mt.job) {
      conflicts.push({
        kind: "orphan_mit",
        mit_instance_id: m.id,
        message:
          slot.job === "unset"
            ? `${mt.name} is bound to an unset slot`
            : `${mt.name} requires ${mt.job} but slot is now ${slot.job}`,
      });
    }
  }

  // ─── Unset target (boss instances) ────────────────────────────────────────
  const bossTypeById = new Map(bossTypes.map((t) => [t.id, t]));
  for (const inst of bossInstances) {
    const type = bossTypeById.get(inst.type_id);
    if (!type) continue;
    if (!targetingForBoss(inst, type).isComplete) {
      conflicts.push({
        kind: "unset_target",
        target_kind: "boss_ability",
        boss_instance_id: inst.id,
        message: `${type.name} needs a target picked`,
      });
    }
  }

  // ─── Unset target (mit instances) ─────────────────────────────────────────
  for (const m of mits) {
    const mt = lookupMitType(m.type_id);
    if (!mt) continue;
    if (!targetingForMit(m, mt).isComplete) {
      conflicts.push({
        kind: "unset_target",
        target_kind: "mitigation",
        mit_instance_id: m.id,
        message: `${mt.name} needs a target picked`,
      });
    }
  }

  // ─── Missing consumed mit ─────────────────────────────────────────────────
  // A mit with `consumes` requires an active, unabsorbed instance of the
  // consumed type on the same caster slot at its effect_time. "Active" =
  // within the consumed mit's natural window; "unabsorbed" = the consumed
  // instance's pool was not fully drained by a boss hit at or before the
  // consumer's effect_time. absorbed_at comes from a state walk that excludes
  // consumer mits — see useMitInstanceStates in src/ui/use-derived.ts.
  for (const m of mits) {
    const mt = lookupMitType(m.type_id);
    if (!mt?.consumes) continue;
    const consumedId = mt.consumes;
    const consumedType = lookupMitType(consumedId);
    if (!consumedType) continue;
    const hasActive = mits.some((other) => {
      if (other.type_id !== consumedId) return false;
      if (other.player_slot_id !== m.player_slot_id) return false;
      const natural = other.effect_time + instanceActiveDurationSeconds(consumedType, other);
      if (!(other.effect_time <= m.effect_time && m.effect_time < natural)) return false;
      const absorbedAt = perInstanceState.get(other.id)?.absorbed_at;
      return absorbedAt == null || m.effect_time <= absorbedAt;
    });
    if (!hasActive) {
      conflicts.push({
        kind: "missing_consumed_mit",
        mit_instance_id: m.id,
        message: `${mt.name} requires ${consumedType.name} active on the caster`,
      });
    }
  }

  return conflicts;
}
