import type { MitigationType } from "@/domain/types";

// MNK mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
export const MNK_MITS: MitigationType[] = [
  {
    id: "mnk.feint",
    name: "Feint",
    job: "MNK",
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
    id: "mnk.riddle_of_earth",
    name: "Riddle of Earth",
    job: "MNK",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Riddle_of_Earth",
  },
];
