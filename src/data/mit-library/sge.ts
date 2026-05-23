import type { MitigationType } from "@/domain/types";

// SGE mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Panhaima is excluded — wiki confirms it is barrier-only, not flat %.
// Krasis (healing received up) and Philosophia (healing magnitude up) are
// excluded — they amplify heals, not mitigate damage.
export const SGE_MITS: MitigationType[] = [
  {
    id: "sge.kerachole",
    name: "Kerachole",
    job: "SGE",
    cooldown_seconds: 30,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Kerachole",
  },
  {
    id: "sge.holos",
    name: "Holos",
    job: "SGE",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Holos",
  },
];
