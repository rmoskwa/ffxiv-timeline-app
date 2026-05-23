import { useDroppable } from "@dnd-kit/core";
import type { BossAbilityInstance, BossAbilityType } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import {
  DROP_TARGET_BOSS_LANE,
  LANE_WIDTH_PX,
  PLAYER_MAX_HP,
  PX_PER_SEC,
  secondsToTimecode,
} from "./timeline-constants";
import { useDamageByInstance } from "./use-derived";

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);
  const damageByInstance = useDamageByInstance();

  const typeMap = new Map(types.map((t) => [t.id, t]));

  // useDroppable lives on the track (LANE_WIDTH_PX wide). over.rect.left is the
  // track's left edge in viewport coords — already accounts for horizontal scroll.
  const { isOver, setNodeRef } = useDroppable({
    id: DROP_TARGET_BOSS_LANE,
    data: { kind: DROP_TARGET_BOSS_LANE },
  });

  return (
    <div className="lane-row lane-row--boss">
      <div className="lane-label lane-label--boss">Boss</div>
      <div
        ref={setNodeRef}
        className={`lane-track boss-lane-track${isOver ? " drop-active" : ""}`}
        style={{ width: LANE_WIDTH_PX }}
      >
        <div className="lane-gridlines" aria-hidden />
        {instances.map((inst) => {
          const type = typeMap.get(inst.type_id);
          if (!type) return null; // orphan instance — store cascade should prevent this
          const damages = damageByInstance.get(inst.id);
          const lethal = damages?.some((d) => d >= PLAYER_MAX_HP) ?? false;
          return (
            <BossMarker
              key={inst.id}
              instance={inst}
              type={type}
              lethal={lethal}
              onRemove={() => removeInstance(inst.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function BossMarker({
  instance,
  type,
  lethal,
  onRemove,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  lethal: boolean;
  onRemove: () => void;
}) {
  const tp = instance.target_pattern_override ?? type.target_pattern;
  const damage = instance.damage_override ?? type.base_damage;
  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${damage > 0 ? `${damage.toLocaleString()} ` : ""}${type.damage_type} · ${tp}` +
    (lethal ? "\n⚠ lethal to at least one player" : "");

  return (
    <div
      className={`boss-marker${lethal ? " boss-marker--lethal" : ""}`}
      style={{ left: instance.effect_time * PX_PER_SEC }}
      title={title}
    >
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
