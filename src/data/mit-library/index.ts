import type { Job, MitigationType } from "@/domain/types";
import { BLM_MITS } from "./blm";
import { DRK_MITS } from "./drk";
import { MNK_MITS } from "./mnk";
import { SCH_MITS } from "./sch";

// v0.1 vertical slice — 4 jobs only (PRD §13.1). Remaining 17 jobs are data
// entry post-v0.1 (PRD §13.2 footer) and slot into this index as new files.
export const MIT_LIBRARY: readonly MitigationType[] = [
  ...DRK_MITS,
  ...SCH_MITS,
  ...MNK_MITS,
  ...BLM_MITS,
];

const BY_ID: ReadonlyMap<string, MitigationType> = new Map(MIT_LIBRARY.map((m) => [m.id, m]));

export function getMitById(id: string): MitigationType | undefined {
  return BY_ID.get(id);
}

export function getMitsForJob(job: Job): MitigationType[] {
  return MIT_LIBRARY.filter((m) => m.job === job);
}
