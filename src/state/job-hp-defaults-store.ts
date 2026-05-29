// App-global Job HP defaults. A sparse per-job baseline the user configures
// once so newly assigned slots adopt a realistic L100 pool instead of the 100k
// fallback. NOT part of any TimelineFile — persisted to its own AppData file
// (see persistence/job-hp-defaults-storage.ts) and never serialized into a
// timeline. See CONTEXT.md → "Job HP default".

import { create } from "zustand";
import { clampSlotHp, type JobHpDefaults } from "@/domain/job-hp";
import type { Job } from "@/domain/types";

export interface JobHpDefaultsStore {
  defaults: JobHpDefaults;

  // Set or clear one job's default. `undefined` (blank field) removes the key,
  // reverting that job to the 100k baseline. A concrete value is clamped to
  // [SLOT_HP_MIN, SLOT_HP_MAX].
  setJobHp: (job: Job, hp: number | undefined) => void;

  // Replace the whole map (the modal's Save/Apply commit, and load-time
  // hydration). Each value is clamped; absent jobs stay absent.
  setAll: (map: JobHpDefaults) => void;
}

function clampMap(map: JobHpDefaults): JobHpDefaults {
  const out: JobHpDefaults = {};
  for (const [job, hp] of Object.entries(map) as [Job, number | undefined][]) {
    if (hp === undefined) continue;
    out[job] = clampSlotHp(hp);
  }
  return out;
}

export const useJobHpDefaultsStore = create<JobHpDefaultsStore>((set) => ({
  defaults: {},

  setJobHp: (job, hp) =>
    set((s) => {
      if (hp === undefined) {
        const { [job]: _drop, ...rest } = s.defaults;
        return { defaults: rest };
      }
      return { defaults: { ...s.defaults, [job]: clampSlotHp(hp) } };
    }),

  setAll: (map) => set({ defaults: clampMap(map) }),
}));
