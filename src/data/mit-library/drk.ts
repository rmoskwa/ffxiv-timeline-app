import type { MitigationType } from "@/domain/types";

// DRK mitigation kit, FFXIV 7.x (Dawntrail) values.
// Spot-check against The Balance / a current tooltip before relying on these
// for planning — Square Enix can adjust values in any patch.
export const DRK_MITS: MitigationType[] = [
  {
    id: "drk.rampart",
    name: "Rampart",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_percent: 20,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "self",
    max_charges: 1,
  },
  {
    id: "drk.reprisal",
    name: "Reprisal",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "boss_debuff",
    max_charges: 1,
  },
  {
    id: "drk.dark_mind",
    name: "Dark Mind",
    job: "DRK",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_percent: 30,
    damage_types_affected: ["magical"],
    affects: "self",
    max_charges: 1,
  },
  {
    id: "drk.shadow_wall",
    name: "Shadow Wall",
    job: "DRK",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_percent: 30,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "self",
    max_charges: 1,
  },
  {
    id: "drk.dark_missionary",
    name: "Dark Missionary",
    job: "DRK",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical"],
    affects: "party",
    max_charges: 1,
  },
];
