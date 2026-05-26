import type { MitigationType } from "@/domain/types";

// SAM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Third Eye included under Trust the timeline (no conditional gating).
export const SAM_MITS: MitigationType[] = [
  {
    id: "sam.feint",
    name: "Feint",
    job: "SAM",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 10, magical: 5 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Feint",
    non_stacking_group: "feint",
  },
  {
    id: "sam.third_eye",
    name: "Third Eye",
    job: "SAM",
    cooldown_seconds: 15,
    duration_seconds: 4,
    mitigation_per_type: { all: 10 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Third_Eye",
  },
];
