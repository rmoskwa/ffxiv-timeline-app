import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { DEFAULT_FIGHT_DURATION_SEC } from "@/domain/types";
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
import { type AppearanceTheme, useAppearanceStore } from "./use-appearance";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, useRowSizeStore } from "./use-row-size";
import { useViewStore } from "./use-view";
import { useZoom, useZoomStore } from "./use-zoom";

// Shared horizontal scroll surface. Owns the ruler so it stays aligned with
// every lane below it. Boss lane on top, then one row per roster slot.
//
// The toolbar above the canvas hosts the zoom controls (fixed-zoom resolution
// lifted in favor of a 1s/5s/15s/30s/60s ladder, see Ruler).
//
// Ctrl/Alt + wheel zooms around the cursor: we use flushSync so the new px/s
// is committed before we recompute scrollLeft from the post-zoom geometry —
// otherwise the scroll snap and the zoom would race for the same paint frame.
// Width of the sticky lane label column. Subtracted from the scroll container's
// width to derive the visible track region — must stay in sync with the
// `.lane-label` width in index.css.
const LANE_LABEL_WIDTH_PX = 130;

export function TimelineCanvas() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const fightDurationSec = useTimelineStore(
    (s) => s.timeline?.metadata.fight_duration_sec ?? DEFAULT_FIGHT_DURATION_SEC,
  );
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const { pxPerSec } = useZoom();
  const theme = useAppearanceStore((s) => s.theme);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setZoom = useZoomStore((s) => s.setZoom);
  const setMinPxPerSec = useZoomStore((s) => s.setMinPxPerSec);

  // Floor zoom at "the full fight fits in the visible track region" so users
  // can never zoom out into empty space past the end of the timeline. Re-runs
  // whenever the viewport resizes or the fight duration changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () => {
      const trackWidth = Math.max(0, el.clientWidth - LANE_LABEL_WIDTH_PX);
      if (trackWidth <= 0 || fightDurationSec <= 0) return;
      setMinPxPerSec(trackWidth / fightDurationSec);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fightDurationSec, setMinPxPerSec]);

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
      const newPxPerSec = clampZoom(oldPxPerSec * factor, useZoomStore.getState().minPxPerSec);
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
      <div ref={scrollRef} className={`lane-scroll theme-${theme}`} onWheel={handleWheel}>
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
  const iconSize = useRowSizeStore((s) => s.iconSize);
  const setIconSize = useRowSizeStore((s) => s.setIconSize);
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const tickIntervalSec = pickTickIntervalSec(pxPerSec);
  const percent = Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100);
  const tickLabel = tickIntervalSec >= 60 ? "1m" : `${tickIntervalSec}s`;

  const themeOptions: readonly { value: AppearanceTheme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
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
        <input
          type="range"
          className="row-size-slider"
          min={ICON_SIZE_MIN}
          max={ICON_SIZE_MAX}
          value={iconSize}
          onChange={(e) => setIconSize(Number(e.currentTarget.value))}
          aria-label={`Mit icon size, ${iconSize} pixels`}
          title={`Icon size: ${iconSize}px (${ICON_SIZE_MIN}–${ICON_SIZE_MAX})`}
        />
        <span className="row-size-readout">{iconSize}px</span>
      </div>
      <span className="timeline-toolbar-title">Timeline Appearance:</span>
      <div className="timeline-toolbar-zoom">
        {themeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`toolbar-toggle${theme === opt.value ? " is-selected" : ""}`}
            onClick={() => setTheme(opt.value)}
            aria-pressed={theme === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
