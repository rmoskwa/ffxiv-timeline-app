import {
  LABEL_INTERVAL_SEC,
  LANE_DURATION_SEC,
  LANE_WIDTH_PX,
  PX_PER_SEC,
  secondsToTimecode,
  TICK_INTERVAL_SEC,
} from "./timeline-constants";

export function Ruler() {
  const ticks: number[] = [];
  for (let t = 0; t <= LANE_DURATION_SEC; t += TICK_INTERVAL_SEC) ticks.push(t);

  return (
    <div className="lane-row lane-row--ruler" aria-hidden>
      <div className="lane-label lane-label--ruler" />
      <div className="lane-track ruler-track" style={{ width: LANE_WIDTH_PX }}>
        {ticks.map((t) => {
          const isLabeled = t % LABEL_INTERVAL_SEC === 0;
          return (
            <div
              key={t}
              className={`tick${isLabeled ? " tick--labeled" : ""}`}
              style={{ left: t * PX_PER_SEC }}
            >
              {isLabeled && <span className="tick-label">{secondsToTimecode(t)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
