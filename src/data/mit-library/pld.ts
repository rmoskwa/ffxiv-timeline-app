import type { MitigationType } from "@/domain/types";

// PLD mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Sentinel is omitted — it upgrades to Guardian via trait at L92.
// Sheltron is omitted — it upgrades to Holy Sheltron via trait at L82.
// Holy Sheltron and Intervention carry tiered % mit (15% / 15% and 10% / 10%
// respectively, with the inner tier covering the first 4s); their cure-potency
// Knight's Benediction regen is deferred per shielded-mits policy. Intervention's
// conditional +10% bonus while Rampart/Guardian is active is also deferred.
export const PLD_MITS: MitigationType[] = [
  {
    id: "pld.rampart",
    name: "Rampart",
    job: "PLD",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
  },
  {
    id: "pld.reprisal",
    name: "Reprisal",
    job: "PLD",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Reprisal",
  },
  {
    id: "pld.guardian",
    name: "Guardian",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    // Cure-potency barrier approximated as flat 15% max HP — revisit when
    // potency shields are properly modeled (PRD line 33).
    barrier: { kind: "max_hp_pct", value: 15 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Guardian",
  },
  {
    id: "pld.passage_of_arms",
    name: "Passage of Arms",
    job: "PLD",
    cooldown_seconds: 120,
    duration_seconds: 18,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Passage_of_Arms",
  },
  {
    id: "pld.holy_sheltron",
    name: "Holy Sheltron",
    job: "PLD",
    cooldown_seconds: 5,
    duration_seconds: 8,
    mitigation_per_type: { all: 15 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    // Knight's Benediction (250-potency regen, 12s) deferred per shielded-mits policy.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 15 } }],
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Holy_Sheltron",
  },
  {
    id: "pld.intervention",
    name: "Intervention",
    job: "PLD",
    cooldown_seconds: 10,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    // Knight's Benediction regen + conditional +10% during Rampart/Guardian deferred
    // per shielded-mits policy / Trust the timeline.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Intervention",
  },
  {
    id: "pld.hallowed_ground",
    name: "Hallowed Ground",
    job: "PLD",
    cooldown_seconds: 420,
    duration_seconds: 10,
    mitigation_per_type: { all: 100 },
    affects: "self",
    max_charges: 1,
    mechanic: "invuln",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Hallowed_Ground",
  },
  {
    id: "pld.divine_veil",
    name: "Divine Veil",
    job: "PLD",
    cooldown_seconds: 90,
    duration_seconds: 30,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    // Heal-trigger waived per Trust the timeline.
    barrier: { kind: "max_hp_pct", value: 10 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Divine_Veil",
  },
];
