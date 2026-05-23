import type { MitigationType } from "@/domain/types";

// SAM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Only the melee role action Feint applies. Third Eye is excluded as conditional.
export const SAM_MITS: MitigationType[] = [
  {
    id: "sam.feint",
    name: "Feint",
    job: "SAM",
    cooldown_seconds: 90,
    duration_seconds: 15,
    mitigation_per_type: { physical: 10, magical: 5 },
    affects: "boss_debuff",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Feint",
  },
];
