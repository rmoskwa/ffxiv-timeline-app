// The survival evaluation — "will the party survive this timeline?" — as one
// pure domain interface. Composes the four passes that decide the canvas's
// damage/lethality math (the survival math, see CONTEXT.md):
//
//   1. Gating pass — runs the damage walk over non-consumer mits only, to get
//      each consumed pool's absorbed_at without consumer interference. Feeds
//      detectConflicts for the absorbed-Coat-gates-Grassa rule.
//   2. Conflicts — detectConflicts over the gating states, then the set of
//      mit-instance ids that currently carry an active conflict.
//   3. Display pass — runs the damage walk over conflict-filtered mits, so a
//      conflicted mit exists on the canvas but does not influence the math
//      until the user resolves it. Produces the per-hit damage map plus the
//      per-instance state used to render effective cooldowns.
//   4. Aggregation — folds per-hit results into the per-time damage chips.
//
// Pure and library-agnostic: the mit-type lookup is injected (mirrors
// computeDamageTimeline / detectConflicts), so this never imports the library
// and stays reusable by any surface. The React-render memoization lives at the hook seam in
// src/ui/use-derived.ts, not here.

import { type Conflict, detectConflicts } from "./conflicts";
import {
  aggregateDamageByTime,
  computeDamageTimeline,
  type MitInstanceState,
  type MitTypeLookup,
  type PerPlayerHitResult,
} from "./damage";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  Roster,
  TimelineFile,
} from "./types";

export interface TimelineEvaluation {
  // Per-instance state from the gating pass — excludes consumer mits so that a
  // consumed pool (e.g. Coat) runs its natural hit-vs-shield course without
  // being dispelled prematurely by its consumer (Grassa). Consumed by
  // detectConflicts to detect absorbed-Coat-gates-Grassa.
  gatingStates: ReadonlyMap<string, MitInstanceState>;
  conflicts: Conflict[];
  // Mit-instance ids that currently have any active conflict. Drives MitBar's
  // "in conflict" outline and keeps conflicted mits out of the display pass.
  conflictedIds: ReadonlySet<string>;
  perHit: Map<string, (PerPlayerHitResult | null)[]>;
  // Display-pass per-instance state. MitBar reads this to compute the effective
  // cooldown for each placement (CD-reduce-on-absorb + Grassa-mirrors-Coat).
  perInstance: ReadonlyMap<string, MitInstanceState>;
  // Map<effect_time, per-player results of length 8>. Damage from every boss hit
  // landing at the same second is summed per player — two simultaneous raidwides
  // at t=30 produce one entry at t=30 whose per-player damage is their sum, and
  // lethality is judged against that combined total (the damage-chip rendering
  // rule, see Damage chip in CONTEXT.md). Players not touched by any hit at this
  // time stay `null`. Mits in any active conflict are excluded — they exist on
  // the canvas but do not influence damage math until the user resolves it.
  damageByTime: Map<number, (PerPlayerHitResult | null)[]>;
}

// Gating pass: walk the damage timeline over NON-CONSUMER mits only and return
// each pool's per-instance state (absorbed_at etc.) without consumer
// interference. Shared by the full evaluation and the store's auto-spawn probe;
// the probe passes its committed mits plus the not-yet-committed parent and
// reads only that parent's absorbed_at. The non-consumer filter applies to
// whatever list is passed — the gating pass is defined as non-consumers only.
export function computeGatingStates(
  mits: readonly MitigationInstance[],
  bossInstances: readonly BossAbilityInstance[],
  bossTypes: readonly BossAbilityType[],
  roster: Roster,
  lookupMitType: MitTypeLookup,
): Map<string, MitInstanceState> {
  const gatingStates = new Map<string, MitInstanceState>();
  const nonConsumers = mits.filter((m) => {
    const mt = lookupMitType(m.type_id);
    return mt != null && mt.consumes == null;
  });
  computeDamageTimeline(
    bossInstances,
    bossTypes,
    nonConsumers,
    lookupMitType,
    roster,
    gatingStates,
  );
  return gatingStates;
}

export function evaluateTimeline(
  timeline: TimelineFile,
  lookupMitType: MitTypeLookup,
): TimelineEvaluation {
  // 1. Gating pass — non-consumer mits only.
  const gatingStates = computeGatingStates(
    timeline.mitigation_instances,
    timeline.boss_ability_instances,
    timeline.boss_ability_types,
    timeline.roster,
    lookupMitType,
  );

  // 2. Conflicts from the gating pass, then the conflicted-id set.
  const conflicts = detectConflicts(
    timeline.mitigation_instances,
    lookupMitType,
    timeline.roster,
    timeline.boss_ability_instances,
    timeline.boss_ability_types,
    gatingStates,
  );
  const conflictedIds = new Set<string>();
  for (const c of conflicts) {
    if ("mit_instance_id" in c) conflictedIds.add(c.mit_instance_id);
  }

  // 3. Display pass — conflict-filtered mits.
  const perInstance = new Map<string, MitInstanceState>();
  const usable =
    conflictedIds.size === 0
      ? timeline.mitigation_instances
      : timeline.mitigation_instances.filter((m) => !conflictedIds.has(m.id));
  const perHit = computeDamageTimeline(
    timeline.boss_ability_instances,
    timeline.boss_ability_types,
    usable,
    lookupMitType,
    timeline.roster,
    perInstance,
  );

  // 4. Per-time aggregation for the damage chips.
  const damageByTime = aggregateDamageByTime(
    timeline.boss_ability_instances,
    perHit,
    timeline.roster,
  );

  return { gatingStates, conflicts, conflictedIds, perHit, perInstance, damageByTime };
}
