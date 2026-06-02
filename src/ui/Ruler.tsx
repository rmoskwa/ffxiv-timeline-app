import type { Phase } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { PhantomGutter } from "./PlayerLane";
import { pickLabelIntervalSec, pickTickIntervalSec, secondsToTimecode } from "./timeline-constants";
import { useChipLayoutStore } from "./use-chip-layout";
import { useZoom } from "./use-zoom";

const EMPTY_PHASES: readonly Phase[] = [];

export function Ruler() {
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const chipPosition = useChipLayoutStore((s) => s.position);
  const phases = useTimelineStore((s) => s.timeline?.phases ?? EMPTY_PHASES);

  return (
    <>
      {phases.length >= 2 && (
        <PhaseRelativeRulerRow
          phases={phases}
          pxPerSec={pxPerSec}
          laneDurationSec={laneDurationSec}
          laneWidthPx={laneWidthPx}
          chipPosition={chipPosition}
        />
      )}
      <AbsoluteRulerRow
        pxPerSec={pxPerSec}
        laneDurationSec={laneDurationSec}
        laneWidthPx={laneWidthPx}
        chipPosition={chipPosition}
      />
    </>
  );
}

function AbsoluteRulerRow({
  pxPerSec,
  laneDurationSec,
  laneWidthPx,
  chipPosition,
}: {
  pxPerSec: number;
  laneDurationSec: number;
  laneWidthPx: number;
  chipPosition: string;
}) {
  const tickInterval = pickTickIntervalSec(pxPerSec);
  const labelInterval = pickLabelIntervalSec(tickInterval);
  const ticks: number[] = [];
  for (let t = 0; t <= laneDurationSec; t += tickInterval) ticks.push(t);

  return (
    <div className="lane-row lane-row--ruler" aria-hidden>
      {chipPosition !== "interleaved" && <PhantomGutter />}
      <div className="lane-label lane-label--ruler">Total Time</div>
      <div className="lane-track ruler-track" style={{ width: laneWidthPx }}>
        {ticks.map((t) => {
          const isLabeled = t % labelInterval === 0;
          const atEnd = t === laneDurationSec;
          return (
            <div
              key={t}
              className={`tick${isLabeled ? " tick--labeled" : ""}`}
              style={{ left: t * pxPerSec }}
            >
              {isLabeled && (
                <span className={`tick-label${atEnd ? " tick-label--end" : ""}`}>
                  {secondsToTimecode(t)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhaseRelativeRulerRow({
  phases,
  pxPerSec,
  laneDurationSec,
  laneWidthPx,
  chipPosition,
}: {
  phases: readonly Phase[];
  pxPerSec: number;
  laneDurationSec: number;
  laneWidthPx: number;
  chipPosition: string;
}) {
  return (
    <div className="lane-row lane-row--ruler lane-row--ruler-phase-relative" aria-hidden>
      {chipPosition !== "interleaved" && <PhantomGutter />}
      <div className="lane-label lane-label--ruler">Phase Time</div>
      <div
        className="lane-track ruler-track ruler-track--phase-relative"
        style={{ width: laneWidthPx }}
      >
        {phases.map((phase, idx) => {
          const nextStart = phases[idx + 1]?.start_time ?? laneDurationSec;
          const segmentDuration = nextStart - phase.start_time;
          if (segmentDuration <= 0) return null;
          const leftPx = phase.start_time * pxPerSec;
          const widthPx = segmentDuration * pxPerSec;
          const isLast = idx === phases.length - 1;
          return (
            <div
              key={phase.id}
              className="phase-relative-segment"
              style={{ left: leftPx, width: widthPx }}
            >
              <PhaseSegmentTicks
                segmentDurationSec={segmentDuration}
                pxPerSec={pxPerSec}
                includeEndTick={isLast}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhaseSegmentTicks({
  segmentDurationSec,
  pxPerSec,
  includeEndTick,
}: {
  segmentDurationSec: number;
  pxPerSec: number;
  // A tick that lands exactly on the segment's right edge collides with the
  // next segment's 0:00 (they share an x-position at the boundary). Drop it
  // for all but the final segment so only one label paints at each divider.
  includeEndTick: boolean;
}) {
  const tickInterval = pickTickIntervalSec(pxPerSec);
  const labelInterval = pickLabelIntervalSec(tickInterval);
  const ticks: number[] = [];
  const limit = includeEndTick ? segmentDurationSec : segmentDurationSec - 0.0001;
  for (let t = 0; t <= limit; t += tickInterval) ticks.push(t);

  return (
    <>
      {ticks.map((t) => {
        const isLabeled = t % labelInterval === 0;
        // Only the final segment ever emits a tick at its right edge (see
        // includeEndTick guard above); flip that label so it doesn't overflow
        // past the timeline's end.
        const atEnd = includeEndTick && t === segmentDurationSec;
        return (
          <div
            key={t}
            className={`tick${isLabeled ? " tick--labeled" : ""}`}
            style={{ left: t * pxPerSec }}
          >
            {isLabeled && (
              <span className={`tick-label${atEnd ? " tick-label--end" : ""}`}>
                {secondsToTimecode(t)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
