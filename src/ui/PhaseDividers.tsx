// Vertical lines painted at each Phase boundary inside a Lane or Sub-lane
// track. Rendered as the FIRST child of each track so subsequent Bars and
// Markers paint on top — preserving "Bars rendering on top wins" per
// docs/phases.md §7.5 and the CONTEXT.md "Phase divider" entry.
//
// Drop-in usage: `<PhaseDividers />` inside any `.lane-track` whose parent
// supplies a `position: relative` containing block. The component reads
// phases from the store and px/sec from the zoom store, so callers need not
// thread props.

import type { Phase } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { useZoom } from "./use-zoom";

const EMPTY_PHASES: readonly Phase[] = [];

export function PhaseDividers() {
  const phases = useTimelineStore((s) => s.timeline?.phases ?? EMPTY_PHASES);
  const { pxPerSec } = useZoom();
  if (phases.length < 2) return null;
  return (
    <>
      {phases.slice(1).map((p) => (
        <div
          key={p.id}
          className="phase-divider"
          style={{ left: p.start_time * pxPerSec }}
          aria-hidden
        />
      ))}
    </>
  );
}
