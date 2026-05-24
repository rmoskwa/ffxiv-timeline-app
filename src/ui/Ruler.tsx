import {
  LANE_DURATION_SEC,
  pickLabelIntervalSec,
  pickTickIntervalSec,
  secondsToTimecode,
} from "./timeline-constants";
import { useZoom } from "./use-zoom";

export function Ruler() {
  const { pxPerSec, laneWidthPx } = useZoom();
  const tickInterval = pickTickIntervalSec(pxPerSec);
  const labelInterval = pickLabelIntervalSec(tickInterval);

  const ticks: number[] = [];
  for (let t = 0; t <= LANE_DURATION_SEC; t += tickInterval) ticks.push(t);

  return (
    <div className="lane-row lane-row--ruler" aria-hidden>
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
