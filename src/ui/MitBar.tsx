import type React from "react";
import { useEffect, useRef, useState } from "react";
import { getGatedChildrenOf, getMitById } from "@/data/mit-library";
import { effectiveBarFootprintSeconds, effectiveCooldownSeconds } from "@/domain/damage";
import { targetingForMit } from "@/domain/targeting";
import {
  formatMitMagnitude,
  instanceActiveDurationSeconds,
  type MitigationInstance,
  type MitigationType,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
import { computeBarGeometry, computeChildGeometry } from "./mit-bar-geometry";
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
  // Placements of shared-recast partner mits on the same slot (e.g. Nascent
  // Flash instances when this bar is Bloodwhetting). Their effective cooldown
  // windows block this bar from being dragged into them, mirroring the
  // placement gate in MitSubLane.legalHoverSec.
  partnerInstances: readonly MitigationInstance[];
}

// Pixel distance the pointer must travel after pointerdown before we treat
// the gesture as a drag. Below the threshold, pointerup fires a click.
const DRAG_THRESHOLD_PX = 3;

// Multi-charge gated children (today: SCH Consolation) must keep a 2s gap
// between their casts — the SCH GCD floor. PRD §6.4 / §11. If a future child
// adds itself with max_charges > 1, lift this into a type-level field.
const GATED_CHILD_MIN_GAP_SECONDS = 2;

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown).
export function MitBar({ instance, type, rowSiblings, partnerInstances }: MitBarProps) {
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
  // rendering only; the store commits the new value on pointerup. Child
  // instances follow the parent's drag in the store via offset-glue.
  const [dragEffectTime, setDragEffectTime] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const renderEffectTime = dragEffectTime ?? instance.effect_time;
  const dragDelta = renderEffectTime - instance.effect_time;
  // Right-edge resize drag for held abilities (today: PLD Passage of Arms).
  // Overrides the instance's effective active duration during the gesture;
  // commits to `held_duration_seconds` on pointerup.
  const [dragHeldDuration, setDragHeldDuration] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const isHeldAbility = type.min_duration_seconds != null;
  const heldDurationSec = dragHeldDuration ?? instanceActiveDurationSeconds(type, instance);

  // Gated children attached to this parent. Resolves to actual instances on
  // the timeline (one-shot auto-spawn populates these; the user can delete
  // them via the X-affordance or re-add via the inspector).
  const childInstances = (allMits ?? []).filter((m) => m.parent_instance_id === instance.id);
  // Pre-resolve domain values at the React seam; geometry takes scalars.
  // See docs/adr/0001-view-layer-pure-modules.md.
  const dispelledAt = mitStates.get(instance.id)?.dispelled_at;
  const effectiveCdSec = effectiveCooldownSeconds(
    instance,
    type,
    allMits ?? [],
    getMitById,
    mitStates,
  );
  const geo = computeBarGeometry({
    effectTime: renderEffectTime,
    type,
    pxPerSec,
    laneDurationSec,
    effectiveCdSec,
    dispelledAt,
    heldDurationSec,
    childTypes: getGatedChildrenOf(type.id),
  });

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
    // Use the previous neighbor's EFFECTIVE footprint (max of CD and duration)
    // so a shrunken bar (e.g. a Tempera Coat whose shield was absorbed) frees
    // up the post-shrinkage gap for this bar's left edge — and a buff whose
    // active window exceeds its CD (Holy Sheltron) still blocks the entire
    // active period. The dragged bar's own right edge uses its own effective
    // footprint for the same reason.
    const thisFootprint = effectiveBarFootprintSeconds(
      instance,
      type,
      allMits ?? [],
      getMitById,
      mitStates,
    );
    const prevType = prev ? getMitById(prev.type_id) : undefined;
    const prevFootprint =
      prev && prevType
        ? effectiveBarFootprintSeconds(prev, prevType, allMits ?? [], getMitById, mitStates)
        : 0;
    let minT = prev ? prev.effect_time + prevFootprint : 0;
    let maxT = next ? next.effect_time - thisFootprint : tl.metadata.fight_duration_sec;
    // Offset-glued children must stay within the timeline. Snapshot each
    // child's current offset and tighten the parent's right-edge clamp so
    // dragging never pushes a child past fight_duration_sec.
    for (const child of childInstances) {
      const offset = child.effect_time - instance.effect_time;
      maxT = Math.min(maxT, tl.metadata.fight_duration_sec - offset);
    }
    // Shared-recast partners on the same slot block dragging into their
    // effective cooldown window. Partner active duration is irrelevant — the
    // mits never share an active window — so we clamp against partner CD only.
    for (const p of partnerInstances) {
      const pType = getMitById(p.type_id);
      if (!pType) continue;
      const pCd = effectiveCooldownSeconds(p, pType, allMits ?? [], getMitById, mitStates);
      if (p.effect_time < instance.effect_time) {
        minT = Math.max(minT, p.effect_time + pCd);
      } else {
        maxT = Math.min(maxT, p.effect_time - thisFootprint);
      }
    }
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

  // Right-edge resize for held abilities. Independent of the bar's
  // pointer-down move-drag — stopPropagation in handleResizeDown prevents the
  // outer handler from also capturing.
  const resizeStartRef = useRef<{
    pointerId: number;
    clientX: number;
    startHeld: number;
    minHeld: number;
    maxHeld: number;
    dragging: boolean;
  } | null>(null);

  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!isHeldAbility) return;
    e.stopPropagation();
    const minHeld = type.min_duration_seconds ?? 0;
    const maxHeld = type.duration_seconds;
    resizeStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      startHeld: heldDurationSec,
      minHeld,
      maxHeld,
      dragging: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.clientX;
    if (!start.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      start.dragging = true;
      setResizing(true);
    }
    const raw = start.startHeld + Math.round(dx / pxPerSec);
    const clamped = Math.max(start.minHeld, Math.min(start.maxHeld, raw));
    setDragHeldDuration(clamped);
  };

  const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (start.dragging) {
      const finalHeld = dragHeldDuration ?? heldDurationSec;
      const current = instanceActiveDurationSeconds(type, instance);
      if (finalHeld !== current) {
        updateMit(instance.id, { held_duration_seconds: finalHeld });
      }
    }
    resizeStartRef.current = null;
    setResizing(false);
    setDragHeldDuration(null);
  };

  const handleResizeCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    resizeStartRef.current = null;
    setResizing(false);
    setDragHeldDuration(null);
  };

  const titleActive = isHeldAbility
    ? `${heldDurationSec}s active (held, ${type.min_duration_seconds}–${type.duration_seconds}s)`
    : `${type.duration_seconds}s active`;
  const title =
    `${type.name} @ ${secondsToTimecode(renderEffectTime)}\n` +
    `${formatMitMagnitude(type)} · ` +
    `${titleActive} / ${type.cooldown_seconds}s cd` +
    (targetUnset ? "\n⚠ no target picked — click the ? badge to assign" : "");

  return (
    <div
      className={
        `mit-bar${selected ? " mit-bar--selected" : ""}` +
        `${dragging ? " mit-bar--dragging" : ""}` +
        `${resizing ? " mit-bar--resizing" : ""}` +
        `${targetUnset ? " mit-bar--needs-target" : ""}` +
        `${inConflict ? " mit-bar--in-conflict" : ""}` +
        `${targetSlot ? " mit-bar--has-target" : ""}` +
        `${pickerOpen ? " has-picker-open" : ""}`
      }
      style={{ left: geo.leftPx, height: mitBarHeight }}
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
          width: geo.durationPx,
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
      {geo.heldExtensionPx > 0 && (
        <div
          className="mit-bar-held-extension"
          style={{
            width: geo.heldExtensionPx,
            background: `color-mix(in srgb, ${jobColor(type.job)} 16%, transparent)`,
          }}
          aria-hidden
          title={`Drag the right edge to extend up to ${type.duration_seconds}s`}
        />
      )}
      {isHeldAbility && geo.durationPx > 0 && dispelledAt == null && (
        <div
          className="mit-bar-resize-handle"
          style={{ left: geo.durationPx - 3 }}
          title={`Hold duration: ${heldDurationSec}s (drag to ${type.min_duration_seconds}–${type.duration_seconds}s)`}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
          onPointerCancel={handleResizeCancel}
        />
      )}
      {geo.zoneExtensionPx > 0 && (
        <div
          className="mit-bar-zone-extension"
          style={{
            width: geo.zoneExtensionPx,
            background: `color-mix(in srgb, ${jobColor(type.job)} 16%, transparent)`,
          }}
          aria-hidden
          title="Execution zone (extends past active duration)"
        />
      )}
      {geo.zoneInnerPx !== undefined && (
        <div
          className="mit-bar-zone-inner"
          style={{ left: 0, width: geo.zoneInnerPx }}
          aria-hidden
        />
      )}
      {geo.tiers.map((tier) => (
        <div
          key={`tier-${tier.offsetSec}`}
          className="mit-bar-tier"
          style={{
            left: tier.leftPx,
            width: tier.widthPx,
            background: `color-mix(in srgb, ${jobColor(type.job)} 60%, transparent)`,
          }}
          aria-hidden
        />
      ))}
      {geo.cooldownTailPx > 0 && (
        <div className="mit-bar-cooldown" style={{ width: geo.cooldownTailPx }} aria-hidden />
      )}
      {(() => {
        const s = mitStates.get(instance.id);
        const conditional = type.conditional_bonus && s?.conditional_bonus_applied;
        const dispel = s?.dispel_bonus_applied;
        if (!conditional && !dispel) return null;
        // Anchor flush against the active band's right edge regardless of
        // dispel-clip, hold extension, or zone extension — geometry exposes
        // the sum; the +2 is cosmetic breathing room.
        const rightOffsetPx = geo.rightOfActivePx + 2;
        return (
          <span
            className="mit-bar-conditional-marker"
            style={{ right: rightOffsetPx }}
            aria-hidden
            title={
              dispel
                ? "Barrier bonus active — dispelled effects boosted the shield"
                : "Conditional bonus active — gate satisfied at cast time"
            }
          >
            +
          </span>
        );
      })()}
      <span className="mit-bar-icon-overlay" style={{ left: pxPerSec / 2 }}>
        <MitIcon name={type.name} size={mitIconSize} title={type.name} />
      </span>
      {childInstances.map((child) => {
        const childType = getMitById(child.type_id);
        if (!childType) return null;
        return (
          <ChildOverlay
            key={child.id}
            child={child}
            childType={childType}
            parent={instance}
            parentType={type}
            parentDragDelta={dragDelta}
            siblings={childInstances}
            iconSize={mitIconSize}
          />
        );
      })}
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

// ── Child overlay ──────────────────────────────────────────────────────────
// Renders one gated child instance on its parent's bar: optional duration band
// (split into inner-of-parent-active and hashed extension-past-active),
// draggable icon clamped to the execution zone, and an X-affordance when
// selected. PRD §6.2-§6.4.

interface ChildOverlayProps {
  child: MitigationInstance;
  childType: MitigationType;
  parent: MitigationInstance;
  parentType: MitigationType;
  // While the parent is mid-drag, its render position is offset from
  // instance.effect_time. The store hasn't committed yet, so the child's
  // stored effect_time also reflects the un-dragged position. We apply the
  // same delta on the render side so children visually follow the parent.
  parentDragDelta: number;
  // All children currently on this parent — used to clamp multi-charge gap.
  siblings: readonly MitigationInstance[];
  iconSize: number;
}

function ChildOverlay({
  child,
  childType,
  parent,
  parentType,
  parentDragDelta,
  siblings,
  iconSize,
}: ChildOverlayProps) {
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const removeMit = useTimelineStore((s) => s.removeMitigationInstance);
  const selectMitInstance = useTimelineStore((s) => s.selectMitInstance);
  const selected = useTimelineStore(
    (s) => s.selectedInstance?.kind === "mit" && s.selectedInstance.id === child.id,
  );
  const { pxPerSec, laneDurationSec } = useZoom();

  const [dragChildT, setDragChildT] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // While the parent drags, children follow by the same delta. While THIS
  // child drags, its own override takes precedence (the parent isn't moving).
  const renderChildT = dragChildT ?? child.effect_time + parentDragDelta;
  const renderParentT = parent.effect_time + parentDragDelta;

  // Drag clamp uses the library-default exec zone; geometry consumes it too
  // (via parentDurationSec — see ChildGeometry rules).
  const execZone = childType.execution_zone_seconds ?? parentType.duration_seconds;

  const geo = computeChildGeometry({
    childEffectTime: renderChildT,
    parentEffectTime: renderParentT,
    childType,
    parentDurationSec: parentType.duration_seconds,
    pxPerSec,
    laneDurationSec,
  });
  const childColor = jobColor(childType.job);

  const dragStartRef = useRef<{
    pointerId: number;
    clientX: number;
    startT: number;
    minT: number;
    maxT: number;
    dragging: boolean;
  } | null>(null);

  const beginDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Clamp to the execution zone, shrunk by 1s on each end: the child can't
    // share the parent's cast moment (+1s start boundary) and can't be cast on
    // the last legal frame of the zone (-1s end boundary — players can't
    // realistically activate at the tail of the buff). Also clamp to the
    // timeline edge, like any other mit.
    const baseMin = parent.effect_time + 1;
    const baseMax = Math.min(parent.effect_time + execZone - 1, laneDurationSec);
    // Multi-charge gap clamp (today: SCH Consolation, 2s).
    let gapMin = baseMin;
    let gapMax = baseMax;
    if (childType.max_charges > 1) {
      for (const s of siblings) {
        if (s.id === child.id) continue;
        if (s.type_id !== child.type_id) continue;
        if (s.effect_time < child.effect_time) {
          gapMin = Math.max(gapMin, s.effect_time + GATED_CHILD_MIN_GAP_SECONDS);
        } else {
          gapMax = Math.min(gapMax, s.effect_time - GATED_CHILD_MIN_GAP_SECONDS);
        }
      }
    }
    dragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      startT: child.effect_time,
      minT: gapMin,
      maxT: gapMax,
      dragging: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.clientX;
    if (!start.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      start.dragging = true;
      setDragging(true);
    }
    const raw = start.startT + Math.round(dx / pxPerSec);
    const clamped = Math.max(start.minT, Math.min(start.maxT, raw));
    setDragChildT(clamped);
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (start.dragging) {
      const finalT = dragChildT ?? child.effect_time;
      if (finalT !== child.effect_time) {
        updateMit(child.id, { effect_time: finalT });
      }
    } else {
      selectMitInstance(child.id);
    }
    dragStartRef.current = null;
    setDragging(false);
    setDragChildT(null);
  };

  const cancelDrag = (e: React.PointerEvent<HTMLElement>) => {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    dragStartRef.current = null;
    setDragging(false);
    setDragChildT(null);
  };

  const handleExtensionPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectMitInstance(child.id);
  };

  const iconTitle =
    `${childType.name} @ ${secondsToTimecode(renderChildT)}\n` +
    `${formatMitMagnitude(childType)} · gated by ${parentType.name}`;

  return (
    <>
      {geo.innerBand && (
        <div
          className="mit-child-band mit-child-band--inner"
          style={{
            left: geo.innerBand.leftPx,
            width: geo.innerBand.widthPx,
            background: `color-mix(in srgb, ${childColor} 55%, transparent)`,
          }}
          aria-hidden
        />
      )}
      {geo.extensionBand && (
        <div
          className="mit-child-band mit-child-band--extension"
          style={{
            left: geo.extensionBand.leftPx,
            width: geo.extensionBand.widthPx,
            // 45° hashed pattern in child's color. ~3px line spacing per PRD §6.2.
            background: `repeating-linear-gradient(45deg, ${childColor} 0 3px, transparent 3px 6px)`,
          }}
          onPointerDown={handleExtensionPointerDown}
          title={iconTitle}
        />
      )}
      <span
        className={`mit-child-icon${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
        style={{ left: geo.iconLeftPx, width: iconSize, height: iconSize }}
        title={iconTitle}
        data-mit-id={child.id}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      >
        <MitIcon name={childType.name} size={iconSize} title={childType.name} />
        {selected && (
          <button
            type="button"
            className="mit-child-icon-x"
            title="Remove this child"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              removeMit(child.id);
            }}
          >
            ×
          </button>
        )}
      </span>
    </>
  );
}
