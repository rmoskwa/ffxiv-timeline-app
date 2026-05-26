import type { MitigationType } from "@/domain/types";

// MCH mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Physical ranged DPS have no mit role action; only job-specific entries here.
export const MCH_MITS: MitigationType[] = [
  {
    id: "mch.tactician",
    name: "Tactician",
    job: "MCH",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Tactician",
    non_stacking_group: "phys_range_mit",
  },
  {
    id: "mch.dismantle",
    name: "Dismantle",
    job: "MCH",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Dismantle",
  },
];
