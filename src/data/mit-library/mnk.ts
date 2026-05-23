import type { MitigationType } from "@/domain/types";

// MNK mitigation kit, FFXIV 7.x (Dawntrail).
// Feint is technically a melee-role action (shared with DRG/NIN/SAM/RPR/VPR);
// it is duplicated per-job in the library because PRD §3.3 mandates `job` on
// every mit type. When the other melee jobs are added, each gets its own entry.
//
// Schema gap surfaced during research: Feint reduces physical by 10% AND
// magical by 5% — two percentages — but `mitigation_percent` is a single
// number. v0.1 models only the dominant (physical 10%) effect. Resolve in v0.2
// by either (a) splitting into two MitigationType entries with one parent ID,
// or (b) extending the schema with `mitigation_per_type: Record<DamageType, %>`.
export const MNK_MITS: MitigationType[] = [
  {
    id: "mnk.feint",
    name: "Feint",
    job: "MNK",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["physical"],
    affects: "boss_debuff",
    max_charges: 1,
  },
];
