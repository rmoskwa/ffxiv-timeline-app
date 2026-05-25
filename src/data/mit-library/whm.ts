import type { MitigationType } from "@/domain/types";

// WHM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Divine Benison, Divine Grace, Plenary Indulgence excluded — rotational cure-potency / heal-buff.
// Aspected Helios excluded — rotational cure-potency.
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
    affects: "target",
    max_charges: 1,
    mechanic: "mit",
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Aquaveil",
  },
];
