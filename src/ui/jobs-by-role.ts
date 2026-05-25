import type { Job } from "@/domain/types";

// Canonical role grouping for any UI that needs jobs arranged the way a player
// would expect (tanks first, casters last). Consumed by the setup wizard and
// the roster-panel job picker.
export const JOBS_BY_ROLE: readonly { role: string; jobs: readonly Job[] }[] = [
  { role: "Tanks", jobs: ["PLD", "WAR", "DRK", "GNB"] },
  { role: "Healers", jobs: ["WHM", "SCH", "AST", "SGE"] },
  { role: "Melee DPS", jobs: ["MNK", "DRG", "NIN", "SAM", "RPR", "VPR"] },
  { role: "Phys Ranged", jobs: ["BRD", "MCH", "DNC"] },
  { role: "Casters", jobs: ["BLM", "SMN", "RDM", "PCT"] },
] as const;
