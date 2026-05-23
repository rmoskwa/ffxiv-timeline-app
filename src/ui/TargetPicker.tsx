import { useEffect, useRef } from "react";
import type { Roster } from "@/domain/types";
import { JobIcon } from "./JobIcon";

interface TargetPickerProps {
  roster: Roster;
  selectedIds: readonly string[];
  // 1 for tankbuster_single / targeted / affects:target mit. 2 for tankbuster_shared.
  maxSelections: number;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

// Anchored popover used by both BossMarker and MitBar. Position is the parent's
// responsibility (rendered as a positioned child) — this component owns the
// dismiss logic (click-outside, Escape) and the 8-slot grid.
export function TargetPicker({
  roster,
  selectedIds,
  maxSelections,
  onChange,
  onClose,
}: TargetPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggle = (slotId: string) => {
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
    <div ref={ref} className="target-picker" role="dialog" aria-label="Pick target">
      <div className="target-picker-header">
        <span>
          {maxSelections === 1
            ? "Pick target"
            : `Pick targets (${selectedIds.length}/${maxSelections})`}
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
          const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
          return (
            <li key={slot.id}>
              <button
                type="button"
                className={`target-picker-slot${selected ? " is-selected" : ""}${slot.job === "unset" ? " is-unset" : ""}`}
                onClick={() => toggle(slot.id)}
                title={`Slot ${i + 1} · ${label}`}
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
