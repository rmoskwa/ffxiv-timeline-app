import type React from "react";
import { useEffect, useRef, useState } from "react";
import { targetingForMit } from "@/domain/targeting";
import { formatMitMagnitude, type MitigationInstance, type MitigationType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
import { jobColor } from "./role-color";
import { TargetPicker } from "./TargetPicker";
import { secondsToTimecode } from "./timeline-constants";
import { useRowSize } from "./use-row-size";
import { useZoom } from "./use-zoom";

interface MitBarProps {
  instance: MitigationInstance;
  type: MitigationType;
}

// Pixel distance the pointer must travel after pointerdown before we treat
// the gesture as a drag. Below the threshold, pointerup fires a click.
const DRAG_THRESHOLD_PX = 3;

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown).
export function MitBar({ instance, type }: MitBarProps) {
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const selectMitInstance = useTimelineStore((s) => s.selectMitInstance);
  const selected = useTimelineStore(
    (s) => s.selectedInstance?.kind === "mit" && s.selectedInstance.id === instance.id,
  );
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const { pxPerSec, laneDurationSec } = useZoom();
  const { mitBarHeight, mitIconSize } = useRowSize();

  // While dragging, `dragEffectTime` overrides `instance.effect_time` for
  // rendering only; the store commits the new value on pointerup.
  const [dragEffectTime, setDragEffectTime] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const renderEffectTime = dragEffectTime ?? instance.effect_time;

  const left = renderEffectTime * pxPerSec;
  // A mit placed near the end of the fight may legally extend past it (the
  // buff outlasts the encounter); clip the rendered widths so the bar stops
  // at the timeline edge.
  const remainingSec = Math.max(0, laneDurationSec - renderEffectTime);
  const visibleDurationSec = Math.min(type.duration_seconds, remainingSec);
  const cooldownTailSec = Math.max(0, type.cooldown_seconds - type.duration_seconds);
  const visibleCooldownTailSec = Math.max(
    0,
    Math.min(cooldownTailSec, remainingSec - visibleDurationSec),
  );
  const durationPx = visibleDurationSec * pxPerSec;
  const cooldownTailPx = visibleCooldownTailSec * pxPerSec;

  const targeting = targetingForMit(instance, type);
  const needsTarget = targeting.maxCount > 0;
  const targetUnset = needsTarget && !targeting.isComplete;
  const targetSlot = needsTarget ? roster?.find((s) => s.id === targeting.selection[0]) : undefined;

  // Auto-open the picker for a newly-dropped target mit. The effect dep on
  // targetUnset re-opens if the field is somehow cleared later.
  const [pickerOpen, setPickerOpen] = useState(targetUnset);
  useEffect(() => {
    if (targetUnset) setPickerOpen(true);
  }, [targetUnset]);

  // Pointerdown captures the starting cursor + the neighbor/lane snapshot we
  // need to drive clamping. Subsequent move/up events read from this ref.
  const dragStartRef = useRef<{
    pointerId: number;
    clientX: number;
    startEffectTime: number;
    minT: number;
    maxT: number;
    dragging: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const tl = useTimelineStore.getState().timeline;
    if (!tl) return;
    const neighbors = tl.mitigation_instances.filter(
      (m) =>
        m.id !== instance.id &&
        m.player_slot_id === instance.player_slot_id &&
        m.type_id === instance.type_id,
    );
    // Immediate neighbors on each side, by effect_time.
    let prev: MitigationInstance | null = null;
    let next: MitigationInstance | null = null;
    for (const n of neighbors) {
      if (n.effect_time < instance.effect_time) {
        if (!prev || n.effect_time > prev.effect_time) prev = n;
      } else {
        if (!next || n.effect_time < next.effect_time) next = n;
      }
    }
    const minT = prev ? prev.effect_time + type.cooldown_seconds : 0;
    // Right bound clamps against the next neighbor's left edge if any;
    // otherwise the timeline end. A bar's footprint may extend past the
    // end (the buff outlasts the encounter), so we don't subtract cooldown.
    const maxT = next ? next.effect_time - type.cooldown_seconds : tl.metadata.fight_duration_sec;
    dragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      startEffectTime: instance.effect_time,
      minT,
      maxT,
      dragging: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.clientX;
    if (!start.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      start.dragging = true;
      setDragging(true);
    }
    // Snap to whole seconds while dragging — matches placement's snap.
    const targetRaw = start.startEffectTime + Math.round(dx / pxPerSec);
    const clamped = Math.max(start.minT, Math.min(start.maxT, targetRaw));
    setDragEffectTime(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (start.dragging) {
      const finalT = dragEffectTime ?? instance.effect_time;
      if (finalT !== instance.effect_time) {
        updateMit(instance.id, { effect_time: finalT });
      }
    } else {
      selectMitInstance(instance.id);
    }
    dragStartRef.current = null;
    setDragging(false);
    setDragEffectTime(null);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    dragStartRef.current = null;
    setDragging(false);
    setDragEffectTime(null);
  };

  const title =
    `${type.name} @ ${secondsToTimecode(renderEffectTime)}\n` +
    `${formatMitMagnitude(type)} · ` +
    `${type.duration_seconds}s active / ${type.cooldown_seconds}s cd` +
    (targetUnset ? "\n⚠ no target picked — click the ? badge to assign" : "");

  return (
    <div
      className={
        `mit-bar${selected ? " mit-bar--selected" : ""}` +
        `${dragging ? " mit-bar--dragging" : ""}` +
        `${targetUnset ? " mit-bar--needs-target" : ""}` +
        `${targetSlot ? " mit-bar--has-target" : ""}` +
        `${pickerOpen ? " has-picker-open" : ""}`
      }
      style={{ left, height: mitBarHeight }}
      title={title}
      data-mit-id={instance.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className="mit-bar-duration"
        style={{
          width: durationPx,
          background: `color-mix(in srgb, ${jobColor(type.job)} 33%, transparent)`,
          ...(targetSlot && { outlineColor: jobColor(targetSlot.job) }),
        }}
      >
        {needsTarget && !targetSlot && !pickerOpen && (
          <button
            type="button"
            className="mit-bar-target-badge is-unset"
            title="Click to pick target"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
          >
            <span className="mit-bar-target-badge-q">?</span>
          </button>
        )}
      </div>
      {cooldownTailPx > 0 && (
        <div className="mit-bar-cooldown" style={{ width: cooldownTailPx }} aria-hidden />
      )}
      <span className="mit-bar-icon-overlay" style={{ left: pxPerSec / 2 }}>
        <MitIcon name={type.name} size={mitIconSize} title={type.name} />
      </span>
      {pickerOpen && needsTarget && roster && (
        <div className="mit-bar-popover" onPointerDown={(e) => e.stopPropagation()}>
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            minSelections={targeting.minCount}
            maxSelections={targeting.maxCount}
            onChange={(ids) => updateMit(instance.id, { target_slot_ids: ids })}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
