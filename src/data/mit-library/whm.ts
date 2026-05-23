import type { MitigationType } from "@/domain/types";

// WHM mitigation kit, FFXIV 7.x (Dawntrail), level 100 values.
// Divine Benison and Aspected Helios are excluded — shield/heal only per PRD §3.7.
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
    wiki_url: "https://ffxiv.consolegameswiki.com/wiki/Temperance",
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
