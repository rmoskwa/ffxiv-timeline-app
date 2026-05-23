import { useDroppable } from "@dnd-kit/core";
import { getMitById } from "@/data/mit-library";
import type {
  BossAbilityInstance,
  BossAbilityType,
  MitigationInstance,
  PlayerSlot,
} from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitBar } from "./MitBar";
import {
  DROP_TARGET_PLAYER_LANE,
  LANE_WIDTH_PX,
  PLAYER_MAX_HP,
  PX_PER_SEC,
} from "./timeline-constants";
import { useCooldownOverlapMitIds, useDamageByInstance } from "./use-derived";

interface PlayerLaneProps {
  slot: PlayerSlot;
  index: number;
}

// Module-level stable empty arrays so selectors return cached references when
// no timeline is loaded. Zustand v5 + React 19's useSyncExternalStore throw
// "getSnapshot should be cached" on unstable references; filtering must happen
// outside the selector.
const EMPTY_MITS: readonly MitigationInstance[] = [];
const EMPTY_INSTANCES: readonly BossAbilityInstance[] = [];
const EMPTY_TYPES: readonly BossAbilityType[] = [];

export function PlayerLane({ slot, index }: PlayerLaneProps) {
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  const bossInstances = useTimelineStore(
    (s) => s.timeline?.boss_ability_instances ?? EMPTY_INSTANCES,
  );
  const bossTypes = useTimelineStore((s) => s.timeline?.boss_ability_types ?? EMPTY_TYPES);
  const damageByInstance = useDamageByInstance();
  const conflictIds = useCooldownOverlapMitIds();

  const mits = allMits.filter((m) => m.player_slot_id === slot.id);
  const typeById = new Map(bossTypes.map((t) => [t.id, t]));

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
        {bossInstances.map((inst) => {
          const damage = damageByInstance.get(inst.id)?.[index];
          // Hide the chip when this player isn't targeted (damage === 0).
          // Without it tankbusters / targeted hits — which return 0 until a
          // target is picked — would litter every lane with "0".
          if (damage === undefined || damage <= 0) return null;
          const type = typeById.get(inst.type_id);
          const lethal = damage >= PLAYER_MAX_HP;
          return (
            <div
              key={inst.id}
              className={`damage-chip${lethal ? " damage-chip--lethal" : ""}`}
              style={{ left: inst.effect_time * PX_PER_SEC }}
              title={`${type?.name ?? "hit"} — ${Math.round(damage).toLocaleString()} damage`}
            >
              {formatDamage(damage)}
            </div>
          );
        })}
        {mits.map((m) => {
          const mt = getMitById(m.type_id);
          if (!mt) return null;
          return <MitBar key={m.id} instance={m} type={mt} hasConflict={conflictIds.has(m.id)} />;
        })}
      </div>
    </div>
  );
}

// 12345 → "12.3k" so chips stay narrow at the v0.1 fixed zoom.
function formatDamage(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
