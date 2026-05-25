import { useMemo, useState } from "react";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { JobPicker } from "./JobPicker";
import { jobColor } from "./role-color";
import { useViewStore } from "./use-view";

export function RosterPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? []);
  const setSlotJob = useTimelineStore((s) => s.setSlotJob);
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const toggleSlot = useViewStore((s) => s.toggleSlot);
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);

  const mitCountBySlotId = useMemo(() => {
    const m = new Map<string, number>();
    for (const mit of mits) m.set(mit.player_slot_id, (m.get(mit.player_slot_id) ?? 0) + 1);
    return m;
  }, [mits]);

  if (!roster) return null;

  return (
    <section className="roster-panel">
      <h3>Roster</h3>
      <ol className="roster-list">
        {roster.map((slot, i) => {
          const isUnset = slot.job === "unset";
          const isHidden = hiddenSlotIds.has(slot.id);
          const pickerOpen = openPickerIdx === i;
          const classes = ["roster-slot"];
          if (isUnset) classes.push("unset");
          if (isHidden) classes.push("hidden");
          if (pickerOpen) classes.push("has-picker-open");
          // Skip the job-color inline style when hidden so the .hidden class's
          // muted background wins without needing !important.
          const liStyle = isUnset || isHidden ? undefined : { background: jobColor(slot.job) };
          const triggerLabel = isUnset
            ? `Add job to slot ${i + 1}`
            : `Change job in slot ${i + 1} (currently ${slot.name_label ?? slot.job})`;
          return (
            <li key={slot.id} className={classes.join(" ")} style={liStyle}>
              <button
                type="button"
                className="roster-slot-trigger"
                // Stops the picker's document-level mousedown handler from
                // closing the popover before this click toggles it. Without
                // this, re-clicking the trigger would flicker (close+reopen).
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setOpenPickerIdx(pickerOpen ? null : i)}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                aria-label={triggerLabel}
              >
                <JobIcon job={slot.job} size={28} title={slot.name_label ?? slot.job} />
                <span className="slot-label">
                  <span className="slot-num">{i + 1}</span>
                  <span className="slot-job">{slot.name_label ?? slot.job}</span>
                </span>
                <span className="roster-slot-hover-glyph" aria-hidden="true">
                  {isUnset ? "+" : "↻"}
                </span>
              </button>
              <button
                type="button"
                className="slot-visibility-toggle"
                onClick={() => toggleSlot(slot.id)}
                title={
                  isHidden ? "Show this lane on the timeline" : "Hide this lane from the timeline"
                }
              >
                {isHidden ? "Show" : "Hide"}
              </button>
              {pickerOpen && (
                <JobPicker
                  currentJob={slot.job}
                  slotIndex={i}
                  mitCount={mitCountBySlotId.get(slot.id) ?? 0}
                  anchorRight={i >= roster.length / 2}
                  onPick={(job) => {
                    setSlotJob(i, job);
                    setOpenPickerIdx(null);
                  }}
                  onClose={() => setOpenPickerIdx(null)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
