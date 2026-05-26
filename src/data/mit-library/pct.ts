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
    non_stacking_group: "addle",
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
    // vestigial for placement (gated_by handles that); kept for legacy consumers.
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 10 },
    // Dual relationship with Tempera Coat:
    //   gated_by — Grassa can only be cast inside Coat's execution zone (default = duration).
    //   consumes — casting Grassa drops Coat's barrier pool on the caster.
    // Both apply on every Grassa cast; they are independent constraints.
    gated_by: "pct.tempera_coat",
    consumes: "pct.tempera_coat",
    // -30s to the consumed Coat instance's CD when Grassa's shield is fully
    // absorbed by a hit. Convention (see types.ts): when `consumes` is set,
    // the reduction targets the consumed entry, not self.
    cooldown_reduce_on_absorb: 30,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tempera_Grassa",
  },
];
