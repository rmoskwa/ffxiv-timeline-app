import { useDroppable } from "@dnd-kit/core";
import type { BossAbilityInstance, BossAbilityType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import {
  DROP_TARGET_BOSS_LANE,
  LABEL_INTERVAL_SEC,
  LANE_DURATION_SEC,
  LANE_WIDTH_PX,
  PX_PER_SEC,
  secondsToTimecode,
  TICK_INTERVAL_SEC,
} from "./timeline-constants";

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);

  const typeMap = new Map(types.map((t) => [t.id, t]));

  const { isOver, setNodeRef } = useDroppable({
    id: DROP_TARGET_BOSS_LANE,
    data: { kind: DROP_TARGET_BOSS_LANE },
  });

  return (
    <div className="lane-scroll">
      <div
        ref={setNodeRef}
        className={`lane-content${isOver ? " drop-active" : ""}`}
        style={{ width: LANE_WIDTH_PX }}
      >
        <Ruler />
        <div className="boss-lane">
          <div className="lane-gridlines" aria-hidden />
          {instances.map((inst) => {
            const type = typeMap.get(inst.type_id);
            if (!type) return null; // orphan instance — store cascade should prevent this
            return (
              <BossMarker
                key={inst.id}
                instance={inst}
                type={type}
                onRemove={() => removeInstance(inst.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Ruler() {
  const ticks: number[] = [];
  for (let t = 0; t <= LANE_DURATION_SEC; t += TICK_INTERVAL_SEC) ticks.push(t);

  return (
    <div className="ruler" aria-hidden>
      {ticks.map((t) => {
        const isLabeled = t % LABEL_INTERVAL_SEC === 0;
        return (
          <div
            key={t}
            className={`tick${isLabeled ? " tick--labeled" : ""}`}
            style={{ left: t * PX_PER_SEC }}
          >
            {isLabeled && <span className="tick-label">{secondsToTimecode(t)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function BossMarker({
  instance,
  type,
  onRemove,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  onRemove: () => void;
}) {
  const tp = instance.target_pattern_override ?? type.target_pattern;
  const damage = instance.damage_override ?? type.base_damage;
  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${damage > 0 ? `${damage.toLocaleString()} ` : ""}${type.damage_type} · ${tp}`;

  return (
    <div className="boss-marker" style={{ left: instance.effect_time * PX_PER_SEC }} title={title}>
      <button
        type="button"
        className="boss-marker-remove"
        title="Remove this placement"
        onClick={onRemove}
      >
        ×
      </button>
      <div className="boss-marker-pin" />
      <div className="boss-marker-label">{type.name}</div>
    </div>
  );
}
