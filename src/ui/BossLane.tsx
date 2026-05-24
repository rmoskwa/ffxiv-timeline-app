import { useDroppable } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import type { BossAbilityInstance, BossAbilityType, Roster, TargetPattern } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { TargetPicker } from "./TargetPicker";
import { DROP_TARGET_BOSS_LANE, PLAYER_MAX_HP, secondsToTimecode } from "./timeline-constants";
import { useDamageByInstance } from "./use-derived";
import { useZoom } from "./use-zoom";

// Patterns whose damage math depends on user-picked target slots. Other patterns
// (raidwide/spread/stack) ignore target_slot_ids entirely.
function patternNeedsTarget(tp: TargetPattern): boolean {
  return tp === "tankbuster_single" || tp === "tankbuster_shared" || tp === "targeted";
}

function maxTargetsFor(tp: TargetPattern): number {
  return tp === "tankbuster_shared" ? 2 : 1;
}

export function BossLane() {
  const types = useTimelineStore((s) => s.timeline?.boss_ability_types ?? []);
  const instances = useTimelineStore((s) => s.timeline?.boss_ability_instances ?? []);
  const roster = useTimelineStore((s) => s.timeline?.roster);
  const removeInstance = useTimelineStore((s) => s.removeBossAbilityInstance);
  const updateInstance = useTimelineStore((s) => s.updateBossAbilityInstance);
  const damageByInstance = useDamageByInstance();
  const { pxPerSec, laneWidthPx } = useZoom();

  const typeMap = new Map(types.map((t) => [t.id, t]));

  const { isOver, setNodeRef } = useDroppable({
    id: DROP_TARGET_BOSS_LANE,
    data: { kind: DROP_TARGET_BOSS_LANE },
  });

  if (!roster) return null;

  return (
    <div className="lane-row lane-row--boss">
      <div className="lane-label lane-label--boss">Boss</div>
      <div
        ref={setNodeRef}
        className={`lane-track boss-lane-track${isOver ? " drop-active" : ""}`}
        style={{ width: laneWidthPx }}
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
              roster={roster}
              pxPerSec={pxPerSec}
              onRemove={() => removeInstance(inst.id)}
              onPickTargets={(ids) => updateInstance(inst.id, { target_slot_ids: ids })}
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
  roster,
  pxPerSec,
  onRemove,
  onPickTargets,
}: {
  instance: BossAbilityInstance;
  type: BossAbilityType;
  lethal: boolean;
  roster: Roster;
  pxPerSec: number;
  onRemove: () => void;
  onPickTargets: (ids: string[]) => void;
}) {
  const tp = instance.target_pattern_override ?? type.target_pattern;
  const damage = instance.damage_override ?? type.base_damage;
  const needsTarget = patternNeedsTarget(tp);
  const targetsUnset = needsTarget && instance.target_slot_ids.length === 0;

  // Auto-open picker for newly-dropped instances that still need a target.
  const [pickerOpen, setPickerOpen] = useState(targetsUnset);
  useEffect(() => {
    if (targetsUnset) setPickerOpen(true);
  }, [targetsUnset]);

  const title =
    `${type.name} @ ${secondsToTimecode(instance.effect_time)}\n` +
    `${damage > 0 ? `${damage.toLocaleString()} ` : ""}${type.damage_type} · ${tp}` +
    (targetsUnset ? "\n⚠ no target picked — click to assign" : "") +
    (lethal ? "\n⚠ lethal to at least one player" : "");

  return (
    <div
      className={
        `boss-marker${lethal ? " boss-marker--lethal" : ""}` +
        `${targetsUnset ? " boss-marker--needs-target" : ""}` +
        `${pickerOpen ? " has-picker-open" : ""}`
      }
      style={{ left: instance.effect_time * pxPerSec }}
      title={title}
      data-boss-instance-id={instance.id}
    >
      <button
        type="button"
        className="boss-marker-remove"
        title="Remove this placement"
        onClick={onRemove}
      >
        ×
      </button>
      {needsTarget && (
        <button
          type="button"
          className="boss-marker-pin-button"
          aria-label="Pick target for this hit"
          onClick={() => setPickerOpen((o) => !o)}
        >
          <div className="boss-marker-pin" />
          <div className="boss-marker-label">{type.name}</div>
        </button>
      )}
      {!needsTarget && (
        <>
          <div className="boss-marker-pin" />
          <div className="boss-marker-label">{type.name}</div>
        </>
      )}
      {pickerOpen && needsTarget && (
        <div className="boss-marker-popover">
          <TargetPicker
            roster={roster}
            selectedIds={instance.target_slot_ids}
            maxSelections={maxTargetsFor(tp)}
            onChange={onPickTargets}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
