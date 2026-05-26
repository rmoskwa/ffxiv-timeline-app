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
export function useDamageByInstance(): Map<string, (PerPlayerHitResult | null)[]> {
  const timeline = useTimelineStore((s) => s.timeline);
  return useMemo(() => {
    if (!timeline) return new Map();
    return computeDamageTimeline(
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      timeline.mitigation_instances,
      getMitById,
      timeline.roster,
    );
  }, [timeline]);
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
