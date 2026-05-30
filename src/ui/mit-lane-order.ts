// Pure reconciliation of a job's Mit lane layout against the live mit library.
// Single source of truth for resolving a job's Sub-lane rows (order + visibility),
// consumed by the canvas (orderedVisibleMits) and the Mitigation Layout modal
// (resolveJobMitLanes, which needs hidden rows too to show their toggles).
//
// Per ADR-0001 the library lookup happens at the React seam: callers pass the
// job's non-gated library types in (`getMitsForJob(job).filter(mt => mt.gated_by
// == null)`); this module never imports getMitsForJob, so its tests need no real
// library. See docs/prd/mit-lane-layout.md §4.

import type { MitigationType } from "@/domain/types";
import type { MitLaneEntry } from "@/state/mit-lane-layout-store";

export interface ResolvedMitLane {
  type: MitigationType;
  hidden: boolean;
}

// Full ordered row list for a job's non-gated mit types, reconciled against the
// live library. `baseTypes` = the job's non-gated library types in library order.
//   1. stored entries first, in saved order, skipping ids no longer in baseTypes
//      (drop-stale: a removed/renamed type, or one that became gated — gated
//      types are filtered out upstream, so they simply fall out here);
//   2. then any baseType not already listed, in library order, hidden = false
//      (append-new-visible at bottom).
// `stored === undefined` (untouched job) => pure library order, all visible.
export function resolveJobMitLanes(
  baseTypes: readonly MitigationType[],
  stored: MitLaneEntry[] | undefined,
): ResolvedMitLane[] {
  const byId = new Map(baseTypes.map((t) => [t.id, t]));
  const rows: ResolvedMitLane[] = [];
  const seen = new Set<string>();

  if (stored) {
    for (const entry of stored) {
      const type = byId.get(entry.typeId);
      if (!type || seen.has(entry.typeId)) continue; // drop-stale / dedupe
      rows.push({ type, hidden: entry.hidden });
      seen.add(entry.typeId);
    }
  }
  for (const type of baseTypes) {
    if (seen.has(type.id)) continue;
    rows.push({ type, hidden: false }); // append-new-visible at bottom
    seen.add(type.id);
  }
  return rows;
}

// Canvas convenience: the visible types in order. Replaces the bare
// `getMitsForJob(job).filter(mt => mt.gated_by == null)` call sites.
export function orderedVisibleMits(
  baseTypes: readonly MitigationType[],
  stored: MitLaneEntry[] | undefined,
): MitigationType[] {
  return resolveJobMitLanes(baseTypes, stored)
    .filter((r) => !r.hidden)
    .map((r) => r.type);
}
