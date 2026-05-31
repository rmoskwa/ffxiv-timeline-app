import type { MitigationType } from "@/domain/types";

// PLD mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Sentinel is omitted — it upgrades to Guardian via trait at L92.
// Sheltron is omitted — it upgrades to Holy Sheltron via trait at L82.
// Holy Sheltron and Intervention carry tiered % mit (15% / 15% and 10% / 10%
// respectively, with the inner tier covering the first 4s); their cure-potency
// Knight's Benediction regen is deferred per shielded-mits policy.
// Intervention also carries a conditional +10% bonus when cast under Rampart
// or Guardian (cast-time snapshot, applies for the full active window).
// Passage of Arms is a first-class held ability: the cast applies a 5s effect
// that refreshes while held, up to a 23s active window (18s max hold + 5s tail).
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
    non_stacking_group: "reprisal",
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
    // potency shields are properly modeled.
    barrier: { kind: "max_hp_pct", value: 15 },
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Guardian",
    reference_notes: [
      "Shield is an approximation — a flat 15% of max HP; in-game it scales with cure potency, which the app doesn't model.",
    ],
  },
  {
    id: "pld.passage_of_arms",
    name: "Passage of Arms",
    job: "PLD",
    cooldown_seconds: 120,
    // Held ability: 5s effect refreshed each tick of hold, up to 23s total
    // (18s max hold + 5s residual after release). User extends via the bar's
    // right-edge resize handle; default at placement is min.
    duration_seconds: 23,
    min_duration_seconds: 5,
    mitigation_per_type: { all: 15 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Passage_of_Arms",
    reference_notes: [
      "Held/channeled: starts at the 5s minimum; drag the bar's right edge (or use the mit inspector) to extend up to 23s. Placing another Paladin mitigation inside the hold ends the channel early.",
    ],
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
    // Knight's Benediction regen deferred per shielded-mits policy.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 10 } }],
    conditional_bonus: {
      requires_active: ["pld.rampart", "pld.guardian"],
      mitigation_per_type: { all: 10 },
    },
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
