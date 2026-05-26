import type { MitigationType } from "@/domain/types";

// WAR mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Vengeance is omitted — it upgrades to Damnation via trait at L92.
// Raw Intuition is omitted — it upgrades to Bloodwhetting via trait at L82.
// Bloodwhetting and Nascent Flash carry tiered % mit (10% / 8s outer + 10% /
// 0–4s inner via Stem the Flow); their cure-potency heal-on-weaponskill +
// Stem the Tide barrier are deferred per shielded-mits policy.
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
  {
    id: "war.bloodwhetting",
    name: "Bloodwhetting",
    job: "WAR",
    cooldown_seconds: 25,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    // 400-potency heal-on-weaponskill + Stem the Tide barrier (cure-potency-based,
    // 20s) deferred. In-game shares recast with Nascent Flash — not modeled.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Bloodwhetting",
  },
  {
    id: "war.nascent_flash",
    name: "Nascent Flash",
    job: "WAR",
    cooldown_seconds: 25,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    // Heal-on-weaponskill + Stem the Tide barrier components deferred (cure-potency).
    // In-game shares recast with Bloodwhetting — not modeled.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Nascent_Flash",
  },
  {
    id: "war.shake_it_off",
    name: "Shake It Off",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    // Dispel + upgrade behavior deferred per PRD.
    barrier: { kind: "max_hp_pct", value: 15 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Shake_It_Off",
  },
];
