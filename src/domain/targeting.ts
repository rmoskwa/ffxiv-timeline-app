// Targeting — the user-picked player slots an instance's effect is aimed at.
// Applies to both boss instances (who is hit) and mit instances (who is
// protected). See CONTEXT.md and PRD §5.3, §10.
//
// Pure functions — no React, no I/O.

import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  MitigationType,
} from "./types";
import { resolveBossAbility } from "./types";

export interface TargetingState {
  requiredCount: 0 | 1 | 2;
  selection: readonly string[];
  isComplete: boolean;
}

// tankbuster_shared needs two slots; tankbuster_single and targeted need one;
// raidwide / spread / stack need none.
export function targetingForBoss(inst: BossAbilityInstance, type: BossAbilityType): TargetingState {
  const { target_pattern } = resolveBossAbility(inst, type);
  const requiredCount: 0 | 1 | 2 =
    target_pattern === "tankbuster_shared"
      ? 2
      : target_pattern === "tankbuster_single" || target_pattern === "targeted"
        ? 1
        : 0;
  const selection = inst.target_slot_ids;
  return {
    requiredCount,
    selection,
    isComplete: selection.length >= requiredCount,
  };
}

// affects:target is the only mit kind that needs a user-picked recipient.
export function targetingForMit(inst: MitigationInstance, type: MitigationType): TargetingState {
  const requiredCount: 0 | 1 = type.affects === "target" ? 1 : 0;
  const selection = inst.target_slot_ids;
  return {
    requiredCount,
    selection,
    isComplete: selection.length >= requiredCount,
  };
}
