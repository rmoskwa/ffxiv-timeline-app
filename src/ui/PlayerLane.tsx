import { useDroppable } from "@dnd-kit/core";
import { getMitById } from "@/data/mit-library";
import type { MitigationInstance, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitBar } from "./MitBar";
import { DROP_TARGET_PLAYER_LANE, LANE_WIDTH_PX } from "./timeline-constants";

interface PlayerLaneProps {
  slot: PlayerSlot;
  index: number;
}

// Module-level stable empty array so the selector returns a cached reference
// when no timeline is loaded. Zustand v5 + React 19's useSyncExternalStore
// throw "getSnapshot should be cached" if a selector returns a new reference
// on every read; filtering must happen after the selector, not inside it.
const EMPTY_MITS: readonly MitigationInstance[] = [];

export function PlayerLane({ slot, index }: PlayerLaneProps) {
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  const mits = allMits.filter((m) => m.player_slot_id === slot.id);

  const { isOver, setNodeRef } = useDroppable({
    id: `${DROP_TARGET_PLAYER_LANE}-${slot.id}`,
    data: { kind: DROP_TARGET_PLAYER_LANE, slotId: slot.id },
  });

  const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);

  return (
    <div className={`lane-row lane-row--player${slot.job === "unset" ? " is-unset" : ""}`}>
      <div className="lane-label lane-label--player">
        <span className="lane-slot-num">{index + 1}</span>
        <JobIcon job={slot.job} size={22} title={label} />
        <span className="lane-slot-name">{label}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`lane-track player-lane-track${isOver ? " drop-active" : ""}`}
        style={{ width: LANE_WIDTH_PX }}
      >
        <div className="lane-gridlines" aria-hidden />
        {mits.map((m) => {
          const mt = getMitById(m.type_id);
          if (!mt) return null;
          return <MitBar key={m.id} instance={m} type={mt} />;
        })}
      </div>
    </div>
  );
}
