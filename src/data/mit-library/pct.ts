import type { MitigationType } from "@/domain/types";

// PCT mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Tempera Coat / Tempera Grassa are excluded — shield-only per PRD §3.7.
// Only the caster role action Addle applies.
export const PCT_MITS: MitigationType[] = [
  {
    id: "pct.addle",
    name: "Addle",
    job: "PCT",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 5, magical: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Addle",
  },
];
