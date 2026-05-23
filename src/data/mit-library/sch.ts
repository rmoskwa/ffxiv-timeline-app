import type { MitigationType } from "@/domain/types";

// SCH mitigation kit, FFXIV 7.x (Dawntrail) values.
// Per PRD §3.7, shields and heals are out of scope, so Adloquium/Succor are
// not modeled here. SCH's in-scope kit is intentionally thin (PRD §16).
// Protraction increases max HP + healing received but is NOT a flat damage
// reduction, so it is not modeled in v0.1 — revisit when heals/shields are added.
export const SCH_MITS: MitigationType[] = [
  {
    id: "sch.sacred_soil",
    name: "Sacred Soil",
    job: "SCH",
    cooldown_seconds: 30,
    duration_seconds: 15,
    mitigation_percent: 10,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "party",
    max_charges: 1,
  },
  {
    id: "sch.fey_illumination",
    name: "Fey Illumination",
    job: "SCH",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_percent: 5,
    damage_types_affected: ["magical"],
    affects: "party",
    max_charges: 1,
  },
  {
    id: "sch.expedient",
    name: "Expedient",
    job: "SCH",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_percent: 10,
    damage_types_affected: ["magical", "physical", "unaspected"],
    affects: "party",
    max_charges: 1,
  },
];
