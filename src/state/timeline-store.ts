// Single in-memory source of truth for the current timeline. PRD §11–§12.
// No persistence wiring yet — that lands when the Tauri FS plugin is hooked up.

import { create } from "zustand";
import type {
  BossAbilityInstance,
  BossAbilityType,
  JobOrUnset,
  MitigationInstance,
  TimelineFile,
} from "@/domain/types";
import { newTimeline as makeNewTimeline } from "@/persistence/serialize";

type BossTypeInput = Omit<BossAbilityType, "id">;
type BossInstanceInput = Omit<BossAbilityInstance, "id" | "observed_damage">;
type MitInstanceInput = Omit<MitigationInstance, "id" | "coverage_overrides">;

// PRD §3.2: boss ability type names are unique within a timeline. Compared
// case-insensitively after trim so "Replication I" and " replication i " collide.
export class DuplicateNameError extends Error {
  constructor(name: string) {
    super(`A boss ability named "${name}" already exists in this timeline.`);
    this.name = "DuplicateNameError";
  }
}

function normalizeName(n: string): string {
  return n.trim().toLowerCase();
}

export interface TimelineStore {
  timeline: TimelineFile | null;

  newTimeline: (name: string) => void;
  loadTimeline: (file: TimelineFile) => void;
  closeTimeline: () => void;

  setSlotJob: (slotIdx: number, job: JobOrUnset) => void;
  setSlotLabel: (slotIdx: number, label: string | undefined) => void;

  addBossAbilityType: (input: BossTypeInput) => string;
  updateBossAbilityType: (id: string, patch: Partial<BossTypeInput>) => void;
  removeBossAbilityType: (id: string) => void;

  addBossAbilityInstance: (input: BossInstanceInput) => string;
  updateBossAbilityInstance: (id: string, patch: Partial<BossInstanceInput>) => void;
  removeBossAbilityInstance: (id: string) => void;

  addMitigationInstance: (input: MitInstanceInput) => string;
  updateMitigationInstance: (id: string, patch: Partial<MitInstanceInput>) => void;
  removeMitigationInstance: (id: string) => void;
}

// Stamp updated_at on every mutation so auto-save can diff cheaply later.
function touch(tl: TimelineFile): TimelineFile {
  return { ...tl, metadata: { ...tl.metadata, updated_at: new Date().toISOString() } };
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  timeline: null,

  newTimeline: (name) => set({ timeline: makeNewTimeline(name) }),
  loadTimeline: (file) => set({ timeline: file }),
  closeTimeline: () => set({ timeline: null }),

  setSlotJob: (slotIdx, job) =>
    set((s) => {
      if (!s.timeline) return s;
      const roster = s.timeline.roster.map((slot, i) =>
        i === slotIdx ? { ...slot, job } : slot,
      ) as unknown as TimelineFile["roster"];
      return { timeline: touch({ ...s.timeline, roster }) };
    }),

  setSlotLabel: (slotIdx, label) =>
    set((s) => {
      if (!s.timeline) return s;
      const roster = s.timeline.roster.map((slot, i) => {
        if (i !== slotIdx) return slot;
        // exactOptionalPropertyTypes: omit the key when label is undefined.
        if (label === undefined) {
          const { name_label: _drop, ...rest } = slot;
          return rest;
        }
        return { ...slot, name_label: label };
      }) as unknown as TimelineFile["roster"];
      return { timeline: touch({ ...s.timeline, roster }) };
    }),

  addBossAbilityType: (input) => {
    const id = crypto.randomUUID();
    const tl = useTimelineStore.getState().timeline;
    if (tl) {
      const target = normalizeName(input.name);
      if (tl.boss_ability_types.some((t) => normalizeName(t.name) === target)) {
        throw new DuplicateNameError(input.name.trim());
      }
    }
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: [...s.timeline.boss_ability_types, { ...input, id }],
        }),
      };
    });
    return id;
  },

  updateBossAbilityType: (id, patch) =>
    set((s) => {
      if (!s.timeline) return s;
      if (patch.name !== undefined) {
        const target = normalizeName(patch.name);
        if (
          s.timeline.boss_ability_types.some((t) => t.id !== id && normalizeName(t.name) === target)
        ) {
          throw new DuplicateNameError(patch.name.trim());
        }
      }
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: s.timeline.boss_ability_types.map((t) =>
            t.id === id ? { ...t, ...patch } : t,
          ),
        }),
      };
    }),

  removeBossAbilityType: (id) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: s.timeline.boss_ability_types.filter((t) => t.id !== id),
          // Cascade: removing a type also removes its instances. Avoids the
          // "dangling type_id" conflict category that's deferred to v0.2.
          boss_ability_instances: s.timeline.boss_ability_instances.filter((i) => i.type_id !== id),
        }),
      };
    }),

  addBossAbilityInstance: (input) => {
    const id = crypto.randomUUID();
    set((s) => {
      if (!s.timeline) return s;
      const instance: BossAbilityInstance = { ...input, id, observed_damage: [] };
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_instances: [...s.timeline.boss_ability_instances, instance],
        }),
      };
    });
    return id;
  },

  updateBossAbilityInstance: (id, patch) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_instances: s.timeline.boss_ability_instances.map((i) =>
            i.id === id ? { ...i, ...patch } : i,
          ),
        }),
      };
    }),

  removeBossAbilityInstance: (id) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_instances: s.timeline.boss_ability_instances.filter((i) => i.id !== id),
        }),
      };
    }),

  addMitigationInstance: (input) => {
    const id = crypto.randomUUID();
    set((s) => {
      if (!s.timeline) return s;
      const instance: MitigationInstance = { ...input, id, coverage_overrides: [] };
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: [...s.timeline.mitigation_instances, instance],
        }),
      };
    });
    return id;
  },

  updateMitigationInstance: (id, patch) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: s.timeline.mitigation_instances.map((m) =>
            m.id === id ? { ...m, ...patch } : m,
          ),
        }),
      };
    }),

  removeMitigationInstance: (id) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: s.timeline.mitigation_instances.filter((m) => m.id !== id),
        }),
      };
    }),
}));
