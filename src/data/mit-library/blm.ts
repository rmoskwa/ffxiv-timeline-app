import type { MitigationType } from "@/domain/types";

// BLM mitigation kit, FFXIV 7.x (Dawntrail).
// Addle is a caster-role action (shared with SMN/RDM/PCT); duplicated per-job
// per PRD §3.3 (`job` is mandatory on every mit type).
//
// Schema gap (same as MNK Feint): Addle reduces magical 10% AND physical 5%.
// v0.1 models only the dominant magical 10% effect. See drk.ts/mnk.ts notes.
export const BLM_MITS: MitigationType[] = [
  {
    id: "blm.addle",
    name: "Addle",
    job: "BLM",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical"],
    affects: "boss_debuff",
    max_charges: 1,
  },
  {
    id: "blm.manaward",
    name: "Manaward",
    job: "BLM",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_percent: 30,
    damage_types_affected: ["magical"],
    affects: "self",
    max_charges: 1,
  },
];
