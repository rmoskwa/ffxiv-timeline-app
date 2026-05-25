// Conflict detection for the timeline.
// v0.1 categories:
//   - orphan_mit: mit bound to a slot whose job no longer matches the mit's job
//     (e.g., after a job swap).
//   - unset_target: a `targeted` boss instance or affects:target mit instance
//     whose target hasn't been picked yet — its damage math returns 0 until
//     the user resolves it.
//
// Pure function — no React, no I/O.

import type { MitTypeLookup } from "./damage";
import { targetingForBoss, targetingForMit } from "./targeting";
import type { BossAbilityInstance, BossAbilityType, MitigationInstance, Roster } from "./types";

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
    };

export function detectConflicts(
  mits: readonly MitigationInstance[],
  lookupMitType: MitTypeLookup,
  roster: Roster,
  bossInstances: readonly BossAbilityInstance[] = [],
  bossTypes: readonly BossAbilityType[] = [],
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

  return conflicts;
}
