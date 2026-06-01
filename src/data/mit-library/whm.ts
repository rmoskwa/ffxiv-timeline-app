import type { MitigationType } from "@/domain/types";

// WHM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Divine Benison, Divine Grace excluded — rotational cure-potency / heal-buff.
// Utility entries (planner anchors, 0% mit): Liturgy of the Bell, Divine Caress.
export const WHM_MITS: MitigationType[] = [
  {
    id: "whm.temperance",
    name: "Temperance",
    job: "WHM",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Temperance_(Ability)",
  },
  {
    id: "whm.aquaveil",
    name: "Aquaveil",
    job: "WHM",
    cooldown_seconds: 60,
    duration_seconds: 8,
    mitigation_per_type: { all: 15 },
    affects: "target_or_self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Aquaveil",
  },
  {
    id: "whm.plenary_indulgence",
    name: "Plenary Indulgence",
    job: "WHM",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Plenary_Indulgence",
    reference_notes: ["Only the 10% damage reduction is modeled."],
  },
  {
    id: "whm.liturgy_of_the_bell",
    name: "Liturgy of the Bell",
    job: "WHM",
    cooldown_seconds: 180,
    duration_seconds: 20,
    mitigation_per_type: {},
    affects: "none",
    max_charges: 1,
    mechanic: "utility",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Liturgy_of_the_Bell",
  },
  {
    id: "whm.divine_caress",
    name: "Divine Caress",
    job: "WHM",
    // vestigial — `gated_by` handles placement; CD mirrors parent for legacy consumers.
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "utility",
    gated_by: "whm.temperance",
    // 10s execution zone — shorter than Temperance's 20s active. Divine Caress
    // can only be cast in the first half of Temperance's window.
    execution_zone_seconds: 10,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Divine_Caress",
  },
];
