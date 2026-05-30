// Derived selectors built on top of the timeline store. Everything here is a
// pure function of the whole `timeline` reference — every store mutation
// produces a new reference (touch() spreads), so a change to any field yields a
// fresh object identity.
//
// We compute the full derived bundle ONCE per timeline reference and cache it in
// a WeakMap keyed on that reference. This matters: React's `useMemo` caches
// per-component-instance, so when dozens of PlayerLane / MitSubLane / MitBar
// components each call these hooks, a per-instance memo would re-run the damage
// engine once per component (hundreds of passes per interaction). Keying the
// cache on the shared `timeline` identity instead means the first caller
// computes and every other caller in the same render reads the same result —
// two engine passes total, not two-per-component. The WeakMap entry is dropped
// when the timeline reference is replaced and garbage-collected.
//
// Two engine passes per timeline change:
//   1. Gating pass — runs the damage walk over non-consumer mits only, to get
//      consumed-mit absorbed_at without consumer interference. Feeds
//      detectConflicts for the absorbed-Coat-gates-Grassa rule.
//   2. Display pass — runs over conflict-filtered mits, produces the per-hit
//      damage map (chip data) plus the per-instance state map used to render
//      effective cooldowns (CD-reduce-on-absorb).

import { getMitById } from "@/data/mit-library";
import { type Conflict, detectConflicts } from "@/domain/conflicts";
import {
  aggregateDamageByTime,
  computeDamageTimeline,
  type MitInstanceState,
  type PerPlayerHitResult,
} from "@/domain/damage";
import type { TimelineFile } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";

interface DerivedTimeline {
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

const EMPTY_DERIVED: DerivedTimeline = {
  gatingStates: new Map(),
  conflicts: [],
  conflictedIds: new Set(),
  perHit: new Map(),
  perInstance: new Map(),
  damageByTime: new Map(),
};

function computeDerived(timeline: TimelineFile): DerivedTimeline {
  // 1. Gating pass — non-consumer mits only.
  const gatingStates = new Map<string, MitInstanceState>();
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
    gatingStates,
  );

  // 2. Conflicts from the gating pass, then the conflicted-id set.
  const conflicts = detectConflicts(
    timeline.mitigation_instances,
    getMitById,
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
    getMitById,
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

const cache = new WeakMap<TimelineFile, DerivedTimeline>();

// Single shared entry point. Returns the same `DerivedTimeline` object for every
// caller within a given timeline reference, so the engine runs once regardless
// of how many components read it.
function useDerived(): DerivedTimeline {
  const timeline = useTimelineStore((s) => s.timeline);
  if (!timeline) return EMPTY_DERIVED;
  let derived = cache.get(timeline);
  if (!derived) {
    derived = computeDerived(timeline);
    cache.set(timeline, derived);
  }
  return derived;
}

export function useDamageByTime(): Map<number, (PerPlayerHitResult | null)[]> {
  return useDerived().damageByTime;
}

export function useMitInstanceStates(): ReadonlyMap<string, MitInstanceState> {
  return useDerived().perInstance;
}

export function useConflicts(): Conflict[] {
  return useDerived().conflicts;
}

export function useConflictedMitIds(): ReadonlySet<string> {
  return useDerived().conflictedIds;
}
