import { useMemo } from "react";
import { getMitsForJob } from "@/data/mit-library";
import type { BossAbilityInstance, MitigationInstance, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitSubLane } from "./MitSubLane";
import { jobColor } from "./role-color";
import { PLAYER_MAX_HP } from "./timeline-constants";
import { useDamageByInstance } from "./use-derived";
import { useZoom } from "./use-zoom";

interface PlayerLaneProps {
  slot: PlayerSlot;
  index: number;
}

interface DamageMark {
  id: string;
  effectTime: number;
  damage: number;
  lethal: boolean;
}

// Module-level stable empty arrays so selectors return cached references when
// no timeline is loaded. Zustand v5 + React 19's useSyncExternalStore throw
// "getSnapshot should be cached" on unstable references; filtering must happen
// outside the selector.
const EMPTY_MITS: readonly MitigationInstance[] = [];
const EMPTY_INSTANCES: readonly BossAbilityInstance[] = [];

export function PlayerLane({ slot, index }: PlayerLaneProps) {
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  const bossInstances = useTimelineStore(
    (s) => s.timeline?.boss_ability_instances ?? EMPTY_INSTANCES,
  );
  const damageByInstance = useDamageByInstance();
  const { pxPerSec, laneWidthPx } = useZoom();

  const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
  const mits = slot.job === "unset" ? [] : getMitsForJob(slot.job);

  // Per-player damage marks: one entry per boss instance that targets this
  // player (damage > 0). Drives both the top-row number labels and the vertical
  // guide lines inside each sub-lane.
  const damageMarks = useMemo<DamageMark[]>(() => {
    const marks: DamageMark[] = [];
    for (const inst of bossInstances) {
      const damages = damageByInstance.get(inst.id);
      const dmg = damages?.[index];
      if (dmg == null) continue;
      marks.push({
        id: inst.id,
        effectTime: inst.effect_time,
        damage: dmg,
        lethal: dmg >= PLAYER_MAX_HP,
      });
    }
    return marks;
  }, [bossInstances, damageByInstance, index]);

  // Same instance/slot filter as today — sub-lanes get only their own.
  const mitsBySlot = useMemo(
    () => allMits.filter((m) => m.player_slot_id === slot.id),
    [allMits, slot.id],
  );

  const isUnset = slot.job === "unset";

  return (
    <div className={`player-parent-lane${isUnset ? " is-unset" : ""}`}>
      <div className="lane-row player-header-row">
        <div
          className="lane-label lane-label--player-header"
          style={isUnset ? undefined : { background: jobColor(slot.job) }}
        >
          <JobIcon job={slot.job} size={22} title={label} />
          <span className="lane-slot-name">{label}</span>
        </div>
        <div className="lane-track player-header-track" style={{ width: laneWidthPx }}>
          {damageMarks.map((m) => {
            const variant =
              m.damage === 0 ? " damage-chip--zero" : m.lethal ? " damage-chip--lethal" : "";
            return (
              <div
                key={m.id}
                className={`damage-chip${variant}`}
                style={{ left: m.effectTime * pxPerSec }}
                title={
                  m.damage === 0
                    ? "Fully mitigated (invuln)"
                    : `${Math.round(m.damage).toLocaleString()} damage`
                }
              >
                {formatDamage(m.damage)}
              </div>
            );
          })}
        </div>
      </div>
      {!isUnset &&
        mits.map((mt) => (
          <MitSubLane
            key={mt.id}
            slot={slot}
            mitType={mt}
            instances={mitsBySlot.filter((m) => m.type_id === mt.id)}
            damageMarks={damageMarks}
          />
        ))}
    </div>
  );
}

// 12345 → "12.3k" so chips stay narrow at default zoom.
function formatDamage(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
