import type { MitigationType } from "@/domain/types";

// SGE mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Krasis, Eukrasian Diagnosis, Eukrasian Prognosis excluded — rotational cure-potency / heal-buff.
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
  {
    id: "sge.taurochole",
    name: "Taurochole",
    job: "SGE",
    cooldown_seconds: 45,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Taurochole",
  },
];
