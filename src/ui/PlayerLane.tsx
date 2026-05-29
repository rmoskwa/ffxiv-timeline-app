import { useMemo } from "react";
import { getMitsForJob } from "@/data/mit-library";
import type { PerPlayerHitResult } from "@/domain/damage";
import type { BossAbilityInstance, MitigationInstance, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { JobIcon } from "./JobIcon";
import { MitSubLane } from "./MitSubLane";
import { PhaseDividers } from "./PhaseDividers";
import { jobColor } from "./role-color";
import { CHIP_BAR_PX, JOB_GUTTER_PX } from "./timeline-constants";
import { useDamageByTime } from "./use-derived";
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
  // HP entering this chip — the cap for a Full heal chip, the Carried HP for a
  // no-Full-heal chip. Drives the contextual Lethal test and the tooltip.
  hpBefore: number;
  shieldsAfter: number;
  maxHp: number;
  lethal: boolean;
  // The slot is marked no-Full-heal for this chip (chains to the prior chip).
  // Suppressed on the player's earliest chip — it has no predecessor, so the
  // flag is inert (matches the engine fold's first-chip handling).
  noFullHeal: boolean;
}

const EMPTY_MITS: readonly MitigationInstance[] = [];
const EMPTY_BOSS_INSTANCES: readonly BossAbilityInstance[] = [];

// Per-player damage marks: one entry per effect_time that touches this
// player, with damages summed across every boss hit landing at that second.
// Drives both the chip bar and the vertical guide lines. `maxHp` is the
// engine-provided buffed cap at this instant — not `slot.hp` — so max-HP
// buffs (Thrill, Protraction, Great Nebula) widen lethality and resize the
// HP fill correctly. `lethal` is contextual: damage ≥ entering HP (ADR 0004),
// which reduces to ≥ max HP for an unmarked (Full heal) chip.
function usePlayerDamageMarks(slotIndex: number): DamageMark[] {
  const damageByTime = useDamageByTime();
  const bossInstances = useTimelineStore(
    (s) => s.timeline?.boss_ability_instances ?? EMPTY_BOSS_INSTANCES,
  );
  const slotId = useTimelineStore((s) => s.timeline?.roster[slotIndex]?.id);
  return useMemo<DamageMark[]>(() => {
    const marks: DamageMark[] = [];
    let minTime = Number.POSITIVE_INFINITY;
    for (const [t, results] of damageByTime) {
      const r = results[slotIndex] as PerPlayerHitResult | null | undefined;
      if (r == null) continue;
      if (t < minTime) minTime = t;
      const rawFlag =
        slotId != null &&
        bossInstances.some((b) => b.effect_time === t && b.no_full_heal_slot_ids.includes(slotId));
      marks.push({
        id: `t-${t}`,
        effectTime: t,
        damage: r.damage_taken_to_hp,
        hpAfter: r.hp_after,
        hpBefore: r.hp_before,
        shieldsAfter: r.active_shields_after,
        maxHp: r.max_hp,
        lethal: r.damage_taken_to_hp >= r.hp_before,
        noFullHeal: rawFlag,
      });
    }
    // The earliest chip has no predecessor — its flag never carries, so don't
    // chain a glyph onto it.
    for (const m of marks) {
      if (m.effectTime === minTime) m.noFullHeal = false;
    }
    return marks;
  }, [damageByTime, slotIndex, bossInstances, slotId]);
}

function useSlotMits(slot: PlayerSlot): readonly MitigationInstance[] {
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances ?? EMPTY_MITS);
  return useMemo(() => allMits.filter((m) => m.player_slot_id === slot.id), [allMits, slot.id]);
}

