// Snap-free placement-legality core, shared by the canvas sub-lane
// (MitSubLane) and the Simple Timeline View's Mit picker so the two surfaces
// can never disagree about what is legal. See
// docs/adr/0002-simple-view-live-projection.md.
//
// Pure scalar function: the candidate placement occupies [candidateSec,
// candidateSec + footprintSec); each blocker is a half-open [startSec, endSec)
// span (a same-(slot,type) neighbor's effective footprint, or a shared-recast
// partner's effective cooldown window). Legal iff the candidate overlaps none
// of them.
//
// Bounds-checking (raw within the lane) and snapping are NOT this function's
// concern — the canvas snaps before calling; the Mit picker places at an exact
// hit time and never snaps. Callers resolve the blocking spans (durations,
// cooldowns, charge-row assignment) at the seam and pass them in.
//
// Tests in placement-legality.test.ts.

export interface BlockingInterval {
  startSec: number;
  endSec: number;
}

export function isPlacementLegal(
  candidateSec: number,
  footprintSec: number,
  blockers: readonly BlockingInterval[],
): boolean {
  const candidateEnd = candidateSec + footprintSec;
  for (const b of blockers) {
    if (candidateSec < b.endSec && candidateEnd > b.startSec) return false;
  }
  return true;
}
