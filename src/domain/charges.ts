// Charge-aware sub-lane assignment for multi-charge mits.
//
// Design: a max_charges = N ability renders as N independent rows. Each row
// follows the exact same cooldown rules as a normal 1-charge mit. Charges are
// not modeled as a shared pool — by giving each charge its own row, the
// "charge accumulation" behavior emerges naturally from per-row cooldowns.
//
// Pure function — no React, no I/O.

import type { MitigationInstance, MitigationType } from "./types";

export interface RowAssignment {
  // 0-based row index within the ability's sub-lane.
  rowIndex: number;
  // True when no row was free at this placement's effect_time — i.e., more
  // than max_charges placements landed within a single cooldown window for
  // the same (type_id, player_slot_id). The placement UI prevents this for
  // new drops; this flag is the safety net for loaded saves and edits.
  overplaced: boolean;
}

// Greedy chronological row assignment for one (mit type, player slot) pair.
// Caller passes placements already filtered to one (type_id, player_slot_id).
export function assignChargeRows(
  placements: readonly MitigationInstance[],
  mitType: MitigationType,
): Map<string, RowAssignment> {
  const out = new Map<string, RowAssignment>();
  const sorted = [...placements].sort((a, b) => a.effect_time - b.effect_time);
  const rowFreeAt = new Array<number>(Math.max(1, mitType.max_charges)).fill(
    Number.NEGATIVE_INFINITY,
  );
  for (const p of sorted) {
    let assigned = -1;
    for (let i = 0; i < rowFreeAt.length; i++) {
      const freeAt = rowFreeAt[i] ?? Number.NEGATIVE_INFINITY;
      if (p.effect_time >= freeAt) {
        assigned = i;
        rowFreeAt[i] = p.effect_time + mitType.cooldown_seconds;
        break;
      }
    }
    if (assigned !== -1) {
      out.set(p.id, { rowIndex: assigned, overplaced: false });
      continue;
    }
    // Overplaced: park on the row whose previous bar ends soonest so that
    // chronological visual order is preserved as best as possible.
    let earliestRow = 0;
    let earliestTime = rowFreeAt[0] ?? Number.NEGATIVE_INFINITY;
    for (let i = 1; i < rowFreeAt.length; i++) {
      const t = rowFreeAt[i] ?? Number.NEGATIVE_INFINITY;
      if (t < earliestTime) {
        earliestRow = i;
        earliestTime = t;
      }
    }
    out.set(p.id, { rowIndex: earliestRow, overplaced: true });
    rowFreeAt[earliestRow] = Math.max(earliestTime, p.effect_time + mitType.cooldown_seconds);
  }
  return out;
}
