import type { MitigationType } from "@/domain/types";

// AST mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Post-Dawntrail card rework: cards no longer carry damage mit.
// Aspected Helios excluded — rotational cure-potency.
// Utility entries (planner anchors, 0% mit): Macrocosmos, Neutral Sect.
export const AST_MITS: MitigationType[] = [
  {
    id: "ast.collective_unconscious",
    name: "Collective Unconscious",
    job: "AST",
    cooldown_seconds: 60,
    duration_seconds: 10,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Collective_Unconscious",
  },
  {
    id: "ast.exaltation",
    name: "Exaltation",
    job: "AST",
    cooldown_seconds: 60,
    duration_seconds: 8,
    mitigation_per_type: { all: 10 },
    affects: "target_or_self",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Exaltation",
  },
  {
    id: "ast.sun_sign",
    name: "Sun Sign",
    job: "AST",
    // vestigial — `gated_by` handles placement; CD mirrors parent for legacy consumers.
    cooldown_seconds: 120,
    duration_seconds: 15,
    mitigation_per_type: { all: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    gated_by: "ast.neutral_sect",
    // 30s execution zone — exceeds Neutral Sect's 20s active by 10s. The
    // Suntouched buff is what gates the cast and outlives its parent.
    execution_zone_seconds: 30,
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Sun_Sign",
  },
  {
    id: "ast.macrocosmos",
    name: "Macrocosmos",
    job: "AST",
    cooldown_seconds: 180,
    duration_seconds: 15,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "utility",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Macrocosmos",
  },
  {
    id: "ast.neutral_sect",
    name: "Neutral Sect",
    job: "AST",
    cooldown_seconds: 120,
    duration_seconds: 20,
    mitigation_per_type: {},
    affects: "party",
    max_charges: 1,
    mechanic: "utility",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Neutral_Sect",
  },
];
