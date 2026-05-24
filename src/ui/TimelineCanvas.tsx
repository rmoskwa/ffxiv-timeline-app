import type React from "react";
import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useTimelineStore } from "@/state/timeline-store";
import { BossLane } from "./BossLane";
import { PlayerLane } from "./PlayerLane";
import { Ruler } from "./Ruler";
import {
  clampZoom,
  DEFAULT_PX_PER_SEC,
  pickTickIntervalSec,
  ZOOM_WHEEL_FACTOR,
} from "./timeline-constants";
import { type RowSize, useRowSizeStore } from "./use-row-size";
import { useViewStore } from "./use-view";
import { useZoom, useZoomStore } from "./use-zoom";

// Shared horizontal scroll surface. Owns the ruler so it stays aligned with
// every lane below it. Boss lane on top, then one row per roster slot.
//
// The toolbar above the canvas hosts the zoom controls (PRD §18 — fixed-zoom
// resolution lifted in favor of a 1s/5s/15s/30s/60s ladder, see Ruler).
//
// Ctrl/Alt + wheel zooms around the cursor: we use flushSync so the new px/s
// is committed before we recompute scrollLeft from the post-zoom geometry —
// otherwise the scroll snap and the zoom would race for the same paint frame.
export function TimelineCanvas() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const { pxPerSec } = useZoom();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setZoom = useZoomStore((s) => s.setZoom);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.altKey)) return;
      e.preventDefault();
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const trackEl = scrollEl.querySelector<HTMLElement>(".ruler-track");
      if (!trackEl) return;

      const oldPxPerSec = useZoomStore.getState().pxPerSec;
      const trackRect = trackEl.getBoundingClientRect();
      const timeAtCursor = (e.clientX - trackRect.left) / oldPxPerSec;

      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      const newPxPerSec = clampZoom(oldPxPerSec * factor);
      if (newPxPerSec === oldPxPerSec) return;

      const oldScrollLeft = scrollEl.scrollLeft;
      flushSync(() => setZoom(newPxPerSec));
      scrollEl.scrollLeft = oldScrollLeft + timeAtCursor * (newPxPerSec - oldPxPerSec);
    },
    [setZoom],
  );

  if (!roster) return null;

  const tickIntervalSec = pickTickIntervalSec(pxPerSec);

  return (
    <div className="timeline-canvas">
      <ZoomToolbar />
      <div ref={scrollRef} className="lane-scroll" onWheel={handleWheel}>
        <div
          className="lane-content"
          style={
            {
              ["--tick-px" as string]: `${tickIntervalSec * pxPerSec}px`,
            } as React.CSSProperties
          }
        >
          <Ruler />
          <BossLane />
          {roster.map((slot, i) =>
            hiddenSlotIds.has(slot.id) ? null : <PlayerLane key={slot.id} slot={slot} index={i} />,
          )}
        </div>
      </div>
    </div>
  );
}

function ZoomToolbar() {
  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  const zoomIn = useZoomStore((s) => s.zoomIn);
  const zoomOut = useZoomStore((s) => s.zoomOut);
  const reset = useZoomStore((s) => s.reset);
  const rowSize = useRowSizeStore((s) => s.size);
  const setRowSize = useRowSizeStore((s) => s.setSize);
  const tickIntervalSec = pickTickIntervalSec(pxPerSec);
  const percent = Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100);
  const tickLabel = tickIntervalSec >= 60 ? "1m" : `${tickIntervalSec}s`;

  const rowOptions: readonly { value: RowSize; label: string }[] = [
    { value: "sm", label: "Small" },
    { value: "md", label: "Medium" },
    { value: "lg", label: "Large" },
  ];

  return (
    <div className="timeline-toolbar">
      <span className="timeline-toolbar-title">Timeline Zoom:</span>
      <div className="timeline-toolbar-zoom">
        <button
          type="button"
          className="zoom-button"
          onClick={zoomOut}
          title="Zoom out (Ctrl/Alt + wheel)"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="zoom-readout"
          onClick={reset}
          title="Reset zoom to 100%"
          aria-label={`Current zoom ${percent}%, click to reset`}
        >
          {percent}% · {tickLabel}
        </button>
        <button
          type="button"
          className="zoom-button"
          onClick={zoomIn}
          title="Zoom in (Ctrl/Alt + wheel)"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      <span className="timeline-toolbar-title">Timeline Row Size:</span>
      <div className="timeline-toolbar-zoom">
        {rowOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`toolbar-toggle${rowSize === opt.value ? " is-selected" : ""}`}
            onClick={() => setRowSize(opt.value)}
            aria-pressed={rowSize === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
