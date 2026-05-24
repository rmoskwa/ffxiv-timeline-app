import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { jobColor } from "./role-color";

export function RosterPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  if (!roster) return null;

  return (
    <section className="roster-panel">
      <h3>Roster</h3>
      <ol className="roster-list">
        {roster.map((slot, i) => {
          const isUnset = slot.job === "unset";
          return (
            <li
              key={slot.id}
              className={isUnset ? "unset" : ""}
              style={isUnset ? undefined : { background: jobColor(slot.job) }}
            >
              <JobIcon job={slot.job} size={28} title={slot.name_label ?? slot.job} />
              <span className="slot-label">
                <span className="slot-num">{i + 1}</span>
                <span className="slot-job">{slot.name_label ?? slot.job}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
