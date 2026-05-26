import type { Job, MitigationType } from "@/domain/types";
import { AST_MITS } from "./ast";
import { BLM_MITS } from "./blm";
import { BRD_MITS } from "./brd";
import { DNC_MITS } from "./dnc";
import { DRG_MITS } from "./drg";
import { DRK_MITS } from "./drk";
import { GNB_MITS } from "./gnb";
import { MCH_MITS } from "./mch";
import { MNK_MITS } from "./mnk";
import { NIN_MITS } from "./nin";
import { PCT_MITS } from "./pct";
import { PLD_MITS } from "./pld";
import { RDM_MITS } from "./rdm";
import { RPR_MITS } from "./rpr";
import { SAM_MITS } from "./sam";
import { SCH_MITS } from "./sch";
import { SGE_MITS } from "./sge";
import { SMN_MITS } from "./smn";
import { VPR_MITS } from "./vpr";
import { WAR_MITS } from "./war";
import { WHM_MITS } from "./whm";

export const MIT_LIBRARY: readonly MitigationType[] = [
  ...PLD_MITS,
  ...WAR_MITS,
  ...DRK_MITS,
  ...GNB_MITS,
  ...WHM_MITS,
  ...SCH_MITS,
  ...AST_MITS,
  ...SGE_MITS,
  ...MNK_MITS,
  ...DRG_MITS,
  ...NIN_MITS,
  ...SAM_MITS,
  ...RPR_MITS,
  ...VPR_MITS,
  ...BRD_MITS,
  ...MCH_MITS,
  ...DNC_MITS,
  ...BLM_MITS,
  ...SMN_MITS,
  ...RDM_MITS,
  ...PCT_MITS,
];

const BY_ID: ReadonlyMap<string, MitigationType> = new Map(MIT_LIBRARY.map((m) => [m.id, m]));

// Load-time validation: every `gated_by` reference must resolve to a real
// library entry. Catches typos and the case where a parent entry is removed
// without auditing its children. Throws synchronously at module import.
for (const mit of MIT_LIBRARY) {
  if (mit.gated_by != null && !BY_ID.has(mit.gated_by)) {
    throw new Error(
      `mit-library: ${mit.id} is gated_by "${mit.gated_by}" but no such entry exists`,
    );
  }
  if (mit.max_hp_buff_pct != null && mit.max_hp_buff_pct <= 0) {
    throw new Error(`mit-library: ${mit.id} max_hp_buff_pct must be > 0 if present`);
  }
  if (mit.tiers) {
    for (let i = 0; i < mit.tiers.length; i++) {
      const t = mit.tiers[i];
      if (!t) continue;
      if (t.offset_seconds < 0) {
        throw new Error(`mit-library: ${mit.id} tiers[${i}].offset_seconds must be >= 0`);
      }
      if (t.duration_seconds <= 0) {
        throw new Error(`mit-library: ${mit.id} tiers[${i}].duration_seconds must be > 0`);
      }
      if (t.offset_seconds + t.duration_seconds > mit.duration_seconds) {
        throw new Error(
          `mit-library: ${mit.id} tiers[${i}] extends past parent duration_seconds (${mit.duration_seconds})`,
        );
      }
      const hasMagnitude = Object.values(t.mitigation_per_type).some((v) => v != null && v !== 0);
      if (!hasMagnitude) {
        throw new Error(
          `mit-library: ${mit.id} tiers[${i}].mitigation_per_type must declare a non-zero reduction`,
        );
      }
    }
  }
  if (mit.consumes_many) {
    if (mit.consumes) {
      throw new Error(`mit-library: ${mit.id} sets both consumes and consumes_many — pick one`);
    }
    if (mit.consumes_many.length === 0) {
      throw new Error(`mit-library: ${mit.id} consumes_many must be non-empty if present`);
    }
    for (const ref of mit.consumes_many) {
      if (!BY_ID.has(ref)) {
        throw new Error(
          `mit-library: ${mit.id} consumes_many references "${ref}" but no such entry exists`,
        );
      }
    }
  }
  if (mit.conditional_bonus) {
    const cb = mit.conditional_bonus;
    if (cb.requires_active.length === 0) {
      throw new Error(`mit-library: ${mit.id} conditional_bonus.requires_active must be non-empty`);
    }
    for (const ref of cb.requires_active) {
      if (!BY_ID.has(ref)) {
        throw new Error(
          `mit-library: ${mit.id} conditional_bonus.requires_active references "${ref}" but no such entry exists`,
        );
      }
    }
    const hasMagnitude = Object.values(cb.mitigation_per_type).some((v) => v != null && v !== 0);
    if (!hasMagnitude) {
      throw new Error(
        `mit-library: ${mit.id} conditional_bonus.mitigation_per_type must declare a non-zero reduction`,
      );
    }
  }
}

export function getMitById(id: string): MitigationType | undefined {
  return BY_ID.get(id);
}

export function getMitsForJob(job: Job): MitigationType[] {
  return MIT_LIBRARY.filter((m) => m.job === job);
}

// Library entries that gate `parentId` (i.e., declare `gated_by: parentId`).
// Used by the store for auto-spawn and by the inspector to populate the
// Children section. Returns [] when no entries are gated by `parentId`.
export function getGatedChildrenOf(parentId: string): MitigationType[] {
  return MIT_LIBRARY.filter((m) => m.gated_by === parentId);
}

// Other library entries that share `mit`'s recast group, excluding `mit`
// itself. Returns [] when `mit` has no group.
export function getSharedRecastPartners(mit: MitigationType): MitigationType[] {
  const group = mit.shared_recast_group;
  if (!group) return [];
  return MIT_LIBRARY.filter((m) => m.shared_recast_group === group && m.id !== mit.id);
}
