import type { MitigationType } from "@/domain/types";

// RPR mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
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
  {
    id: "rpr.arcane_crest",
    name: "Arcane Crest",
    job: "RPR",
    cooldown_seconds: 30,
    duration_seconds: 5,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    // Crest of Time Borrowed (heal-on-consume) modeled-out per Trust the timeline.
    barrier: { kind: "max_hp_pct", value: 10 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Arcane_Crest",
  },
];
