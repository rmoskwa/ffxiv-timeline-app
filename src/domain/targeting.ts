// Targeting — the user-picked player slots an instance's effect is aimed at.
// Applies to both boss instances (who is hit) and mit instances (who is
// protected). See CONTEXT.md.
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
  minCount: 0 | 1;
  // Maximum slots allowed. Boss `raidwide` → 0; boss `targeted` → 8 (any
  // non-empty subset of the party). Mit affects:target → 1; all other mit
  // affects → 0.
  maxCount: 0 | 1 | 8;
  selection: readonly string[];
  isComplete: boolean;
}

// Pattern → (min/max). Exposed so type-only callers (e.g. the panel's
// "+ Add placement" form) can compute counts without fabricating an instance.
export function targetingCountsForPattern(pattern: TargetPattern): {
  minCount: 0 | 1;
  maxCount: 0 | 8;
} {
  switch (pattern) {
    case "targeted":
      return { minCount: 1, maxCount: 8 };
    case "raidwide":
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
