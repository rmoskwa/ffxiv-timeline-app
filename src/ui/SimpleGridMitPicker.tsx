// Mit picker for a Simple Timeline View cell. Lists the slot job's parent mits
// (children are never offered directly) with per-row availability computed at
// the row's EXACT effect_time — no snapping. Selecting an available entry adds
// the instance at that time and selects it, so MitInspectorPanel takes over
// (incl. the recipient TargetPicker for affects:target / target_or_self).
//
// A parent mit (one with gated children) is instead dropped back so its LAST
// auto-spawned child lands on the clicked hit — 2s per SPAWNED charge (2s for a
// single-charge child; 4s for SCH Consolation's two charges, but only 2s when a
// single in-zone hit yields one charge). The child carries the mitigation the
// planner is placing the row for. parentShiftSeconds derives the shift (and the
// spawn count); chooseParentPlacement applies it, falling back to the clicked
// time when the spot is out of bounds, on cooldown, or a boss hit sits between
// the shifted spot and the clicked hit. The canvas placement path is unaffected.
//
// Availability reuses the canvas's snap-free legality core (isPlacementLegal)
// plus the same charge-row bucketing and effective-footprint/cooldown
// resolution MitSubLane uses, so the grid and canvas can never disagree about
// what is legal at a given second. This is React-shell seam code, not
// a pure view module — it resolves domain values before calling the core.

