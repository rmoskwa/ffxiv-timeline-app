import { useEffect, useState } from "react";
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
  hasConflict?: boolean;
}

// Solid segment for the active window (T → T+duration), faded segment for the
// remaining cooldown (T+duration → T+cooldown). PRD §6.1, §8.
export function MitBar({ instance, type, hasConflict = false }: MitBarProps) {
  const remove = useTimelineStore((s) => s.removeMitigationInstance);
  const updateMit = useTimelineStore((s) => s.updateMitigationInstance);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const { pxPerSec } = useZoom();
  const { mitBarHeight, mitIconSize } = useRowSize();

  const left = instance.effect_time * pxPerSec;
  const durationPx = type.duration_seconds * pxPerSec;
  const cooldownTailSec = Math.max(0, type.cooldown_seconds - type.duration_seconds);
  const cooldownTailPx = cooldownTailSec * pxPerSec;

  const targeting = targetingForMit(instance, type);
  const needsTarget = targeting.requiredCount > 0;
  const targetUnset = needsTarget && !targeting.isComplete;
  const targetSlot = needsTarget ? roster?.find((s) => s.id === targeting.selection[0]) : undefined;

  // Auto-open the picker for a newly-dropped target mit. The effect dep on
  // targetUnset re-opens if the field is somehow cleared later.
  const [pickerOpen, setPickerOpen] = useState(targetUnset);
  useEffect(() => {
    if (targetUnset) setPickerOpen(true);
  }, [targetUnset]);

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${formatMitMagnitude(type)} · ` +
    `${type.duration_seconds}s active / ${type.cooldown_seconds}s cd` +
    (targetUnset ? "\n⚠ no target picked — click the ? badge to assign" : "") +
    (hasConflict ? "\n⚠ overlaps previous cooldown" : "");

  return (
    <div
      className={
        `mit-bar${hasConflict ? " mit-bar--conflict" : ""}` +
        `${targetUnset ? " mit-bar--needs-target" : ""}` +
        `${targetSlot ? " mit-bar--has-target" : ""}` +
        `${pickerOpen ? " has-picker-open" : ""}`
      }
      style={{ left, height: mitBarHeight }}
      title={title}
      data-mit-id={instance.id}
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
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
          >
            <span className="mit-bar-target-badge-q">?</span>
          </button>
        )}
        <button
          type="button"
          className="mit-bar-remove"
          title="Remove this mit"
          onClick={() => remove(instance.id)}
        >
          ×
        </button>
      </div>
      {cooldownTailPx > 0 && (
        <div className="mit-bar-cooldown" style={{ width: cooldownTailPx }} aria-hidden />
      )}
      <span className="mit-bar-icon-overlay" style={{ left: pxPerSec / 2 }}>
        <MitIcon name={type.name} size={mitIconSize} title={type.name} />
      </span>
      {pickerOpen && needsTarget && roster && (
        <div className="mit-bar-popover">
          <TargetPicker
            roster={roster}
            selectedIds={targeting.selection}
            maxSelections={targeting.requiredCount}
            onChange={(ids) => updateMit(instance.id, { target_slot_ids: ids })}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
