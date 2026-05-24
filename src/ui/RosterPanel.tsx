import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { jobColor } from "./role-color";
import { useViewStore } from "./use-view";

export function RosterPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const hiddenSlotIds = useViewStore((s) => s.hiddenSlotIds);
  const toggleSlot = useViewStore((s) => s.toggleSlot);
  if (!roster) return null;

  return (
    <section className="roster-panel">
      <h3>Roster</h3>
      <ol className="roster-list">
        {roster.map((slot, i) => {
          const isUnset = slot.job === "unset";
          const isHidden = hiddenSlotIds.has(slot.id);
          const classes = ["roster-slot"];
          if (isUnset) classes.push("unset");
          if (isHidden) classes.push("hidden");
          // Skip the job-color inline style when hidden so the .hidden class's
          // muted background wins without needing !important.
          const liStyle = isUnset || isHidden ? undefined : { background: jobColor(slot.job) };
          return (
            <li key={slot.id} className={classes.join(" ")} style={liStyle}>
              <JobIcon job={slot.job} size={28} title={slot.name_label ?? slot.job} />
              <span className="slot-label">
                <span className="slot-num">{i + 1}</span>
                <span className="slot-job">{slot.name_label ?? slot.job}</span>
              </span>
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
