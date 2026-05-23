import type { MitigationType } from "@/domain/types";

// SCH mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Per PRD §3.7, shields and heals are out of scope — Adloquium, Seraphic Veil,
// Recitation and Protraction are not modeled. Fey Illumination also grants
// +10% healing magic potency; only the mit component is modeled.
export const SCH_MITS: MitigationType[] = [
  {
    id: "sch.sacred_soil",
    name: "Sacred Soil",
    job: "SCH",
    cooldown_seconds: 30,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Sacred_Soil",
  },
  {
    id: "sch.fey_illumination",
    name: "Fey Illumination",
    job: "SCH",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: { magical: 5 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Fey_Illumination",
  },
  {
    id: "sch.expedient",
    name: "Expedient",
    job: "SCH",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Expedient",
  },
];