// Interleaved-mode lane: header row with job-tinted label + chips, followed by
// the slot's mit sub-lanes. Unchanged from pre-chip-layout behavior.
export function PlayerLane({ slot, index }: PlayerLaneProps) {
  const damageMarks = usePlayerDamageMarks(index);
  const mitsBySlot = useSlotMits(slot);
  const { pxPerSec, laneWidthPx } = useZoom();

  const label = slot.name_label ?? (slot.job === "unset" ? "Unset" : slot.job);
  // Gated children render on their parent's bar (see MitBar) and do not get
  // their own sub-lane.
  const mits =
    slot.job === "unset" ? [] : getMitsForJob(slot.job).filter((mt) => mt.gated_by == null);
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
          <PhaseDividers />
          {!isUnset &&
            damageMarks.map((m) => (
              <DamageChip key={m.id} mark={m} slotId={slot.id} pxPerSec={pxPerSec} />
            ))}
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

// Separated-mode chip row: [gutter][empty 140px label][chip track]. Unset slots
// still render a (grayed, chip-less) row so the chip section keeps a stable
// height as slots get assigned.
export function PlayerChipRow({ slot, index }: PlayerLaneProps) {
  const damageMarks = usePlayerDamageMarks(index);
  const { pxPerSec, laneWidthPx } = useZoom();
  const isUnset = slot.job === "unset";
  const label = slot.name_label ?? (isUnset ? "Unset" : slot.job);

  return (
    <div className={`lane-row chip-section-row${isUnset ? " is-unset" : ""}`}>
      <JobGutter slot={slot} title={label} />
      <div className="lane-label chip-row-label" aria-hidden />
      <div className="lane-track player-header-track chip-row-track" style={{ width: laneWidthPx }}>
        <PhaseDividers />
        {!isUnset &&
          damageMarks.map((m) => (
            <DamageChip key={m.id} mark={m} slotId={slot.id} pxPerSec={pxPerSec} />
          ))}
      </div>
    </div>
  );
}

// Separated-mode mit group: [gutter spanning the slot's sub-lanes][stack of
// MitSubLanes]. Returns null for slots with no sub-lanes (unset, or every mit
// gated out) — those slots have nothing to span and are absent from the mit
// canvas entirely. The chip row still renders for them via PlayerChipRow.
export function SlotMitGroup({ slot, index }: PlayerLaneProps) {
  const damageMarks = usePlayerDamageMarks(index);
  const mitsBySlot = useSlotMits(slot);

  const mits =
    slot.job === "unset" ? [] : getMitsForJob(slot.job).filter((mt) => mt.gated_by == null);
  if (mits.length === 0) return null;

  const label = slot.name_label ?? slot.job;

  return (
    <div
      className="slot-mit-group"
      style={{ flexGrow: mits.length }}
      data-sub-lane-count={mits.length}
    >
      <JobGutter slot={slot} title={label} />
      <div className="slot-mit-group-rows">
        {mits.map((mt) => (
          <MitSubLane
            key={mt.id}
            slot={slot}
            mitType={mt}
            instances={mitsBySlot.filter((m) => m.type_id === mt.id)}
            damageMarks={damageMarks}
          />
        ))}
      </div>
    </div>
  );
}

// Job-tinted column carrying the JobIcon. Icon-only per design — the readable
// slot name lives in the existing 140px lane-label region (interleaved mode)
// or in tooltips (separated modes; the 140px cell is intentionally empty so
// the gutter's tint alone speaks for slot identity).
function JobGutter({ slot, title }: { slot: PlayerSlot; title: string }) {
  const isUnset = slot.job === "unset";
  return (
    <div
      className={`job-gutter${isUnset ? " job-gutter--unset" : ""}`}
      style={{
        width: JOB_GUTTER_PX,
        background: isUnset ? undefined : jobColor(slot.job),
      }}
      title={title}
    >
      <JobIcon job={slot.job} size={18} title={title} />
    </div>
  );
}

// Phantom column reserved on Ruler / Boss rows in separated modes so the time
// axis stays column-aligned with the chip / mit-canvas tracks below.
export function PhantomGutter() {
  return (
    <div className="job-gutter job-gutter--phantom" style={{ width: JOB_GUTTER_PX }} aria-hidden />
  );
}

// Stacked HP/shield bar with damage-taken label, rendered as a single chip
// anchored at the boss hit's effect_time. State shown is *immediately after*
// the hit landed (post-shield, post-HP). Interactive: clicking toggles the
// Full heal flag for this (time, slot) chip.
function DamageChip({
  mark,
  slotId,
  pxPerSec,
}: {
  mark: DamageMark;
  slotId: string;
  pxPerSec: number;
}) {
  const toggleChip = useTimelineStore((s) => s.toggleChipNoFullHeal);

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
        (mark.noFullHeal
          ? ` · entering HP ${Math.round(mark.hpBefore).toLocaleString()} (no full heal)`
          : "") +
        (mark.shieldsAfter > 0
          ? ` · shield ${Math.round(mark.shieldsAfter).toLocaleString()}`
          : "");

  return (
    <button
      type="button"
      className={`damage-chip${variant}`}
      style={{ left: mark.effectTime * pxPerSec, width: CHIP_BAR_PX }}
      title={title}
      aria-pressed={mark.noFullHeal}
      onClick={() => toggleChip(mark.effectTime, slotId)}
    >
      <div className="damage-chip-hp" style={{ width: `${hpFrac * 100}%` }} aria-hidden />
      <div className="damage-chip-missing" style={{ width: `${missingFrac * 100}%` }} aria-hidden />
      {shieldFrac > 0 && (
        <div className="damage-chip-shield" style={{ width: `${shieldFrac * 100}%` }} aria-hidden />
      )}
      {mark.noFullHeal && <span className="damage-chip-link" aria-hidden />}
      <span className="damage-chip-label">{formatDamage(mark.damage)}</span>
    </button>
  );
}

function formatDamage(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}
