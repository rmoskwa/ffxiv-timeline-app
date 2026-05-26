import { useEffect, useRef } from "react";
import type { Roster } from "@/domain/types";
import { JobIcon } from "./JobIcon";
import { jobColor } from "./role-color";

interface TargetPickerProps {
  roster: Roster;
  selectedIds: readonly string[];
  // Max slots the user may pick. 1 for affects:target mits; up to 8 for the
  // `targeted` boss pattern.
  maxSelections: number;
  // Minimum slots required for a valid pick. Defaults to maxSelections so the
  // header reads "(X/N)" for fixed-cardinality picks. When min < max (only
  // boss `targeted` today), the header reads "(X selected)".
  minSelections?: number;
  // Slot ids that cannot be picked. Rendered disabled in the grid. Used by
  // affects:target mits to exclude the caster (target_or_self keeps all 8).
  excludedSlotIds?: readonly string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  // Popovers (BossMarker, MitBar, conflicts-panel rows) want click-outside to
  // dismiss; the inspector picker lives inside a persistent panel and lets the
  // parent own the dismiss model. Defaults to true to preserve popover behavior.
  dismissOnOutsideClick?: boolean;
}

// Anchored popover used by both BossMarker and MitBar. Position is the parent's
// responsibility (rendered as a positioned child) — this component owns the
// dismiss logic (click-outside, Escape) and the 8-slot grid.
export function TargetPicker({
  roster,
  selectedIds,
  maxSelections,
  minSelections,
  excludedSlotIds,
  onChange,
  onClose,
  dismissOnOutsideClick = true,
}: TargetPickerProps) {
  const min = minSelections ?? maxSelections;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    if (!dismissOnOutsideClick) {
      return () => document.removeEventListener("keydown", onKey);
    }
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, dismissOnOutsideClick]);

  const toggle = (slotId: string) => {
    if (excludedSlotIds?.includes(slotId)) return;
    if (selectedIds.includes(slotId)) {
      onChange(selectedIds.filter((id) => id !== slotId));
      return;
    }
    if (maxSelections === 1) {
      onChange([slotId]);
      return;
    }
    if (selectedIds.length < maxSelections) {
      onChange([...selectedIds, slotId]);
    }
    // Else: at cap for multi-select — user must deselect first.
  };

  return (
    <div
      ref={ref}
      className="target-picker"
      role="dialog"
      aria-label="Pick target"
      // Lets TimelineEditor's Esc/Delete handler differentiate popovers
      // (which own their own dismissal) from embedded pickers (which let
      // the editor's selection model run).
      data-picker-mode={dismissOnOutsideClick ? "popover" : "embedded"}
    >
      <div className="target-picker-header">
        <span>
          {maxSelections === 1
            ? "Pick target"
            : min === maxSelections
              ? `Pick targets (${selectedIds.length}/${maxSelections})`
              : `Pick targets (${selectedIds.length} selected)`}
        </span>
        <button
          type="button"
          className="target-picker-close"
          onClick={onClose}
          aria-label="Close target picker"
        >
          ×
        </button>
      </div>
      <ul className="target-picker-grid">
        {roster.map((slot, i) => {
          const selected = selectedIds.includes(slot.id);
          const excluded = excludedSlotIds?.includes(slot.id) ?? false;
          const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
          const isUnset = slot.job === "unset";
          return (
            <li key={slot.id}>
              <button
                type="button"
                className={`target-picker-slot${selected ? " is-selected" : ""}${isUnset ? " is-unset" : ""}${excluded ? " is-excluded" : ""}`}
                onClick={() => toggle(slot.id)}
                disabled={excluded}
                title={
                  excluded
                    ? `Slot ${i + 1} · ${label} (caster — not targetable)`
                    : `Slot ${i + 1} · ${label}`
                }
                style={isUnset ? undefined : { backgroundColor: jobColor(slot.job) }}
              >
                <span className="target-picker-num">{i + 1}</span>
                <JobIcon job={slot.job} size={20} title={label} />
                <span className="target-picker-name">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
