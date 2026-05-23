import type { MitigationType } from "@/domain/types";

// RPR mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Only the melee role action Feint applies. Arcane Crest is a small shield —
// excluded per PRD §3.7.
export const RPR_MITS: MitigationType[] = [
  {
    id: "rpr.feint",
    name: "Feint",
    job: "RPR",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 10, magical: 5 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Feint",
  },
];
