// Conflict detection for the timeline.
// v0.1 categories:
//   - cooldown_overlap: a player's mit placed before the previous instance's
//     cooldown has elapsed.
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
      kind: "cooldown_overlap";
      mit_instance_id: string;
      conflicts_with_id: string;
      message: string;
    }
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

  // ─── Cooldown overlap ─────────────────────────────────────────────────────
  // Group by (slot_id, type_id), sort by effect_time, flag any instance whose
  // start falls before the prior instance's cooldown ends.
  const groups = new Map<string, MitigationInstance[]>();
  for (const m of mits) {
    const key = `${m.player_slot_id}|${m.type_id}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.effect_time - b.effect_time);
    const [first, ...rest] = list;
    if (!first) continue;
    const mt = lookupMitType(first.type_id);
    if (!mt) continue;

    let prev = first;
    for (const curr of rest) {
      const prevCooldownEnd = prev.effect_time + mt.cooldown_seconds;
      if (curr.effect_time < prevCooldownEnd) {
        conflicts.push({
          kind: "cooldown_overlap",
          mit_instance_id: curr.id,
          conflicts_with_id: prev.id,
          message: `${mt.name} placed at ${curr.effect_time}s but still on cooldown until ${prevCooldownEnd}s`,
        });
      }
      prev = curr;
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
