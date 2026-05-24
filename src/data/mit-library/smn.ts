import type { MitigationType } from "@/domain/types";

// SMN mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Radiant Aegis is excluded — shield-only. Only the caster role
// action Addle applies.
export const SMN_MITS: MitigationType[] = [
  {
    id: "smn.addle",
    name: "Addle",
    job: "SMN",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 5, magical: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Addle",
  },
];
