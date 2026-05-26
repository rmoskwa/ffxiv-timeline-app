// Derived selectors built on top of the timeline store. Both expose pure
// recomputation keyed on the whole `timeline` reference — every store mutation
// produces a new reference (touch() spreads), so React will recompute exactly
// when something relevant has changed.

import { useMemo } from "react";
import { getMitById } from "@/data/mit-library";
import { type Conflict, detectConflicts } from "@/domain/conflicts";
import { computeDamageTimeline, type PerPlayerHitResult } from "@/domain/damage";
import { useTimelineStore } from "@/state/timeline-store";

// Map<bossInstanceId, per-player results of length 8>. Players not targeted by
// a hit get `null`; targeted players get a PerPlayerHitResult carrying the
// post-shield damage to HP, current HP after the hit, and remaining shield total.
// Mits in any active conflict are excluded — they exist on the canvas but do
// not influence damage math until the user resolves the conflict.
export function useDamageByInstance(): Map<string, (PerPlayerHitResult | null)[]> {
  const timeline = useTimelineStore((s) => s.timeline);
  const conflictedIds = useConflictedMitIds();
  return useMemo(() => {
    if (!timeline) return new Map();
    const usableMits =
      conflictedIds.size === 0
        ? timeline.mitigation_instances
        : timeline.mitigation_instances.filter((m) => !conflictedIds.has(m.id));
    return computeDamageTimeline(
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      usableMits,
      getMitById,
      timeline.roster,
    );
  }, [timeline, conflictedIds]);
}

export function useConflicts(): Conflict[] {
  const timeline = useTimelineStore((s) => s.timeline);
  return useMemo(() => {
    if (!timeline) return [];
    return detectConflicts(
      timeline.mitigation_instances,
      getMitById,
      timeline.roster,
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
    );
  }, [timeline]);
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
