import type { MitigationType } from "@/domain/types";

// BLM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
export const BLM_MITS: MitigationType[] = [
  {
    id: "blm.addle",
    name: "Addle",
    job: "BLM",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 5, magical: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Addle",
  },
  {
    id: "blm.manaward",
    name: "Manaward",
    job: "BLM",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    barrier: { kind: "max_hp_pct", value: 30 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Manaward",
  },
];
