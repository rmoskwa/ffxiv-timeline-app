import type { MitigationType } from "@/domain/types";

// AST mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Post-Dawntrail card rework: cards no longer carry damage mit.
// Macrocosmos is excluded — it's a damage-storage/heal mechanic, not flat %.
// Sun Sign is excluded — Suntouched-gated, conditional.
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
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Exaltation",
  },
];
