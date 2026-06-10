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
// Availability reuses the canvas's legality rules wholesale — the same
// Placement module (domain/placement.ts) MitSubLane renders from — so the
// grid and canvas can never disagree about what is legal at a given second.
// This is React-shell seam code, not a pure view module — it resolves domain
// values before calling the module and turns the results into reason strings.

import { useEffect, useRef } from "react";
import {
  getGatedChildrenOf,
  getMitById,
  getMitsForJob,
  getSharedRecastPartners,
} from "@/data/mit-library";
import type { MitInstanceState } from "@/domain/damage";
import {
  blockedUntilSec,
  firstLegalRow,
  isPlacementLegal,
  resolveSubLanePlacement,
} from "@/domain/placement";
import type { MitigationInstance, MitigationType, PlayerSlot } from "@/domain/types";
import { useTimelineStore } from "@/state/timeline-store";
import { MitIcon } from "./MitIcon";
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

// Thin adapter over the shared Placement module: resolve the sub-lane once,
// then translate the legality queries into availability + a reason string.
function computeMitAvailability(
  mitType: MitigationType,
  slotId: string,
  effectTime: number,
  allMits: readonly MitigationInstance[],
  mitStates: ReadonlyMap<string, MitInstanceState>,
): Availability {
  const placement = resolveSubLanePlacement({
    mitType,
    slotId,
    laneInstances: allMits.filter((m) => m.player_slot_id === slotId && m.type_id === mitType.id),
    partnerTypes: getSharedRecastPartners(mitType),
    allMits,
    lookupMitType: getMitById,
    mitStates,
  });

  // Shared-recast partners block every charge of this lane.
  for (let i = 0; i < placement.partnerWindows.length; i++) {
    const w = placement.partnerWindows[i];
    const p = placement.partnerInstances[i];
    if (!w || !p) continue;
    if (!isPlacementLegal(effectTime, placement.footprintSec, [w])) {
      const name = getMitById(p.type_id)?.name ?? p.type_id;
      return { available: false, chargeRow: 0, reason: `shared recast with ${name}` };
    }
  }

  const row = firstLegalRow(placement, effectTime);
  if (row !== -1) return { available: true, chargeRow: row, reason: null };

  // No free charge-row: report when the soonest charge frees up (single-charge)
  // or simply that all charges are spent (multi-charge).
  if (placement.rows.length > 1) return { available: false, chargeRow: 0, reason: "no charges" };
  return {
    available: false,
    chargeRow: 0,
    reason: `on cooldown until ${secondsToTimecode(blockedUntilSec(placement, effectTime))}`,
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
