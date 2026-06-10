// Tinted overlay marking the Pre-pull section ([Start, 0)) plus the pull line
// at t = 0, painted inside a Lane or Sub-lane track. Same drop-in contract as
// PhaseDividers: render as an early child of any `.lane-track` so Bars and
// Markers paint on top, with pointer-events: none so placement clicks fall
// through. Renders nothing when the timeline has no Pre-pull section.

import { useZoom } from "./use-zoom";

export function PrePullShade() {
  const { pxPerSec, startSec } = useZoom();
  if (startSec >= 0) return null;
  const widthPx = -startSec * pxPerSec;
  return (
    <>
      <div className="pre-pull-shade" style={{ width: widthPx }} aria-hidden />
      <div className="pull-line" style={{ left: widthPx }} aria-hidden />
    </>
  );
}
