import type { MitigationType } from "@/domain/types";

// WAR mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Vengeance is omitted — it upgrades to Damnation via trait at L92.
// Raw Intuition is omitted — it upgrades to Bloodwhetting via trait at L82.
// Bloodwhetting and Nascent Flash carry tiered % mit (10% / 8s outer + 10% /
// 0–4s inner via Stem the Flow); their cure-potency heal-on-weaponskill +
// Stem the Tide barrier are deferred per shielded-mits policy. They also
// share a single recast in-game (the "war.bloodwhetting_nf" group) — casting
// one locks the other out for 25s.
// Shake It Off dispels Thrill of Battle, Damnation, and Bloodwhetting on the
// caster at cast time (via `consumes_many`); each dispelled effect adds 2pp
// to the seeded barrier's max-HP fraction (via `barrier_bonus_per_dispelled_pct`).
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
    non_stacking_group: "reprisal",
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
    // 20s) deferred.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    shared_recast_group: "war.bloodwhetting_nf",
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
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    shared_recast_group: "war.bloodwhetting_nf",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Nascent_Flash",
  },
  {
    id: "war.thrill_of_battle",
    name: "Thrill of Battle",
    job: "WAR",
    cooldown_seconds: 90,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    max_hp_buff_pct: 20,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Thrill_of_Battle",
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
    barrier: { kind: "max_hp_pct", value: 15 },
    // Multi-target dispel: ends Thrill of Battle / Damnation / Bloodwhetting
    // on the caster slot at this cast's effect_time. Each dispelled type adds
    // 2pp to the barrier's max-HP fraction (uniform across party), so the
    // seeded barrier is 15/17/19/21% by dispel count.
    consumes_many: ["war.thrill_of_battle", "war.damnation", "war.bloodwhetting"],
    barrier_bonus_per_dispelled_pct: 2,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Shake_It_Off",
    reference_notes: [
      "On cast it ends Thrill of Battle, Damnation, and Bloodwhetting still running on the Warrior (their bars are trimmed). The shield starts at 15% max HP and gains +2 percentage points per effect consumed → 15 / 17 / 19 / 21%.",
    ],
  },
];
