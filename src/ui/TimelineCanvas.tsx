import { useTimelineStore } from "@/state/timeline-store";
import { BossLane } from "./BossLane";
import { PlayerLane } from "./PlayerLane";
import { Ruler } from "./Ruler";

// Shared horizontal scroll surface. Owns the ruler so it stays aligned with
// every lane below it. Boss lane on top, then one row per roster slot.
export function TimelineCanvas() {
  const roster = useTimelineStore((s) => s.timeline?.roster);
  if (!roster) return null;

  return (
    <div className="lane-scroll">
      <div className="lane-content">
        <Ruler />
        <BossLane />
        {roster.map((slot, i) => (
          <PlayerLane key={slot.id} slot={slot} index={i} />
        ))}
      </div>
    </div>
  );
}
