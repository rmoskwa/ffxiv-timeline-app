import type { MitigationType } from "@/domain/types";

// GNB mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Nebula is omitted — it upgrades to Great Nebula via trait at L92.
// Heart of Stone is omitted — it upgrades to Heart of Corundum via trait at L82.
// Heart of Corundum carries tiered % mit (15% / 8s outer + 15% / 0–4s inner via
// Clarity of Corundum); its Catharsis of Corundum cure-potency heal and the
// Brutal Shell transfer are deferred per shielded-mits policy.
export const GNB_MITS: MitigationType[] = [
  {
    id: "gnb.rampart",
    name: "Rampart",
    job: "GNB",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 20 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Rampart",
  },
  {
    id: "gnb.reprisal",
    name: "Reprisal",
    job: "GNB",
    cooldown_seconds: 60,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Reprisal",
  },
  {
    id: "gnb.camouflage",
    name: "Camouflage",
    job: "GNB",
    cooldown_seconds: 90,
    duration_seconds: 20,
    mitigation_per_type: { all: 10 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Camouflage",
  },
  {
    id: "gnb.great_nebula",
    name: "Great Nebula",
    job: "GNB",
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 40 },
    affects: "self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Great_Nebula",
  },
  {
    id: "gnb.heart_of_light",
    name: "Heart of Light",
    job: "GNB",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 5, magical: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Heart_of_Light",
  },
  {
    id: "gnb.heart_of_corundum",
    name: "Heart of Corundum",
    job: "GNB",
    cooldown_seconds: 25,
    duration_seconds: 8,
    mitigation_per_type: { all: 15 },
    affects: "target_or_self",
    max_charges: 1,
    mechanic: "mit",
    // Catharsis of Corundum (900-potency heal at <50% HP / expiry) deferred per
    // shielded-mits policy. Brutal Shell transfer not modeled.
    tiers: [{ offset_seconds: 0, duration_seconds: 4, mitigation_per_type: { all: 15 } }],
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Heart_of_Corundum",
  },
  {
    id: "gnb.superbolide",
    name: "Superbolide",
    job: "GNB",
    cooldown_seconds: 360,
    duration_seconds: 10,
    mitigation_per_type: { all: 100 },
    affects: "self",
    max_charges: 1,
    mechanic: "invuln",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Superbolide",
  },
];
