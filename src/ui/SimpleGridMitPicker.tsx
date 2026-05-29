// Mit picker for a Simple Timeline View cell. Lists the slot job's parent mits
// (children are never offered directly) with per-row availability computed at
// the row's EXACT effect_time — no snapping. Selecting an available entry adds
// the instance at that time and selects it, so MitInspectorPanel takes over
// (incl. the recipient TargetPicker for affects:target / target_or_self).
//
// A parent mit (one with gated children) is instead dropped 2s earlier so its
// auto-spawned child (parent+2) lands on the clicked hit — the child carries the
// mitigation the planner is placing the row for. This grid-only shift falls back
// to the clicked time when the earlier spot is out of bounds or on cooldown
// (see chooseParentPlacement); the canvas placement path is unaffected.
//
// Availability reuses the canvas's snap-free legality core (isPlacementLegal)
// plus the same charge-row bucketing and effective-footprint/cooldown
// resolution MitSubLane uses, so the grid and canvas can never disagree about
// what is legal at a given second (PRD §6). This is React-shell seam code, not
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

// Where a parent (gated-children) mit lands when added from a Simple-view cell.
// To anchor the CHILD on the clicked hit, the parent drops 2s earlier so its
// auto-spawned child (parent+2) lands at `clickedSec` — but only when that
// earlier spot is in-bounds (>= 0) and a legal placement (`shifted.available`).
// Otherwise (no children → `shifted` is null, out of bounds, or a cooldown
// collision) the parent lands at `clickedSec` and the child spawns at +2s.
export function chooseParentPlacement(
  clickedSec: number,
  clickedChargeRow: number,
  shifted: { available: boolean; chargeRow: number } | null,
): ParentPlacement {
  if (clickedSec - 2 >= 0 && shifted?.available) {
    return { effectTime: clickedSec - 2, chargeRow: shifted.chargeRow };
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
    // For a parent mit, recheck legality at the 2s-earlier spot; chooseParentPlacement
    // shifts there when legal so the auto-spawned child lands on the clicked hit.
    const shifted =
      getGatedChildrenOf(mt.id).length > 0 && effectTime - 2 >= 0
        ? computeMitAvailability(mt, slot.id, effectTime - 2, allMits, mitStates)
        : null;
    const placement = chooseParentPlacement(effectTime, chargeRow, shifted);
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
