// Pure phase derivations. See CONTEXT.md "Phase" / "Phase ordinal" and
// docs/phases.md §6.

import type { Phase } from "./types";

// Returns the 1-indexed ordinal of the phase whose interval
// [phase.start_time, next_phase.start_time) contains `effect_time`. Returns
// null when the timeline has no user-added phases (UI hides the prefix).
// Caller guarantees `phases` is sorted ascending by start_time per the store
// invariant; first phase's start_time is structurally 0.
export function phaseOrdinalFor(effect_time: number, phases: readonly Phase[]): number | null {
  if (phases.length === 0) return null;
  let ordinal = 1;
  for (let i = 1; i < phases.length; i++) {
    if (effect_time < phases[i].start_time) return ordinal;
    ordinal = i + 1;
  }
  return ordinal;
}
