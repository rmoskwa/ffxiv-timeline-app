// Derived selectors built on top of the timeline store. Both expose pure
// recomputation keyed on the whole `timeline` reference — every store mutation
// produces a new reference (touch() spreads), so React will recompute exactly
// when something relevant has changed.
//
// Two engine passes per timeline change:
//   1. Gating pass — runs the damage walk over non-consumer mits only, to get
//      consumed-mit absorbed_at without consumer interference. Feeds
//      detectConflicts for the absorbed-Coat-gates-Grassa rule.
//   2. Display pass — runs over conflict-filtered mits, produces the per-hit
//      damage map (chip data) plus the per-instance state map used to render
//      effective cooldowns (CD-reduce-on-absorb).

import { useMemo } from "react";
import { getMitById } from "@/data/mit-library";
import { type Conflict, detectConflicts } from "@/domain/conflicts";
import {
  aggregateDamageByTime,
  computeDamageTimeline,
  type MitInstanceState,
  type PerPlayerHitResult,
} from "@/domain/damage";
import { useTimelineStore } from "@/state/timeline-store";

// Per-instance state from the gating pass — excludes consumer mits so that a
// consumed pool (e.g. Coat) runs its natural hit-vs-shield course without
// being dispelled prematurely by its consumer (Grassa). Consumed by
// useConflicts to detect absorbed-Coat-gates-Grassa.
function useGatingStates(): ReadonlyMap<string, MitInstanceState> {
  const timeline = useTimelineStore((s) => s.timeline);
  return useMemo(() => {
    const states = new Map<string, MitInstanceState>();
    if (!timeline) return states;
    const nonConsumers = timeline.mitigation_instances.filter((m) => {
      const mt = getMitById(m.type_id);
      return mt != null && mt.consumes == null;
    });
    computeDamageTimeline(
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      nonConsumers,
      getMitById,
      timeline.roster,
      states,
    );
    return states;
  }, [timeline]);
}

// Per-hit damage map + per-instance state from the display pass (after
// excluding conflicted mits). The state map drives effective cooldown
// rendering — Grassa's `consumed_from_instance_id` and absorbed_at come from
// here, not from the gating pass.
function useDisplayResults(): {
  perHit: Map<string, (PerPlayerHitResult | null)[]>;
  perInstance: ReadonlyMap<string, MitInstanceState>;
} {
  const timeline = useTimelineStore((s) => s.timeline);
  const conflictedIds = useConflictedMitIds();
  return useMemo(() => {
    const perInstance = new Map<string, MitInstanceState>();
    if (!timeline) return { perHit: new Map(), perInstance };
    const usable =
      conflictedIds.size === 0
        ? timeline.mitigation_instances
        : timeline.mitigation_instances.filter((m) => !conflictedIds.has(m.id));
    const perHit = computeDamageTimeline(
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      usable,
      getMitById,
      timeline.roster,
      perInstance,
    );
    return { perHit, perInstance };
  }, [timeline, conflictedIds]);
}

// Map<effect_time, per-player results of length 8>. Damage from every boss
// hit landing at the same second is summed per player — two simultaneous
// raidwides at t=30 produce one entry at t=30 whose per-player damage is
// their sum, and lethality is judged against that combined total (the
// damage-chip rendering rule, see Damage chip in CONTEXT.md). Players not
// touched by any hit at this time stay `null`. Mits in any active conflict
// are excluded — they exist on the canvas but do not influence damage math
// until the user resolves the conflict.
export function useDamageByTime(): Map<number, (PerPlayerHitResult | null)[]> {
  const timeline = useTimelineStore((s) => s.timeline);
  const perHit = useDisplayResults().perHit;
  return useMemo(() => {
    if (!timeline) return new Map();
    return aggregateDamageByTime(timeline.boss_ability_instances, perHit);
  }, [timeline, perHit]);
}

// Display-pass per-instance state. MitBar reads this to compute the effective
// cooldown for each placement (CD-reduce-on-absorb + Grassa-mirrors-Coat).
export function useMitInstanceStates(): ReadonlyMap<string, MitInstanceState> {
  return useDisplayResults().perInstance;
}

export function useConflicts(): Conflict[] {
  const timeline = useTimelineStore((s) => s.timeline);
  const gatingStates = useGatingStates();
  return useMemo(() => {
    if (!timeline) return [];
    return detectConflicts(
      timeline.mitigation_instances,
      getMitById,
      timeline.roster,
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      gatingStates,
    );
  }, [timeline, gatingStates]);
}

// Set of mit-instance ids that currently have any active conflict. Used by
// MitBar to draw the yellow-dashed "in conflict" outline, and by
// useDamageByInstance to keep conflicted mits out of the damage pipeline.
export function useConflictedMitIds(): ReadonlySet<string> {
  const conflicts = useConflicts();
  return useMemo(() => {
    const ids = new Set<string>();
    for (const c of conflicts) {
      if ("mit_instance_id" in c) ids.add(c.mit_instance_id);
    }
    return ids;
  }, [conflicts]);
}
