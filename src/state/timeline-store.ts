// Single in-memory source of truth for the current timeline.
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

// Boss ability type names are unique within a timeline. Compared
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
  // The boss instance currently selected for editing in the BOSS ABILITIES
  // panel. Cleared automatically on load/close, on instance removal (direct or
  // via type cascade), and on explicit deselect.
  selectedInstanceId: string | null;

  newTimeline: (name: string) => void;
  loadTimeline: (file: TimelineFile) => void;
  closeTimeline: () => void;

  setBossName: (name: string) => void;
  setFightDuration: (sec: number) => void;

  setSlotJob: (slotIdx: number, job: JobOrUnset) => void;
  setSlotLabel: (slotIdx: number, label: string | undefined) => void;

  addBossAbilityType: (input: BossTypeInput) => string;
  updateBossAbilityType: (id: string, patch: Partial<BossTypeInput>) => void;
  removeBossAbilityType: (id: string) => void;

  addBossAbilityInstance: (input: BossInstanceInput) => string;
  updateBossAbilityInstance: (id: string, patch: Partial<BossInstanceInput>) => void;
  removeBossAbilityInstance: (id: string) => void;

  selectInstance: (id: string) => void;
  deselectInstance: () => void;

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
  selectedInstanceId: null,

  newTimeline: (name) => set({ timeline: makeNewTimeline(name), selectedInstanceId: null }),
  loadTimeline: (file) => set({ timeline: file, selectedInstanceId: null }),
  closeTimeline: () => set({ timeline: null, selectedInstanceId: null }),

  setBossName: (name) =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({ ...s.timeline, metadata: { ...s.timeline.metadata, boss_name: name } }),
      };
    }),

  setFightDuration: (sec) =>
    set((s) => {
      if (!s.timeline) return s;
      const clamped = Math.max(1, Math.round(sec));
      const survivingBoss = s.timeline.boss_ability_instances.filter(
        (i) => i.effect_time <= clamped,
      );
      const survivingMits = s.timeline.mitigation_instances.filter((m) => m.effect_time <= clamped);
      const survivingBossIds = new Set(survivingBoss.map((i) => i.id));
      const selectionStillValid =
        s.selectedInstanceId === null || survivingBossIds.has(s.selectedInstanceId);
      return {
        timeline: touch({
          ...s.timeline,
          metadata: { ...s.timeline.metadata, fight_duration_sec: clamped },
          boss_ability_instances: survivingBoss,
          mitigation_instances: survivingMits,
        }),
        ...(selectionStillValid ? {} : { selectedInstanceId: null }),
      };
    }),

  setSlotJob: (slotIdx, job) =>
    set((s) => {
      if (!s.timeline) return s;
      const existing = s.timeline.roster[slotIdx];
      if (!existing || existing.job === job) return s;
      const roster = s.timeline.roster.map((slot, i) =>
        i === slotIdx ? { ...slot, job } : slot,
      ) as unknown as TimelineFile["roster"];
      // A job change orphans the slot's mits — the mit library is keyed by
      // job, so existing entries would no longer surface in any sub-lane.
      // Cascade them out (mirrors setFightDuration's instance cascade).
      // The picker UI confirms with the user before invoking this when the
      // drop count is nonzero.
      const mitigation_instances = s.timeline.mitigation_instances.filter(
        (m) => m.player_slot_id !== existing.id,
      );
      return { timeline: touch({ ...s.timeline, roster, mitigation_instances }) };
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
      const cascadedIds = new Set(
        s.timeline.boss_ability_instances.filter((i) => i.type_id === id).map((i) => i.id),
      );
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: s.timeline.boss_ability_types.filter((t) => t.id !== id),
          // Cascade: removing a type also removes its instances. Avoids the
          // "dangling type_id" conflict category that's deferred to v0.2.
          boss_ability_instances: s.timeline.boss_ability_instances.filter((i) => i.type_id !== id),
        }),
        ...(s.selectedInstanceId !== null && cascadedIds.has(s.selectedInstanceId)
          ? { selectedInstanceId: null }
          : {}),
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
        ...(s.selectedInstanceId === id ? { selectedInstanceId: null } : {}),
      };
    }),

  selectInstance: (id) => set({ selectedInstanceId: id }),
  deselectInstance: () => set({ selectedInstanceId: null }),

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
