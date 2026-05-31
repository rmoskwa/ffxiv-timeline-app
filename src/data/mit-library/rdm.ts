import type { MitigationType } from "@/domain/types";

// RDM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Magick Barrier is a flat magical mit despite its name (also grants +5%
// healing received, not modeled).
export const RDM_MITS: MitigationType[] = [
  {
    id: "rdm.addle",
    name: "Addle",
    job: "RDM",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 5, magical: 10 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Addle",
    non_stacking_group: "addle",
  },
  {
    id: "rdm.magick_barrier",
    name: "Magick Barrier",
    job: "RDM",
    cooldown_seconds: 120,
    duration_seconds: 10,
    mitigation_per_type: { magical: 10 },
    affects: "party",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Magick_Barrier",
    reference_notes: ["Despite the name, a flat magical reduction, not a shield."],
  },
];
