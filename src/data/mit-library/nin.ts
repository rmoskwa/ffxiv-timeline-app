import type { MitigationType } from "@/domain/types";

// NIN mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
export const NIN_MITS: MitigationType[] = [
  {
    id: "nin.feint",
    name: "Feint",
    job: "NIN",
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
    id: "nin.shade_shift",
    name: "Shade Shift",
    job: "NIN",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Shade_Shift",
  },
];
