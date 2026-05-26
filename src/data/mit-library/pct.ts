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
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    // -60s to self CD when this shield is fully absorbed by a hit.
    cooldown_reduce_on_absorb: 60,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tempera_Coat",
  },
  {
    id: "pct.tempera_grassa",
    name: "Tempera Grassa",
    job: "PCT",
    cooldown_seconds: 120, // mirrored from Coat at render time via `consumes`
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    // Grassa is only castable while Coat is active and unabsorbed. Activation
    // ends Coat on the caster (its barrier pool is dropped) and seeds the
    // party-wide pool.
    consumes: "pct.tempera_coat",
    // -30s to the consumed Coat instance's CD when Grassa's shield is fully
    // absorbed by a hit. Convention (see types.ts): when `consumes` is set,
    // the reduction targets the consumed entry, not self.
    cooldown_reduce_on_absorb: 30,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tempera_Grassa",
  },
];
