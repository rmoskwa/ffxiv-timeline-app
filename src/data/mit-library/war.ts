import type { MitigationType } from "@/domain/types";

// WAR mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Vengeance is omitted — it upgrades to Damnation via trait at L92.
// Shake It Off is excluded — wiki confirms it is barrier-only, not flat %.
// Bloodwhetting / Raw Intuition are excluded as conditional.
export const WAR_MITS: MitigationType[] = [
  {
    id: "war.rampart",
    name: "Rampart",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
  },
  {
    id: "war.reprisal",
    name: "Reprisal",
    job: "WAR",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Reprisal",
  },
  {
    id: "war.damnation",
    name: "Damnation",
    job: "WAR",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Damnation",
  },
  {
    id: "war.holmgang",
    name: "Holmgang",
    job: "WAR",
    cooldown_seconds: 240,
    duration_seconds: 10,
    mitigation_per_type: { all: 100 },
    affects: "self",
    max_charges: 1,
    mechanic: "invuln",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Holmgang",
  },
];
