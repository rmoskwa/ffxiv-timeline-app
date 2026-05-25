// Derived selectors built on top of the timeline store. Both expose pure
// recomputation keyed on the whole `timeline` reference — every store mutation
// produces a new reference (touch() spreads), so React will recompute exactly
// when something relevant has changed.

import { useMemo } from "react";
import { getMitById } from "@/data/mit-library";
import { type Conflict, detectConflicts } from "@/domain/conflicts";
import { computeDamagePerPlayer } from "@/domain/damage";
import { useTimelineStore } from "@/state/timeline-store";

// Map<bossInstanceId, post-mit damage array of length 8>. Players not targeted
// by a hit get `null`; targeted players get a number (0 when fully mitigated
// by an invuln). See computeDamagePerPlayer.
export function useDamageByInstance(): Map<string, (number | null)[]> {
  const timeline = useTimelineStore((s) => s.timeline);
  return useMemo(() => {
    const out = new Map<string, (number | null)[]>();
    if (!timeline) return out;
    const typeById = new Map(timeline.boss_ability_types.map((t) => [t.id, t]));
    for (const inst of timeline.boss_ability_instances) {
      const type = typeById.get(inst.type_id);
      if (!type) continue;
      out.set(
        inst.id,
        computeDamagePerPlayer(
          inst,
          type,
          timeline.mitigation_instances,
          getMitById,
          timeline.roster,
        ),
      );
    }
    return out;
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

// Convenience: the set of mit instance IDs flagged with a cooldown_overlap
// conflict. Used by MitBar to apply the red-border class.
export function useCooldownOverlapMitIds(): ReadonlySet<string> {
  const conflicts = useConflicts();
  return useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) {
      if (c.kind === "cooldown_overlap") s.add(c.mit_instance_id);
    }
    return s;
  }, [conflicts]);
}
