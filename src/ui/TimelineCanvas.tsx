import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { DEFAULT_FIGHT_DURATION_SEC } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { BossLane } from "./BossLane";
import { useClearTimelineModalStore } from "./ClearTimelineModal";
import { PlayerChipRow, PlayerLane, SlotMitGroup } from "./PlayerLane";
import { Ruler } from "./Ruler";
import {
  clampZoom,
  DEFAULT_PX_PER_SEC,
  JOB_GUTTER_PX,
  LANE_LABEL_WIDTH_PX,
  pickTickIntervalSec,
  ZOOM_WHEEL_FACTOR,
} from "./timeline-constants";
import { type AppearanceTheme, useAppearanceStore } from "./use-appearance";
import { useBossGuidesStore } from "./use-boss-guides";
import { type ChipPosition, useChipLayoutStore } from "./use-chip-layout";
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

export function TimelineCanvas() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const fightDurationSec = useTimelineStore(
    (s) => s.timeline?.metadata.fight_duration_sec ?? DEFAULT_FIGHT_DURATION_SEC,
  );
  const prePullSec = useTimelineStore((s) => s.timeline?.metadata.pre_pull_duration_sec ?? 0);
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const { pxPerSec } = useZoom();
  const theme = useAppearanceStore((s) => s.theme);
  const chipPosition = useChipLayoutStore((s) => s.position);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setZoom = useZoomStore((s) => s.setZoom);
  const setMinPxPerSec = useZoomStore((s) => s.setMinPxPerSec);

  // Floor zoom at "the full fight fits in the visible track region" so users
  // can never zoom out into empty space past the end of the timeline. Re-runs
  // whenever the viewport resizes, the fight duration changes, or the chip
  // layout adds/removes the job gutter column.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const labelRegion =
      chipPosition === "interleaved" ? LANE_LABEL_WIDTH_PX : LANE_LABEL_WIDTH_PX + JOB_GUTTER_PX;
    const recompute = () => {
      const trackWidth = Math.max(0, el.clientWidth - labelRegion);
      const spanSec = fightDurationSec + prePullSec;
      if (trackWidth <= 0 || spanSec <= 0) return;
      setMinPxPerSec(trackWidth / spanSec);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fightDurationSec, prePullSec, setMinPxPerSec, chipPosition]);

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
  const visibleSlots = roster
    .map((slot, i) => ({ slot, index: i }))
    .filter(({ slot }) => !hiddenSlotIds.has(slot.id));

  const separated = chipPosition !== "interleaved";
  const chipSection = separated ? (
    <div className="chip-section">
      {visibleSlots.map(({ slot, index }) => (
        <PlayerChipRow key={slot.id} slot={slot} index={index} />
      ))}
    </div>
  ) : null;
  const mitCanvas = separated ? (
    <div className="mit-canvas">
      {visibleSlots.map(({ slot, index }) => (
        <SlotMitGroup key={slot.id} slot={slot} index={index} />
      ))}
    </div>
  ) : null;

  return (
    <div className="timeline-canvas">
      <ZoomToolbar />
      <div
        ref={scrollRef}
        className={`lane-scroll theme-${theme} chip-position-${chipPosition}`}
        onWheel={handleWheel}
      >
        <div
          className="lane-content"
          style={
            {
              ["--tick-px" as string]: `${tickIntervalSec * pxPerSec}px`,
              // Gridlines anchor to the track's left edge; with a Pre-pull
              // section that edge sits at -prePullSec, so shift the repeating
              // pattern right to keep gridlines on whole tick multiples.
              ["--prepull-px" as string]: `${prePullSec * pxPerSec}px`,
            } as React.CSSProperties
          }
        >
          <Ruler />
          <BossLane />
          {separated ? (
            <>
              {chipPosition === "top" && chipSection}
              {mitCanvas}
              {chipPosition === "bottom" && chipSection}
            </>
          ) : (
            visibleSlots.map(({ slot, index }) => (
              <PlayerLane key={slot.id} slot={slot} index={index} />
            ))
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
  const chipPosition = useChipLayoutStore((s) => s.position);
  const setChipPosition = useChipLayoutStore((s) => s.setPosition);
  const guidesVisible = useBossGuidesStore((s) => s.visible);
  const setGuidesVisible = useBossGuidesStore((s) => s.setVisible);
  const tickIntervalSec = pickTickIntervalSec(pxPerSec);
  const percent = Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100);
  const tickLabel = tickIntervalSec >= 60 ? "1m" : `${tickIntervalSec}s`;

  const themeOptions: readonly { value: AppearanceTheme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  // Spatial order: Top (chips above mit canvas) → Interleaved → Bottom.
  const chipPositionOptions: readonly { value: ChipPosition; label: string }[] = [
    { value: "top", label: "Top" },
    { value: "interleaved", label: "Interleaved" },
    { value: "bottom", label: "Bottom" },
  ];

  const bossLineOptions: readonly { value: boolean; label: string }[] = [
    { value: true, label: "Show" },
    { value: false, label: "Hide" },
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
      <span className="timeline-toolbar-title">Timeline Icon Size:</span>
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
      <span className="timeline-toolbar-title">Timeline Damage Chips:</span>
      <div className="timeline-toolbar-zoom">
        {chipPositionOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`toolbar-toggle${chipPosition === opt.value ? " is-selected" : ""}`}
            onClick={() => setChipPosition(opt.value)}
            aria-pressed={chipPosition === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className="timeline-toolbar-title">Timeline Boss Lines:</span>
      <div className="timeline-toolbar-zoom">
        {bossLineOptions.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`toolbar-toggle${guidesVisible === opt.value ? " is-selected" : ""}`}
            onClick={() => setGuidesVisible(opt.value)}
            aria-pressed={guidesVisible === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <ClearTimelineControl />
    </div>
  );
}

// Right-justified Clear Timeline button. Wipes boss ability types/instances,
// mitigation instances, and phases — roster + metadata survive. Disabled when
// there's nothing to clear; otherwise opens the shared confirmation modal
// (also reachable from Edit ▸ Clear Timeline in the menu bar).
function ClearTimelineControl() {
  const hasContent = useTimelineStore((s) => {
    const t = s.timeline;
    if (!t) return false;
    return (
      t.boss_ability_types.length > 0 ||
      t.boss_ability_instances.length > 0 ||
      t.mitigation_instances.length > 0 ||
      t.phases.length > 0
    );
  });
  const openModal = useClearTimelineModalStore((s) => s.open);

  return (
    <button
      type="button"
      className="clear-timeline-button"
      onClick={openModal}
      disabled={!hasContent}
      title={
        hasContent
          ? "Wipe boss abilities, mitigations, and phases (roster preserved)"
          : "Nothing to clear"
      }
    >
      Clear Timeline
    </button>
  );
}
