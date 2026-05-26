import type { MitigationType } from "@/domain/types";

// SMN mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
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
  {
    id: "smn.radiant_aegis",
    name: "Radiant Aegis",
    job: "SMN",
    cooldown_seconds: 60, // per-charge recharge
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 2,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 20 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Radiant_Aegis",
  },
];
