import type { MitigationType } from "@/domain/types";

// SCH mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Adloquium, Succor, Concitation, Recitation, Seraphic Veil excluded — rotational cure-potency.
// Fey Illumination also grants +10% healing magic potency; only the mit component is modeled.
// Utility entries (planner anchors, 0% mit): Deployment Tactics, Consolation.
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
  {
    id: "sch.deployment_tactics",
    name: "Deployment Tactics",
    job: "SCH",
    cooldown_seconds: 90,
    duration_seconds: 0,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "utility",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Deployment_Tactics",
  },
  {
    id: "sch.consolation",
    name: "Consolation",
    job: "SCH",
    cooldown_seconds: 120, // stopgap: inherits Summon Seraph's CD (combo-chain gated), per sub-lane
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 2,
    mechanic: "utility",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Consolation",
  },
];
