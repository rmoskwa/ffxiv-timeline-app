import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";

export function RosterPanel() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  if (!roster) return null;

  return (
    <section className="roster-panel">
      <h3>Roster</h3>
      <ol className="roster-list">
        {roster.map((slot, i) => (
          <li key={slot.id} className={slot.job === "unset" ? "unset" : ""}>
            <JobIcon job={slot.job} size={28} title={slot.name_label ?? slot.job} />
            <span className="slot-label">
              <span className="slot-num">{i + 1}</span>
              <span className="slot-job">{slot.name_label ?? slot.job}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