import { useEffect, useRef } from "react";
import {
  getGatedChildrenOf,
  getMitById,
  getMitsForJob,
  getSharedRecastPartners,
} from "@/data/mit-library";
import { assignChargeRows } from "@/domain/charges";
import {
  effectiveBarFootprintSeconds,
  effectiveCooldownSeconds,
  type MitInstanceState,
} from "@/domain/damage";
import type { MitigationInstance, MitigationType, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
import { isPlacementLegal } from "./placement-legality";
import { secondsToTimecode } from "./timeline-constants";
import { useMitInstanceStates } from "./use-derived";

const NO_MITS: readonly MitigationInstance[] = [];

interface Availability {
  available: boolean;
  // First free charge-row the placement would land on (matches a canvas click).
  chargeRow: number;
  // null when available; otherwise a disabled-reason string for the UI.
  reason: string | null;
}

// Mirrors MitSubLane's legality exactly: a candidate placement of footprint
// max(cooldown, duration) at `effectTime` is legal on a charge-row when it
// overlaps no same-(slot,type) neighbor's effective footprint, and the slot has
// no shared-recast partner whose effective cooldown window overlaps it.
function computeMitAvailability(
  mitType: MitigationType,
  slotId: string,
  effectTime: number,
  allMits: readonly MitigationInstance[],
  mitStates: ReadonlyMap<string, MitInstanceState>,
): Availability {
  const footprintSec = Math.max(mitType.cooldown_seconds, mitType.duration_seconds);

  // Shared-recast partners block every charge of this lane.
  const partnerTypes = getSharedRecastPartners(mitType);
  if (partnerTypes.length > 0) {
    for (const m of allMits) {
      if (m.player_slot_id !== slotId) continue;
      if (!partnerTypes.some((p) => p.id === m.type_id)) continue;
      const t = getMitById(m.type_id);
      if (!t) continue;
      const end = m.effect_time + effectiveCooldownSeconds(m, t, allMits, getMitById, mitStates);
      if (effectTime < end && effectTime + footprintSec > m.effect_time) {
        return { available: false, chargeRow: 0, reason: `shared recast with ${t.name}` };
      }
    }
  }

  // Bucket existing same-type placements into charge-rows exactly as MitSubLane:
  // sticky charge_row when set, derived chronologically otherwise.
  const sameType = allMits.filter((m) => m.player_slot_id === slotId && m.type_id === mitType.id);
  const maxRow = Math.max(1, mitType.max_charges);
  const derived = assignChargeRows(sameType, mitType);
  const buckets: MitigationInstance[][] = Array.from({ length: maxRow }, () => []);
  for (const inst of sameType) {
    const sticky = inst.charge_row;
    const rowIdx =
      sticky !== undefined && sticky >= 0 && sticky < maxRow
        ? sticky
        : (derived.get(inst.id)?.rowIndex ?? 0);
    buckets[rowIdx]?.push(inst);
  }

  for (let rowIdx = 0; rowIdx < maxRow; rowIdx++) {
    const blockers = (buckets[rowIdx] ?? []).map((n) => ({
      startSec: n.effect_time,
      endSec:
        n.effect_time + effectiveBarFootprintSeconds(n, mitType, allMits, getMitById, mitStates),
    }));
    if (isPlacementLegal(effectTime, footprintSec, blockers)) {
      return { available: true, chargeRow: rowIdx, reason: null };
    }
  }

  // No free charge-row: report when the soonest charge frees up (single-charge)
  // or simply that all charges are spent (multi-charge).
  if (maxRow > 1) return { available: false, chargeRow: 0, reason: "no charges" };
  let until = effectTime;
  for (const n of sameType) {
    const end =
      n.effect_time + effectiveBarFootprintSeconds(n, mitType, allMits, getMitById, mitStates);
    if (effectTime < end && effectTime + footprintSec > n.effect_time) until = Math.max(until, end);
  }
  return {
    available: false,
    chargeRow: 0,
    reason: `on cooldown until ${secondsToTimecode(until)}`,
  };
}

export interface ParentPlacement {
  effectTime: number;
  chargeRow: number;
}

// How far back to drop a parent (gated-children) mit added from a Simple-view
// cell so its LAST auto-spawned child lands on the clicked hit — 2s per spawned
// charge. The spawn count depends on where the parent ends up (the store spawns
// one charge per boss hit in [parent+2, parent+execZone], capped at maxCharges),
// so this walks candidate counts high→low and returns 2×n for the first n that
// is self-consistent: the store's zone-count at the resulting T−2n equals n, the
// spot is in-bounds, and [T−2n, clicked) holds no boss hit (an intermediate hit
// would pull the parent's Home onto a row the planner didn't click). Single-
// charge children always spawn one, so n=1 needs no count check. Returns 0 (no
// shift) when nothing qualifies. Cooldown legality is checked separately.
export function parentShiftSeconds(
  clickedSec: number,
  maxCharges: number,
  execZoneSec: number,
  bossHitTimes: readonly number[],
): number {
  for (let n = Math.max(1, maxCharges); n >= 1; n--) {
    const parentSec = clickedSec - 2 * n;
    if (parentSec < 0) continue;
    if (bossHitTimes.some((t) => t >= parentSec && t < clickedSec)) continue;
    if (maxCharges > 1) {
      const hitsInZone = bossHitTimes.filter(
        (t) => t >= parentSec + 2 && t <= parentSec + execZoneSec,
      ).length;
      if (Math.min(maxCharges, hitsInZone) !== n) continue;
    }
    return 2 * n;
  }
  return 0;
}

// Apply the shift (from parentShiftSeconds) when it's nonzero and the shifted
// spot is a legal placement; otherwise place the parent at the clicked hit. The
// geometry/spawn-count guards live in parentShiftSeconds — this only adds the
// cooldown-legality gate and picks the resulting charge-row.
export function chooseParentPlacement(
  clickedSec: number,
  clickedChargeRow: number,
  shiftSec: number,
  shiftedLegal: { available: boolean; chargeRow: number } | null,
): ParentPlacement {
  if (shiftSec > 0 && shiftedLegal?.available) {
    return { effectTime: clickedSec - shiftSec, chargeRow: shiftedLegal.chargeRow };
  }
  return { effectTime: clickedSec, chargeRow: clickedChargeRow };
}

interface SimpleGridMitPickerProps {
  slot: PlayerSlot;
  effectTime: number;
  onClose: () => void;
}

export function SimpleGridMitPicker({ slot, effectTime, onClose }: SimpleGridMitPickerProps) {
  const addMit = useTimelineStore((s) => s.addMitigationInstance);
  const selectMit = useTimelineStore((s) => s.selectMitInstance);
  const allMits = useTimelineStore((s) => s.timeline?.mitigation_instances) ?? NO_MITS;
  const bossInstances = useTimelineStore((s) => s.timeline?.boss_ability_instances);
  const mitStates = useMitInstanceStates();
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside pointerdown or Esc. Capture-phase Esc + stopPropagation
  // keeps the editor's document-level Delete/Esc handler from also firing.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // Parents only — gated children are never offered directly (auto-spawn with
  // the parent). Unset-job slots have no library, hence no picker.
  const parents =
    slot.job === "unset" ? [] : getMitsForJob(slot.job).filter((mt) => mt.gated_by == null);

  const handlePick = (mt: MitigationType, chargeRow: number) => {
    // Shift the parent back so its last auto-spawned child lands on the clicked
    // hit — by 2s per spawned charge (so SCH Consolation drops 4s for two charges
    // but only 2s when a single hit in the zone yields one). The binding child is
    // the one that spawns latest (most charges); current data is one child type
    // per parent. Then gate on cooldown legality at the shifted spot.
    const binding = getGatedChildrenOf(mt.id).reduce<MitigationType | null>(
      (best, c) => (c.max_charges > (best?.max_charges ?? 0) ? c : best),
      null,
    );
    const shiftSec = binding
      ? parentShiftSeconds(
          effectTime,
          binding.max_charges,
          binding.execution_zone_seconds ?? mt.duration_seconds,
          (bossInstances ?? []).map((b) => b.effect_time),
        )
      : 0;
    const shiftedLegal =
      shiftSec > 0
        ? computeMitAvailability(mt, slot.id, effectTime - shiftSec, allMits, mitStates)
        : null;
    const placement = chooseParentPlacement(effectTime, chargeRow, shiftSec, shiftedLegal);
    const id = addMit({
      type_id: mt.id,
      player_slot_id: slot.id,
      effect_time: placement.effectTime,
      target_slot_ids: [],
      charge_row: placement.chargeRow,
    });
    selectMit(id);
    onClose();
  };

  return (
    <div className="simple-grid-picker" ref={ref}>
      <div className="simple-grid-picker-head">Add mit · {secondsToTimecode(effectTime)}</div>
      <ul className="simple-grid-picker-list">
        {parents.length === 0 && (
          <li className="simple-grid-picker-empty">No mitigations for this slot.</li>
        )}
        {parents.map((mt) => {
          const avail = computeMitAvailability(mt, slot.id, effectTime, allMits, mitStates);
          return (
            <li key={mt.id}>
              <button
                type="button"
                className="simple-grid-picker-item"
                disabled={!avail.available}
                title={avail.reason ?? mt.name}
                onClick={() => handlePick(mt, avail.chargeRow)}
              >
                <MitIcon name={mt.name} size={18} title={mt.name} />
                <span className="simple-grid-picker-name">{mt.name}</span>
                {avail.reason && <span className="simple-grid-picker-reason">{avail.reason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
