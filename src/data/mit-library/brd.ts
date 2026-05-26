import type { MitigationType } from "@/domain/types";

// BRD mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Physical ranged DPS have no mit role action; only job-specific entries here.
export const BRD_MITS: MitigationType[] = [
  {
    id: "brd.troubadour",
    name: "Troubadour",
    job: "BRD",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Troubadour",
    non_stacking_group: "phys_range_mit",
  },
];
