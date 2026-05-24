import type { MitigationType } from "@/domain/types";

// DNC mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Physical ranged DPS have no mit role action; only job-specific entries here.
// Improvised Finish (shield) is excluded.
export const DNC_MITS: MitigationType[] = [
  {
    id: "dnc.shield_samba",
    name: "Shield Samba",
    job: "DNC",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Shield_Samba",
  },
];
