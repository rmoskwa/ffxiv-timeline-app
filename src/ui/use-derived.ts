// React seam over the pure survival evaluation in
// src/domain/evaluate-timeline.ts. Everything the hooks expose is a pure
// function of the whole `timeline` reference — every store mutation produces a
// new reference (touch() spreads), so a change to any field yields a fresh
// object identity.
//
// We compute the full evaluation ONCE per timeline reference and cache it in a
// WeakMap keyed on that reference. This matters: React's `useMemo` caches
// per-component-instance, so when dozens of PlayerLane / MitSubLane / MitBar
// components each call these hooks, a per-instance memo would re-run the damage
// engine once per component (hundreds of passes per interaction). Keying the
// cache on the shared `timeline` identity instead means the first caller
// computes and every other caller in the same render reads the same result. The
// WeakMap entry is dropped when the timeline reference is replaced and
// garbage-collected.

import { getMitById } from "@/data/mit-library";
import type { Conflict } from "@/domain/conflicts";
import type { MitInstanceState, PerPlayerHitResult } from "@/domain/damage";
import { evaluateTimeline, type TimelineEvaluation } from "@/domain/evaluate-timeline";
import type { TimelineFile } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";

const EMPTY_DERIVED: TimelineEvaluation = {
  gatingStates: new Map(),
  conflicts: [],
  conflictedIds: new Set(),
  perHit: new Map(),
  perInstance: new Map(),
  damageByTime: new Map(),
};

const cache = new WeakMap<TimelineFile, TimelineEvaluation>();

// Single shared entry point. Returns the same `TimelineEvaluation` object for
// every caller within a given timeline reference, so the engine runs once
// regardless of how many components read it.
function useDerived(): TimelineEvaluation {
  const timeline = useTimelineStore((s) => s.timeline);
  if (!timeline) return EMPTY_DERIVED;
  let derived = cache.get(timeline);
  if (!derived) {
    derived = evaluateTimeline(timeline, getMitById);
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
