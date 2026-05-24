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
  TargetPattern,
} from "./types";
import { resolveBossAbility } from "./types";

export interface TargetingState {
  // Minimum slots that must be selected for the instance to be "complete".
  minCount: 0 | 1 | 2;
  // Maximum slots allowed. Equals minCount for fixed-cardinality patterns;
  // for `targeted` the max is the full party (8) so users can pick any subset.
  maxCount: 0 | 1 | 2 | 8;
  selection: readonly string[];
  isComplete: boolean;
}

// Pattern → (min/max). Exposed so type-only callers (e.g. the panel's
// "+ Add placement" form) can compute counts without fabricating an instance.
export function targetingCountsForPattern(pattern: TargetPattern): {
  minCount: 0 | 1 | 2;
  maxCount: 0 | 1 | 2 | 8;
} {
  switch (pattern) {
    case "tankbuster_shared":
      return { minCount: 2, maxCount: 2 };
    case "tankbuster_single":
      return { minCount: 1, maxCount: 1 };
    case "targeted":
      // At least one target required; any non-empty subset of the party allowed.
      return { minCount: 1, maxCount: 8 };
    default:
      return { minCount: 0, maxCount: 0 };
  }
}

export function targetingForBoss(inst: BossAbilityInstance, type: BossAbilityType): TargetingState {
  const { target_pattern } = resolveBossAbility(inst, type);
  const { minCount, maxCount } = targetingCountsForPattern(target_pattern);
  const selection = inst.target_slot_ids;
  return {
    minCount,
    maxCount,
    selection,
    isComplete: selection.length >= minCount,
  };
}

// affects:target is the only mit kind that needs a user-picked recipient.
export function targetingForMit(inst: MitigationInstance, type: MitigationType): TargetingState {
  const needed = type.affects === "target" ? 1 : 0;
  const selection = inst.target_slot_ids;
  return {
    minCount: needed,
    maxCount: needed,
    selection,
    isComplete: selection.length >= needed,
  };
}
