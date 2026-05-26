import { PhantomGutter } from "./PlayerLane";
import { pickLabelIntervalSec, pickTickIntervalSec, secondsToTimecode } from "./timeline-constants";
import { useChipLayoutStore } from "./use-chip-layout";
import { useZoom } from "./use-zoom";

export function Ruler() {
  const { pxPerSec, laneDurationSec, laneWidthPx } = useZoom();
  const chipPosition = useChipLayoutStore((s) => s.position);
  const tickInterval = pickTickIntervalSec(pxPerSec);
  const labelInterval = pickLabelIntervalSec(tickInterval);

  const ticks: number[] = [];
  for (let t = 0; t <= laneDurationSec; t += tickInterval) ticks.push(t);

  return (
    <div className="lane-row lane-row--ruler" aria-hidden>
      {chipPosition !== "interleaved" && <PhantomGutter />}
      <div className="lane-label lane-label--ruler" />
      <div className="lane-track ruler-track" style={{ width: laneWidthPx }}>
        {ticks.map((t) => {
          const isLabeled = t % labelInterval === 0;
          return (
            <div
              key={t}
              className={`tick${isLabeled ? " tick--labeled" : ""}`}
              style={{ left: t * pxPerSec }}
            >
              {isLabeled && <span className="tick-label">{secondsToTimecode(t)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
