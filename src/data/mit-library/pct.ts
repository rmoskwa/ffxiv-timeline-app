import type { MitigationType } from "@/domain/types";

// PCT mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
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
  {
    id: "pct.tempera_coat",
    name: "Tempera Coat",
    job: "PCT",
    cooldown_seconds: 120, // CD-reduce-on-absorb deferred per PRD
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tempera_Coat",
  },
  {
    id: "pct.tempera_grassa",
    name: "Tempera Grassa",
    job: "PCT",
    cooldown_seconds: 120, // stopgap: inherits Tempera Coat's CD; CD-reduce-on-absorb deferred
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    // Grassa is only castable while Coat is active. Activation ends Coat on the
    // caster (its barrier pool is dropped) and seeds the party-wide pool.
    consumes: "pct.tempera_coat",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tempera_Grassa",
  },
];
