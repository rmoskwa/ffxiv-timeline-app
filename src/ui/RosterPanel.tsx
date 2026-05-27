import { useMemo, useState } from "react";
import { SLOT_HP_MAX, SLOT_HP_MIN, useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { JobPicker } from "./JobPicker";
import { NumberInput } from "./primitives/NumberInput";
import { jobColor } from "./role-color";
import { PLAYER_MAX_HP } from "./timeline-constants";
import { useViewStore } from "./use-view";

export function RosterPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const mits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? []);
  const setSlotJob = useTimelineStore((s) => s.setSlotJob);
  const setSlotHp = useTimelineStore((s) => s.setSlotHp);
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
                  <span className="slot-job">{slot.name_label ?? slot.job}</span>
                </span>
                <span className="roster-slot-hover-glyph" aria-hidden="true">
                  {isUnset ? "+" : "↻"}
                </span>
              </button>
              <SlotHpInput
                slotIdx={i}
                hp={slot.hp}
                disabled={isUnset}
                onCommit={(next) => setSlotHp(i, next)}
              />
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

// 150000 → "150k". HP is always ≥ 1000 (store clamps to SLOT_HP_MIN), so the
// "k" suffix never collapses to a bare number.
function formatHp(hp: number): string {
  return `${Math.round(hp / 1000)}k`;
}

// Display swaps on focus: formatted "150k" when blurred, raw integer "150000"
// while editing. Accepts commas and k-suffix at parse time via NumberInput's
// shared parser. The store clamps to [SLOT_HP_MIN, SLOT_HP_MAX] so out-of-range
// commits snap to the nearest valid value.
function SlotHpInput({
  slotIdx,
  hp,
  disabled,
  onCommit,
}: {
  slotIdx: number;
  hp: number | undefined;
  disabled: boolean;
  onCommit: (hp: number) => void;
}) {
  const committed = hp ?? PLAYER_MAX_HP;
  const labelText = `HP for slot ${slotIdx + 1}`;
  const inputId = `slot-hp-${slotIdx}`;

  return (
    <label
      htmlFor={inputId}
      className={`slot-hp-field${disabled ? " is-disabled" : ""}`}
      title={labelText}
    >
      <span className="slot-hp-prefix" aria-hidden="true">
        HP:
      </span>
      <NumberInput
        id={inputId}
        value={committed}
        ariaLabel={labelText}
        className="slot-hp-input"
        disabled={disabled}
        formatDisplay={formatHp}
        validate={(n) => n >= SLOT_HP_MIN && n <= SLOT_HP_MAX}
        onCommit={onCommit}
      />
    </label>
  );
}
