// App-global Mit lane layout. A sparse per-job record of the vertical order and
// visibility of that job's mitigation Sub-lanes on the canvas. A personal
// authoring preference — NOT part of any TimelineFile, persisted to its own
// AppData file (see persistence/mit-lane-layout-storage.ts) and never serialized
// into a timeline. Canvas-only visual lens: a hidden Sub-lane's
// instances still occupy the timeline and still feed the survival math. Parallels
// the Job HP default / Ability color default stores. See CONTEXT.md → "Mit lane
// layout".

import { create } from "zustand";
import type { Job } from "@/domain/types";

// One entry per non-gated mit type the user has arranged for a job.
export interface MitLaneEntry {
  typeId: string; // MitigationType.id, non-gated
  hidden: boolean;
}

// Sparse: a job absent from the map = library-default order, all visible.
export type MitLaneLayout = Partial<Record<Job, MitLaneEntry[]>>;

export interface MitLaneLayoutStore {
  layout: MitLaneLayout;

  // Store one job's full ordered entry list. The moment a user reorders/hides a
  // job, that job's complete list is stored; jobs still matching the library
  // default stay absent (the modal's normalize-on-Save keeps the map sparse).
  setJobLayout: (job: Job, entries: MitLaneEntry[]) => void;

  // Drop one job's entry → revert to library-default order, all visible.
  resetJob: (job: Job) => void;

  // Replace the whole map (the modal's Save commit and load-time hydration).
  setAll: (map: MitLaneLayout) => void;
}

export const useMitLaneLayoutStore = create<MitLaneLayoutStore>((set) => ({
  layout: {},

  setJobLayout: (job, entries) => set((s) => ({ layout: { ...s.layout, [job]: entries } })),

  resetJob: (job) =>
    set((s) => {
      const { [job]: _drop, ...rest } = s.layout;
      return { layout: rest };
    }),

  setAll: (map) => set({ layout: map }),
}));
