// First-covered-hit projection for the Simple Timeline View. Maps each
// mitigation instance to the boss-hit rows it covers, so the grid knows where
// to draw a mit's editable Home cell and its read-only Coverage markers.
//
// Pure scalar module: it takes
// pre-resolved hit times and per-instance {effectTime, durationSec} — no
// MitigationInstance, no library lookups, no damage helpers. The React shell
// resolves active durations (instanceActiveDurationSeconds, incl. held
// abilities) at the seam before calling.
//
// Presence here is TEMPORAL ONLY (active window contains the hit time) — it
// does NOT apply coverage()'s damage-type/reach checks. Utility entries and
// off-type mits must still surface.
//
// Tests in simple-grid-projection.test.ts.

export interface ProjectionInput {
  // Stable instance id, echoed back on the result for the caller to join on.
  id: string;
  // Instance effect_time, in seconds.
  effectTime: number;
  // Resolved active duration, in seconds (instanceActiveDurationSeconds).
  durationSec: number;
}

export interface InstanceProjection {
  id: string;
  // Index into hitTimes of the first covered hit — the Home cell row. null when
  // the instance covers no hit (invisible in the grid).
  homeHitIndex: number | null;
  // Indices into hitTimes of every covered hit, ascending. The first entry is
  // homeHitIndex; the rest are Coverage markers. Empty when homeHitIndex is null.
  coveredHitIndices: number[];
}

// `hitTimes` is one entry per boss-instance row in display order: sorted
// ascending, ties broken by insertion order (the caller sorts). Duplicate
// values are expected for simultaneous hits — each is its own row/index, and a
// mit covering that instant covers all of them, with the lowest index as Home.
export function projectInstancesToHits(
  hitTimes: readonly number[],
  instances: readonly ProjectionInput[],
): InstanceProjection[] {
  return instances.map((inst) => {
    const windowEnd = inst.effectTime + inst.durationSec;
    const coveredHitIndices: number[] = [];
    // hitTimes is ascending, so covered hits form one contiguous run.
    for (let i = 0; i < hitTimes.length; i++) {
      const h = hitTimes[i];
      if (h === undefined) continue;
      if (h < inst.effectTime) continue;
      if (h > windowEnd) break;
      coveredHitIndices.push(i);
    }
    return {
      id: inst.id,
      homeHitIndex: coveredHitIndices[0] ?? null,
      coveredHitIndices,
    };
  });
}
