import type React from "react";
import { useEffect, useRef, useState } from "react";
import { getMitById } from "@/data/mit-library";
import { effectiveCooldownSeconds } from "@/domain/damage";
import { targetingForMit } from "@/domain/targeting";
import { formatMitMagnitude, type MitigationInstance, type MitigationType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
import { jobColor } from "./role-color";
import { TargetPicker } from "./TargetPicker";
import { secondsToTimecode } from "./timeline-constants";
import { useConflictedMitIds, useMitInstanceStates } from "./use-derived";
import { useRowSize } from "./use-row-size";
import { useZoom } from "./use-zoom";

interface MitBarProps {
  instance: MitigationInstance;
  type: MitigationType;
  // Other placements on this bar's charge-row. Used to clamp drag bounds
  // against immediate row neighbors only — bars on other charge-rows of the
  // same ability are unrelated for drag purposes. May include this bar itself;
  // the handler filters self out.
  rowSiblings: readonly MitigationInstance[];
}

// Pixel distance the pointer must travel after pointerdown before we treat
// the gesture as a drag. Below the threshold, pointerup fires a click.
const DRAG_THRESHOLD_PX = 3;

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown).
export function MitBar({ instance, type, rowSiblings }: MitBarProps) {
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const selectMitInstance = useTimelineStore((s) => s.selectMitInstance);
  const selected = useTimelineStore(
    (s) => s.selectedInstance?.kind === "mit" && s.selectedInstance.id === instance.id,
  );
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances);
  const mitStates = useMitInstanceStates();
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
  // Effective cooldown after CD-reduce-on-absorb (Coat-on-Coat-absorb,
  // Coat-on-Grassa-absorb) and consumes-mirror (Grassa's bar always matches
  // the Coat instance it came from).
  const effectiveCdSec = effectiveCooldownSeconds(
    instance,
    type,
    allMits ?? [],
    getMitById,
    mitStates,
  );
  const cooldownTailSec = Math.max(0, effectiveCdSec - type.duration_seconds);
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
  // Any active conflict on this mit triggers the yellow-dashed outline and
  // — via useDamageByInstance — excludes it from damage math.
  const inConflict = useConflictedMitIds().has(instance.id);

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
    // Only this bar's charge-row matters for drag clamping. Bars on the other
    // charge-row of a multi-charge mit are independent placements and must
    // not constrain this bar's movement.
    const neighbors = rowSiblings.filter((m) => m.id !== instance.id);
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
    // Use the previous neighbor's EFFECTIVE cooldown so a shrunken bar (e.g.
    // a Tempera Coat whose shield was absorbed) frees up the post-shrinkage
    // gap for this bar's left edge. The dragged bar's own right edge uses its
    // own effective cooldown for the same reason.
    const thisEffectiveCd = effectiveCooldownSeconds(
      instance,
      type,
      allMits ?? [],
      getMitById,
      mitStates,
    );
    const prevType = prev ? getMitById(prev.type_id) : undefined;
    const prevEffectiveCd =
      prev && prevType
        ? effectiveCooldownSeconds(prev, prevType, allMits ?? [], getMitById, mitStates)
        : 0;
    const minT = prev ? prev.effect_time + prevEffectiveCd : 0;
    const maxT = next ? next.effect_time - thisEffectiveCd : tl.metadata.fight_duration_sec;
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
        `${inConflict ? " mit-bar--in-conflict" : ""}` +
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
            excludedSlotIds={type.affects === "target" ? [instance.player_slot_id] : []}
            onChange={(ids) => updateMit(instance.id, { target_slot_ids: ids })}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
