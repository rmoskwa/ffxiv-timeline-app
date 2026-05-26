import { useMemo } from "react";
import { getMitsForJob } from "@/data/mit-library";
import type { PerPlayerHitResult } from "@/domain/damage";
import type { BossAbilityInstance, MitigationInstance, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitSubLane } from "./MitSubLane";
import { jobColor } from "./role-color";
import { CHIP_BAR_PX } from "./timeline-constants";
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
  hpAfter: number;
  shieldsAfter: number;
  maxHp: number;
  lethal: boolean;
}

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
  // Gated children render on their parent's bar (see MitBar) and do not get
  // their own sub-lane. PRD §6.1.
  const mits =
    slot.job === "unset" ? [] : getMitsForJob(slot.job).filter((mt) => mt.gated_by == null);

  // Per-player damage marks: one entry per boss instance that targets this
  // player. Drives both the chip bar and the vertical guide lines. `maxHp` is
  // the engine-provided buffed cap at this hit's instant — not `slot.hp` —
  // so max-HP buffs (Thrill, Protraction, Great Nebula) widen lethality and
  // resize the HP fill correctly.
  const damageMarks = useMemo<DamageMark[]>(() => {
    const marks: DamageMark[] = [];
    for (const inst of bossInstances) {
      const results = damageByInstance.get(inst.id);
      const r = results?.[index] as PerPlayerHitResult | null | undefined;
      if (r == null) continue;
      marks.push({
        id: inst.id,
        effectTime: inst.effect_time,
        damage: r.damage_taken_to_hp,
        hpAfter: r.hp_after,
        shieldsAfter: r.active_shields_after,
        maxHp: r.max_hp,
        lethal: r.damage_taken_to_hp >= r.max_hp,
      });
    }
    return marks;
  }, [bossInstances, damageByInstance, index]);

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
          {!isUnset &&
            damageMarks.map((m) => <DamageChip key={m.id} mark={m} pxPerSec={pxPerSec} />)}
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

// Stacked HP/shield bar with damage-taken label, rendered as a single chip
// anchored at the boss hit's effect_time. State shown is *immediately after*
// the hit landed (post-shield, post-HP).
function DamageChip({ mark, pxPerSec }: { mark: DamageMark; pxPerSec: number }) {
  const variant =
    mark.damage === 0 ? " damage-chip--zero" : mark.lethal ? " damage-chip--lethal" : "";
  // Chip width is uniform across all players — segments are percentage fills,
  // so a tank's chip and a caster's chip are the same physical size and the
  // bar segments speak in fractions of each player's own max HP.
  const hpFrac = mark.maxHp > 0 ? mark.hpAfter / mark.maxHp : 0;
  const missingFrac = Math.max(0, 1 - hpFrac);
  const shieldFrac = mark.maxHp > 0 ? Math.min(1, mark.shieldsAfter / mark.maxHp) : 0;
  const title =
    mark.damage === 0
      ? "Fully mitigated (no damage to HP)"
      : `${Math.round(mark.damage).toLocaleString()} damage` +
        ` · HP ${Math.round(mark.hpAfter).toLocaleString()} / ${mark.maxHp.toLocaleString()}` +
        (mark.shieldsAfter > 0
          ? ` · shield ${Math.round(mark.shieldsAfter).toLocaleString()}`
          : "");
  return (
    <div
      className={`damage-chip${variant}`}
      style={{ left: mark.effectTime * pxPerSec, width: CHIP_BAR_PX }}
      title={title}
    >
      <div className="damage-chip-hp" style={{ width: `${hpFrac * 100}%` }} aria-hidden />
      <div className="damage-chip-missing" style={{ width: `${missingFrac * 100}%` }} aria-hidden />
      {shieldFrac > 0 && (
        <div className="damage-chip-shield" style={{ width: `${shieldFrac * 100}%` }} aria-hidden />
      )}
      <span className="damage-chip-label">{formatDamage(mark.damage)}</span>
    </div>
  );
}

function formatDamage(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
