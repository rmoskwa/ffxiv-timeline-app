// Single in-memory source of truth for the current timeline.
// No persistence wiring yet — that lands when the Tauri FS plugin is hooked up.

import { create } from "zustand";
import { getGatedChildrenOf, getMitById } from "@/data/mit-library";
import { hitLandsOn, resolveHit } from "@/domain/coverage";
import { computeGatingStates } from "@/domain/evaluate-timeline";
import { clampSlotHp, resolveDefaultHp } from "@/domain/job-hp";
import {
  normalizeNameForCompare,
  sanitizeDescription,
  sanitizeSingleLineName,
} from "@/domain/sanitize-text";
import {
  type BossAbilityInstance,
  type BossAbilityType,
  type BossTimelineFile,
  type JobOrUnset,
  MAX_BASE_DAMAGE,
  MAX_BOSS_ABILITY_INSTANCES,
  MAX_BOSS_ABILITY_TYPES,
  MAX_DESC_LEN,
  MAX_FIGHT_DURATION_SEC,
  MAX_MITIGATION_INSTANCES,
  MAX_NAME_LEN,
  MAX_PHASES,
  MAX_PRE_PULL_SEC,
  type MitigationInstance,
  type Phase,
  type TimelineFile,
} from "@/domain/types";
import { newTimeline as makeNewTimeline } from "@/persistence/serialize";
import { useJobHpDefaultsStore } from "./job-hp-defaults-store";

type BossTypeInput = Omit<BossAbilityType, "id">;
type BossInstanceInput = Omit<
  BossAbilityInstance,
  "id" | "observed_damage" | "no_full_heal_slot_ids"
>;
type MitInstanceInput = Omit<MitigationInstance, "id" | "coverage_overrides">;

// Boss ability type names are unique within a timeline. Compared
// case-insensitively after trim so "Replication I" and " replication i " collide.
export class DuplicateNameError extends Error {
  constructor(name: string) {
    super(`A boss ability named "${name}" already exists in this timeline.`);
    this.name = "DuplicateNameError";
  }
}

// Required name fields (today: boss ability type name) must contain at least
// one non-whitespace character. UI surfaces this as a field error; the store
// throws to defend non-UI callers.
export class EmptyNameError extends Error {
  constructor() {
    super("Name is required.");
    this.name = "EmptyNameError";
  }
}

// One of the four unbounded collections (boss ability types/instances, mit
// instances, phases) hit its hard cap. Caps sit at roughly 5–10× a realistic
// fight, so a planner never bumps them — this error guards against runaway
// imports and programmatic-loop accidents. See domain/types.ts MAX_* constants.
export class LimitExceededError extends Error {
  constructor(
    public readonly collection:
      | "boss_ability_types"
      | "boss_ability_instances"
      | "mitigation_instances"
      | "phases",
    public readonly cap: number,
  ) {
    super(`Cannot add more than ${cap} ${collection.replace(/_/g, " ")} to a single timeline.`);
    this.name = "LimitExceededError";
  }
}

// Plausible FFXIV per-slot HP range — defined in the pure domain layer so the
// Job HP defaults config and the timeline store share one source. Re-exported
// here for existing importers (RosterPanel).
export { SLOT_HP_MAX, SLOT_HP_MIN } from "@/domain/job-hp";

function clampBaseDamage(n: number): number {
  return Math.min(MAX_BASE_DAMAGE, Math.max(0, Math.round(n)));
}

// At most one instance is selected at a time, across boss and mit kinds.
// Selecting one clears the other; deselecting clears the field entirely.
export type SelectedInstance = { kind: "boss" | "mit"; id: string } | null;

export interface TimelineStore {
  timeline: TimelineFile | null;
  selectedInstance: SelectedInstance;

  newTimeline: (name: string) => void;
  loadTimeline: (file: TimelineFile) => void;
  closeTimeline: () => void;

  // Wipes boss ability types/instances, mitigation instances, and phases.
  // Preserves roster and metadata (boss_name, fight_duration_sec).
  clearTimeline: () => void;

  // Boss-timeline import: replaces the destination Timeline's boss types and
  // instances with the imported payload, wipes mitigation instances (boss-
  // anchored), bumps boss_name, and extends fight_duration_sec upward only.
  // See docs/boss-timeline-import-export.md §5.2.
  replaceBossTimeline: (imported: BossTimelineFile) => void;

  setName: (name: string) => void;
  setBossName: (name: string) => void;
  setFightDuration: (sec: number) => void;
  // Pre-pull section size (Start = -sec). Clamped to [0, MAX_PRE_PULL_SEC];
  // shrinking culls mits left of the new Start, mirroring setFightDuration.
  setPrePullDuration: (sec: number) => void;

  setSlotJob: (slotIdx: number, job: JobOrUnset) => void;
  setSlotLabel: (slotIdx: number, label: string | undefined) => void;
  setSlotHp: (slotIdx: number, hp: number | undefined) => void;
  // Move the slot at `fromIdx` to `toIdx`, shifting the rest. A document
  // mutation (ADR-0008): permutes the persisted roster AND every boss
  // instance's position-keyed observed_damage[].damage_per_player in lockstep.
  // No mit cascade (mits bind by slot ID), no confirmation. Out-of-range or
  // no-op indices are ignored.
  reorderSlot: (fromIdx: number, toIdx: number) => void;
  // Re-seed every default-derived, job-holding slot from the current Job HP
  // defaults. Skips hand-tuned (`hp_manual`) and `unset` slots; HP-only batch
  // that never routes through setSlotJob (so it cannot wipe mits).
  applyJobDefaultsToRoster: () => void;

  addBossAbilityType: (input: BossTypeInput) => string;
  updateBossAbilityType: (id: string, patch: Partial<BossTypeInput>) => void;
  removeBossAbilityType: (id: string) => void;

  addBossAbilityInstance: (input: BossInstanceInput) => string;
  updateBossAbilityInstance: (id: string, patch: Partial<BossInstanceInput>) => void;
  removeBossAbilityInstance: (id: string) => void;

  selectBossInstance: (id: string) => void;
  selectMitInstance: (id: string) => void;
  deselectInstance: () => void;

  // Full heal flag (ADR 0004). Per (boss-hit effect_time × player slot): flip
  // whether the slot is topped to full HP before the chip at that time, or
  // carries its HP forward from the previous chip. Writes the negative-sense
  // flag to every boss instance that lands a hit on the slot at that time, so
  // a multi-instance bucket stays consistent under the engine's OR-merge.
  toggleChipNoFullHeal: (effectTime: number, slotId: string) => void;

  addMitigationInstance: (input: MitInstanceInput) => string;
  updateMitigationInstance: (id: string, patch: Partial<MitInstanceInput>) => void;
  removeMitigationInstance: (id: string) => void;
  applyGatedRestack: (
    updates: readonly { id: string; effectTime: number }[],
    removeId?: string,
  ) => void;

  // Phase actions. See docs/phases.md §5.
  addPhase: (input: { start_time: number; name: string }) => void;
  renamePhase: (id: string, name: string) => void;
  setPhaseStartTime: (id: string, start_time: number) => void;
  deletePhase: (id: string) => void;
}

// PhaseRejectedError is raised by store actions when an input would break the
// phases-tile-the-timeline invariant (see docs/phases.md §4.2/§5). Callers
// (modal, panel) surface the message inline.
export class PhaseRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseRejectedError";
  }
}

// Stamp updated_at on every mutation so auto-save can diff cheaply later.
function touch(tl: TimelineFile): TimelineFile {
  return { ...tl, metadata: { ...tl.metadata, updated_at: new Date().toISOString() } };
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  timeline: null,
  selectedInstance: null,

  newTimeline: (name) => set({ timeline: makeNewTimeline(name), selectedInstance: null }),
  loadTimeline: (file) => set({ timeline: file, selectedInstance: null }),
  closeTimeline: () => set({ timeline: null, selectedInstance: null }),

  clearTimeline: () =>
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: [],
          boss_ability_instances: [],
          mitigation_instances: [],
          phases: [],
        }),
        selectedInstance: null,
      };
    }),

  replaceBossTimeline: (imported) => {
    // Hard caps on the imported payload — the deserializer also enforces
    // these, but a replaceBossTimeline call from any other (programmatic)
    // path must hit the same gate.
    if (imported.boss_ability_types.length > MAX_BOSS_ABILITY_TYPES) {
      throw new LimitExceededError("boss_ability_types", MAX_BOSS_ABILITY_TYPES);
    }
    if (imported.boss_ability_instances.length > MAX_BOSS_ABILITY_INSTANCES) {
      throw new LimitExceededError("boss_ability_instances", MAX_BOSS_ABILITY_INSTANCES);
    }
    if (imported.phases.length > MAX_PHASES) {
      throw new LimitExceededError("phases", MAX_PHASES);
    }
    set((s) => {
      if (!s.timeline) return s;
      const maxEffect = imported.boss_ability_instances.reduce(
        (m, i) => (i.effect_time > m ? i.effect_time : m),
        0,
      );
      // Extend upward to fit the import, but never past MAX_FIGHT_DURATION_SEC.
      // Instances/phases past the cap are culled the same way setFightDuration
      // does — the cap is the app-wide invariant, not import-exempt.
      const nextDuration = Math.min(
        MAX_FIGHT_DURATION_SEC,
        Math.max(s.timeline.metadata.fight_duration_sec, maxEffect),
      );
      const survivingInstances = imported.boss_ability_instances.filter(
        (i) => i.effect_time <= nextDuration,
      );
      const culledPhases = imported.phases.filter((p) => p.start_time < nextDuration);
      const survivingPhases = culledPhases.length >= 2 ? culledPhases.map((p) => ({ ...p })) : [];
      return {
        timeline: touch({
          ...s.timeline,
          metadata: {
            ...s.timeline.metadata,
            boss_name: imported.boss_name,
            fight_duration_sec: nextDuration,
          },
          boss_ability_types: imported.boss_ability_types,
          boss_ability_instances: survivingInstances,
          mitigation_instances: [],
          phases: survivingPhases,
        }),
        selectedInstance: null,
      };
    });
  },

  // Typing buffer for the fight-name input — accepts raw value (including
  // whitespace mid-edit). The UI applies the "Untitled Timeline" fallback on
  // blur. The deserialize path applies the same fallback on import.
  setName: (name) =>
    set((s) => {
      if (!s.timeline) return s;
      const clipped = sanitizeSingleLineName(name).slice(0, MAX_NAME_LEN);
      return {
        timeline: touch({ ...s.timeline, metadata: { ...s.timeline.metadata, name: clipped } }),
      };
    }),

  // Typing buffer for the boss-name input — see setName above for the rule.
  // UI applies the "Boss Name" fallback on blur; deserialize falls back on import.
  setBossName: (name) =>
    set((s) => {
      if (!s.timeline) return s;
      const clipped = sanitizeSingleLineName(name).slice(0, MAX_NAME_LEN);
      return {
        timeline: touch({
          ...s.timeline,
          metadata: { ...s.timeline.metadata, boss_name: clipped },
        }),
      };
    }),

  setFightDuration: (sec) =>
    set((s) => {
      if (!s.timeline) return s;
      const clamped = Math.min(MAX_FIGHT_DURATION_SEC, Math.max(1, Math.round(sec)));
      const survivingBoss = s.timeline.boss_ability_instances.filter(
        (i) => i.effect_time <= clamped,
      );
      // A mit's footprint may legally extend past the timeline end (the buff
      // outlasts the encounter); only drop mits whose effect_time itself is
      // now past the new end.
      const survivingMits = s.timeline.mitigation_instances.filter((m) => m.effect_time <= clamped);
      // Phases must remain strictly inside the timeline (first phase pinned at
      // 0; all others < fight_duration_sec). Dropping to a single survivor
      // collapses the UI back to the empty-phases case per docs/phases.md §5.
      const culledPhases = s.timeline.phases.filter((p) => p.start_time < clamped);
      const survivingPhases = culledPhases.length >= 2 ? culledPhases : [];
      const survivingBossIds = new Set(survivingBoss.map((i) => i.id));
      const survivingMitIds = new Set(survivingMits.map((m) => m.id));
      const sel = s.selectedInstance;
      const selectionStillValid =
        sel === null ||
        (sel.kind === "boss" ? survivingBossIds.has(sel.id) : survivingMitIds.has(sel.id));
      return {
        timeline: touch({
          ...s.timeline,
          metadata: { ...s.timeline.metadata, fight_duration_sec: clamped },
          boss_ability_instances: survivingBoss,
          mitigation_instances: survivingMits,
          phases: survivingPhases,
        }),
        ...(selectionStillValid ? {} : { selectedInstance: null }),
      };
    }),

  setPrePullDuration: (sec) =>
    set((s) => {
      if (!s.timeline) return s;
      const clamped = Math.min(MAX_PRE_PULL_SEC, Math.max(0, Math.round(sec)));
      // Mits left of the new Start are culled — the symmetric rule to
      // setFightDuration's cull past the right edge. Boss instances and phases
      // never sit pre-pull, so only mits are affected. A surviving gated child
      // whose parent was culled goes with it (children may sit later than a
      // pre-pull parent, so the time filter alone can't catch them).
      const timeSurvivors = s.timeline.mitigation_instances.filter(
        (m) => m.effect_time >= -clamped,
      );
      const survivorIds = new Set(timeSurvivors.map((m) => m.id));
      const survivingMits = timeSurvivors.filter(
        (m) => m.parent_instance_id == null || survivorIds.has(m.parent_instance_id),
      );
      const survivingMitIds = new Set(survivingMits.map((m) => m.id));
      const sel = s.selectedInstance;
      const selectionStillValid =
        sel === null || sel.kind === "boss" || survivingMitIds.has(sel.id);
      return {
        timeline: touch({
          ...s.timeline,
          metadata: { ...s.timeline.metadata, pre_pull_duration_sec: clamped },
          mitigation_instances: survivingMits,
        }),
        ...(selectionStillValid ? {} : { selectedInstance: null }),
      };
    }),

  setSlotJob: (slotIdx, job) =>
    set((s) => {
      if (!s.timeline) return s;
      const existing = s.timeline.roster[slotIdx];
      if (!existing || existing.job === job) return s;
      const defaults = useJobHpDefaultsStore.getState().defaults;
      const roster = s.timeline.roster.map((slot, i) => {
        if (i !== slotIdx) return slot;
        // Re-seed HP from the Job HP default and clear the hand-tuned flag — a
        // job change is the one reset point. An `unset` slot carries no HP
        // (data-model invariant), so drop both fields.
        const { hp: _hp, hp_manual: _manual, ...rest } = slot;
        if (job === "unset") return { ...rest, job };
        return { ...rest, job, hp: resolveDefaultHp(job, defaults), hp_manual: false };
      }) as unknown as TimelineFile["roster"];
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
      // Empty/whitespace-only label clears the field (back to the job-code fallback).
      const trimmed =
        label !== undefined
          ? sanitizeSingleLineName(label).slice(0, MAX_NAME_LEN).trim()
          : undefined;
      const final = trimmed === "" ? undefined : trimmed;
      const roster = s.timeline.roster.map((slot, i) => {
        if (i !== slotIdx) return slot;
        // exactOptionalPropertyTypes: omit the key when label is undefined.
        if (final === undefined) {
          const { name_label: _drop, ...rest } = slot;
          return rest;
        }
        return { ...slot, name_label: final };
      }) as unknown as TimelineFile["roster"];
      return { timeline: touch({ ...s.timeline, roster }) };
    }),

  setSlotHp: (slotIdx, hp) =>
    set((s) => {
      if (!s.timeline) return s;
      const defaults = useJobHpDefaultsStore.getState().defaults;
      const roster = s.timeline.roster.map((slot, i) => {
        if (i !== slotIdx) return slot;
        const { hp: _hp, hp_manual: _manual, ...rest } = slot;
        const job = slot.job;
        if (hp === undefined) {
          // Reset gesture: clearing the input reverts a job-holding slot to its
          // Job HP default (default-derived). An `unset` slot drops HP entirely.
          if (job === "unset") return { ...rest, job };
          return { ...rest, job, hp: resolveDefaultHp(job, defaults), hp_manual: false };
        }
        // Hand-typed value: clamp inside the plausible FFXIV range and mark the
        // slot sticky. The UI surfaces the live-validation signal but the store
        // is the last line of defense.
        return { ...rest, job, hp: clampSlotHp(hp), hp_manual: true };
      }) as unknown as TimelineFile["roster"];
      return { timeline: touch({ ...s.timeline, roster }) };
    }),

  reorderSlot: (fromIdx, toIdx) =>
    set((s) => {
      if (!s.timeline) return s;
      const n = s.timeline.roster.length; // 8
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n) return s;

      const move = <T>(arr: readonly T[]): T[] => {
        const next = [...arr];
        const [m] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, m);
        return next;
      };

      const roster = move(s.timeline.roster) as unknown as TimelineFile["roster"];
      // Keep position-keyed observed damage aligned with the new order.
      const boss_ability_instances = s.timeline.boss_ability_instances.map((inst) =>
        inst.observed_damage.length === 0
          ? inst
          : {
              ...inst,
              observed_damage: inst.observed_damage.map((e) => ({
                ...e,
                damage_per_player: move(e.damage_per_player),
              })),
            },
      );
      return { timeline: touch({ ...s.timeline, roster, boss_ability_instances }) };
    }),

  applyJobDefaultsToRoster: () =>
    set((s) => {
      if (!s.timeline) return s;
      const defaults = useJobHpDefaultsStore.getState().defaults;
      const roster = s.timeline.roster.map((slot) => {
        // Skip hand-tuned and unset slots; re-seed only default-derived ones.
        if (slot.job === "unset" || slot.hp_manual) return slot;
        return { ...slot, hp: resolveDefaultHp(slot.job, defaults), hp_manual: false };
      }) as unknown as TimelineFile["roster"];
      return { timeline: touch({ ...s.timeline, roster }) };
    }),

  addBossAbilityType: (input) => {
    const id = crypto.randomUUID();
    const clippedName = sanitizeSingleLineName(input.name).slice(0, MAX_NAME_LEN).trim();
    if (clippedName === "") throw new EmptyNameError();
    const tl = useTimelineStore.getState().timeline;
    if (tl) {
      if (tl.boss_ability_types.length >= MAX_BOSS_ABILITY_TYPES) {
        throw new LimitExceededError("boss_ability_types", MAX_BOSS_ABILITY_TYPES);
      }
      const target = normalizeNameForCompare(clippedName);
      if (tl.boss_ability_types.some((t) => normalizeNameForCompare(t.name) === target)) {
        throw new DuplicateNameError(clippedName);
      }
    }
    set((s) => {
      if (!s.timeline) return s;
      const clamped = {
        ...input,
        name: clippedName,
        base_damage: clampBaseDamage(input.base_damage),
        ...(input.description !== undefined
          ? { description: sanitizeDescription(input.description).slice(0, MAX_DESC_LEN) }
          : {}),
      };
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: [...s.timeline.boss_ability_types, { ...clamped, id }],
        }),
      };
    });
    return id;
  },

  updateBossAbilityType: (id, patch) =>
    set((s) => {
      if (!s.timeline) return s;
      const clippedName =
        patch.name !== undefined
          ? sanitizeSingleLineName(patch.name).slice(0, MAX_NAME_LEN).trim()
          : undefined;
      if (clippedName !== undefined) {
        if (clippedName === "") throw new EmptyNameError();
        const target = normalizeNameForCompare(clippedName);
        if (
          s.timeline.boss_ability_types.some(
            (t) => t.id !== id && normalizeNameForCompare(t.name) === target,
          )
        ) {
          throw new DuplicateNameError(clippedName);
        }
      }
      const clampedPatch = {
        ...patch,
        ...(clippedName !== undefined ? { name: clippedName } : {}),
        ...(patch.base_damage !== undefined
          ? { base_damage: clampBaseDamage(patch.base_damage) }
          : {}),
        ...(patch.description !== undefined
          ? { description: sanitizeDescription(patch.description).slice(0, MAX_DESC_LEN) }
          : {}),
      };
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: s.timeline.boss_ability_types.map((t) =>
            t.id === id ? { ...t, ...clampedPatch } : t,
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
      const sel = s.selectedInstance;
      const clearSelection = sel?.kind === "boss" && cascadedIds.has(sel.id);
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_types: s.timeline.boss_ability_types.filter((t) => t.id !== id),
          // Cascade: removing a type also removes its instances.
          boss_ability_instances: s.timeline.boss_ability_instances.filter((i) => i.type_id !== id),
        }),
        ...(clearSelection ? { selectedInstance: null } : {}),
      };
    }),

  addBossAbilityInstance: (input) => {
    const id = crypto.randomUUID();
    const tl = useTimelineStore.getState().timeline;
    if (tl && tl.boss_ability_instances.length >= MAX_BOSS_ABILITY_INSTANCES) {
      throw new LimitExceededError("boss_ability_instances", MAX_BOSS_ABILITY_INSTANCES);
    }
    set((s) => {
      if (!s.timeline) return s;
      const instance: BossAbilityInstance = {
        ...input,
        id,
        no_full_heal_slot_ids: [],
        observed_damage: [],
      };
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
      const sel = s.selectedInstance;
      return {
        timeline: touch({
          ...s.timeline,
          boss_ability_instances: s.timeline.boss_ability_instances.filter((i) => i.id !== id),
        }),
        ...(sel?.kind === "boss" && sel.id === id ? { selectedInstance: null } : {}),
      };
    }),

  selectBossInstance: (id) => set({ selectedInstance: { kind: "boss", id } }),
  selectMitInstance: (id) => set({ selectedInstance: { kind: "mit", id } }),
  deselectInstance: () => set({ selectedInstance: null }),

  toggleChipNoFullHeal: (effectTime, slotId) =>
    set((s) => {
      if (!s.timeline) return s;
      const hitting = instancesHittingSlot(s.timeline, effectTime, slotId);
      if (hitting.length === 0) return s;
      // Merged state = any hitting instance already flags the slot (OR-merge).
      const merged = hitting.some((i) => i.no_full_heal_slot_ids.includes(slotId));
      return {
        timeline: applyChipFlag(s.timeline, hitting, slotId, !merged),
      };
    }),

  // The UI gates placement (hover ghost hides over occupied space) and
  // clamps drag against neighbors, so the store trusts callers to supply a
  // legal effect_time.
  // When the placed type has gated children in the library, this action also
  // auto-spawns them at the middle of each child's execution zone (one-shot;
  // never re-runs).
  addMitigationInstance: (input) => {
    const id = crypto.randomUUID();
    // Check against the cap including the child auto-spawn cost so a parent
    // placement that would push us past the limit fails up-front instead of
    // landing the parent alone.
    const tl = useTimelineStore.getState().timeline;
    if (tl) {
      const parentType = getMitById(input.type_id);
      const childCount = parentType
        ? getGatedChildrenOf(parentType.id).reduce((sum, c) => sum + Math.max(1, c.max_charges), 0)
        : 0;
      if (tl.mitigation_instances.length + 1 + childCount > MAX_MITIGATION_INSTANCES) {
        throw new LimitExceededError("mitigation_instances", MAX_MITIGATION_INSTANCES);
      }
    }
    set((s) => {
      if (!s.timeline) return s;
      const parent: MitigationInstance = { ...input, id, coverage_overrides: [] };
      const parentType = getMitById(parent.type_id);
      const children = parentType ? autoSpawnChildren(parent, parentType, s.timeline) : [];
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: [...s.timeline.mitigation_instances, parent, ...children],
        }),
      };
    });
    return id;
  },

  // When a parent's effect_time changes, all attached children move by the
  // same delta — they are offset-glued. Other patches do not cascade.
  updateMitigationInstance: (id, patch) =>
    set((s) => {
      if (!s.timeline) return s;
      const existing = s.timeline.mitigation_instances.find((m) => m.id === id);
      const delta =
        existing != null && patch.effect_time != null && patch.effect_time !== existing.effect_time
          ? patch.effect_time - existing.effect_time
          : 0;
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: s.timeline.mitigation_instances.map((m) => {
            if (m.id === id) return { ...m, ...patch };
            if (delta !== 0 && m.parent_instance_id === id) {
              return { ...m, effect_time: m.effect_time + delta };
            }
            return m;
          }),
        }),
      };
    }),

  // Removing a parent cascades to every instance with parent_instance_id === id.
  // No tombstone — pure removal.
  removeMitigationInstance: (id) =>
    set((s) => {
      if (!s.timeline) return s;
      const cascadedIds = new Set<string>([id]);
      for (const m of s.timeline.mitigation_instances) {
        if (m.parent_instance_id === id) cascadedIds.add(m.id);
      }
      const sel = s.selectedInstance;
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: s.timeline.mitigation_instances.filter(
            (m) => !cascadedIds.has(m.id),
          ),
        }),
        ...(sel?.kind === "mit" && cascadedIds.has(sel.id) ? { selectedInstance: null } : {}),
      };
    }),

  // Apply a precomputed batch of effect_time changes (optionally deleting one
  // instance) with NO parent→child cascade — the inverse of updateMitigationInstance's
  // gluing. The Simple view's gated-child re-anchor/remove uses this to move the
  // parent and its co-located children together as one recomputed stack
  // (restackGatedChildren). Canvas paths never call it. See simple-grid-placement.ts.
  applyGatedRestack: (updates, removeId) =>
    set((s) => {
      if (!s.timeline) return s;
      const byId = new Map(updates.map((u) => [u.id, u.effectTime]));
      const sel = s.selectedInstance;
      return {
        timeline: touch({
          ...s.timeline,
          mitigation_instances: s.timeline.mitigation_instances
            .filter((m) => m.id !== removeId)
            .map((m) => {
              const et = byId.get(m.id);
              return et != null ? { ...m, effect_time: et } : m;
            }),
        }),
        ...(removeId != null && sel?.kind === "mit" && sel.id === removeId
          ? { selectedInstance: null }
          : {}),
      };
    }),

  // ─── Phases ────────────────────────────────────────────────────────────
  // See docs/phases.md §5. The first ever addPhase materializes an implicit
  // Phase 1 at start_time:0 so the tile-the-fight invariant holds.

  addPhase: (input) => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) return;
    // First add seeds an implicit Phase 1 — so the effective post-add count is
    // (current === 0 ? 2 : current + 1).
    const projectedCount = tl.phases.length === 0 ? 2 : tl.phases.length + 1;
    if (projectedCount > MAX_PHASES) {
      throw new LimitExceededError("phases", MAX_PHASES);
    }
    const start = Math.round(input.start_time);
    const duration = tl.metadata.fight_duration_sec;
    if (!Number.isFinite(start) || start <= 0 || start >= duration) {
      throw new PhaseRejectedError(
        `Start time must be between 0 and ${duration - 1} seconds (exclusive).`,
      );
    }
    if (tl.phases.some((p) => p.start_time === start)) {
      throw new PhaseRejectedError("A phase already starts at that time.");
    }
    set((s) => {
      if (!s.timeline) return s;
      const trimmedName = sanitizeSingleLineName(input.name).slice(0, MAX_NAME_LEN).trim();
      // Fallback ordinal: the new phase will sit at position (current length + 1)
      // after the implicit-Phase-1 seed; first-add inserts both Phase 1 and the
      // user's phase, so the user's natural ordinal is 2 when length is 0.
      const fallback = `Phase ${Math.max(s.timeline.phases.length + 1, 2)}`;
      const incoming: Phase = {
        id: crypto.randomUUID(),
        start_time: start,
        name: trimmedName === "" ? fallback : trimmedName,
      };
      const seed: Phase[] =
        s.timeline.phases.length === 0
          ? [{ id: crypto.randomUUID(), start_time: 0, name: "Phase 1" }]
          : [...s.timeline.phases];
      const phases = [...seed, incoming].sort((a, b) => a.start_time - b.start_time);
      return { timeline: touch({ ...s.timeline, phases }) };
    });
  },

  renamePhase: (id, name) =>
    set((s) => {
      if (!s.timeline) return s;
      const trimmed = sanitizeSingleLineName(name).slice(0, MAX_NAME_LEN).trim();
      const idx = s.timeline.phases.findIndex((p) => p.id === id);
      if (idx < 0) return s;
      const final = trimmed === "" ? `Phase ${idx + 1}` : trimmed;
      return {
        timeline: touch({
          ...s.timeline,
          phases: s.timeline.phases.map((p) => (p.id === id ? { ...p, name: final } : p)),
        }),
      };
    }),

  setPhaseStartTime: (id, start_time) => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) return;
    const idx = tl.phases.findIndex((p) => p.id === id);
    if (idx < 0) return;
    if (idx === 0) {
      throw new PhaseRejectedError("The first phase is pinned to 0:00 and cannot be moved.");
    }
    const start = Math.round(start_time);
    const prev = tl.phases[idx - 1]?.start_time ?? 0;
    const next = tl.phases[idx + 1]?.start_time ?? tl.metadata.fight_duration_sec;
    if (!Number.isFinite(start) || start <= prev || start >= next) {
      throw new PhaseRejectedError(
        `Start time must be strictly between ${prev} and ${next} seconds.`,
      );
    }
    set((s) => {
      if (!s.timeline) return s;
      return {
        timeline: touch({
          ...s.timeline,
          phases: s.timeline.phases.map((p) => (p.id === id ? { ...p, start_time: start } : p)),
        }),
      };
    });
  },

  deletePhase: (id) =>
    set((s) => {
      if (!s.timeline) return s;
      const idx = s.timeline.phases.findIndex((p) => p.id === id);
      if (idx < 0) return s;
      // First phase cannot be deleted — its range is owned by whatever phase
      // boundary comes next, and there is no "previous" to merge it into.
      if (idx === 0) return s;
      // Going from 2 phases to 1 collapses to the empty-phases UI (there is
      // no such thing as a single user-added phase covering the whole fight).
      const remaining = s.timeline.phases.filter((p) => p.id !== id);
      const phases = remaining.length >= 2 ? remaining : [];
      return { timeline: touch({ ...s.timeline, phases }) };
    }),
}));

// Boss instances at `effectTime` that actually land a hit on `slotId` — the
// set whose no_full_heal_slot_ids the chip-toggle writes to. A chip exists for
// (time, slot) only when at least one such instance hits, so a toggle on a
// non-hitting (time, slot) is a no-op. Reuses the engine's coverage resolution
// (raidwide hits everyone; targeted/stack only listed slots).
function instancesHittingSlot(
  tl: TimelineFile,
  effectTime: number,
  slotId: string,
): BossAbilityInstance[] {
  const slotIdx = tl.roster.findIndex((sl) => sl.id === slotId);
  if (slotIdx < 0) return [];
  const typeById = new Map(tl.boss_ability_types.map((t) => [t.id, t]));
  return tl.boss_ability_instances.filter((inst) => {
    if (inst.effect_time !== effectTime) return false;
    const type = typeById.get(inst.type_id);
    if (!type) return false;
    return hitLandsOn(resolveHit(inst, type), slotIdx, tl.roster);
  });
}

// Write `value` for `slotId` into every instance in `hitting` (add when true,
// remove when false) and return the touched timeline. Other instances are
// untouched.
function applyChipFlag(
  tl: TimelineFile,
  hitting: readonly BossAbilityInstance[],
  slotId: string,
  value: boolean,
): TimelineFile {
  const hittingIds = new Set(hitting.map((i) => i.id));
  return touch({
    ...tl,
    boss_ability_instances: tl.boss_ability_instances.map((inst) => {
      if (!hittingIds.has(inst.id)) return inst;
      const has = inst.no_full_heal_slot_ids.includes(slotId);
      if (value === has) return inst;
      return {
        ...inst,
        no_full_heal_slot_ids: value
          ? [...inst.no_full_heal_slot_ids, slotId]
          : inst.no_full_heal_slot_ids.filter((id) => id !== slotId),
      };
    }),
  });
}

// Default positions for a child's N charges, anchored 2s after the parent's
// cast and stepped by the 2s gap of the SCH GCD floor. For
// N=1: [parent+2]. For N=2: [parent+2, parent+4]. The 2s offset separates the
// child icon from its parent on the canvas and lands the child on the parent's
// hit row in the Simple view. Exported for the inspector's re-add affordance.
export function defaultChildPositions(parentEffectTime: number, charges: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < charges; i++) {
    positions.push(parentEffectTime + 2 * (i + 1));
  }
  return positions;
}

// Build the child MitigationInstance records to materialize alongside a newly-
// placed parent. PCT special case: when a gated child also `consumes`
// its parent, run the gating pass with the new parent inserted; if the parent
// would already be absorbed before the default child position, skip that child.
// SCH special case: a multi-charge child whose charges overwrite each other
// (Consolation) spawns one charge per boss hit inside the parent's active zone
// [parent+2, parent+execZone], capped at max_charges — extra charges over empty
// stretches serve no purpose, and zero hits means no children at all.
function autoSpawnChildren(
  parent: MitigationInstance,
  parentType: import("@/domain/types").MitigationType,
  timeline: TimelineFile,
): MitigationInstance[] {
  const gatedChildren = getGatedChildrenOf(parent.type_id);
  if (gatedChildren.length === 0) return [];
  // Only need to compute parent absorbed_at if any child has `consumes`.
  let parentAbsorbedAt: number | null = null;
  if (gatedChildren.some((ct) => ct.consumes === parent.type_id)) {
    // The same gating pass the survival evaluation runs, but over the committed
    // mits plus the not-yet-committed parent — we only need the parent pool's
    // absorbed_at to decide whether its consuming child is worth spawning.
    const states = computeGatingStates(
      [...timeline.mitigation_instances, parent],
      timeline.boss_ability_instances,
      timeline.boss_ability_types,
      timeline.roster,
      getMitById,
    );
    parentAbsorbedAt = states.get(parent.id)?.absorbed_at ?? null;
  }
  const children: MitigationInstance[] = [];
  for (const childType of gatedChildren) {
    const positions = defaultChildPositions(parent.effect_time, childType.max_charges);
    if (
      childType.consumes === parent.type_id &&
      parentAbsorbedAt != null &&
      parentAbsorbedAt < positions[0]
    ) {
      continue;
    }
    // Multi-charge overwriting children: cap the spawn count to the boss hits in
    // the active zone (two Consolations overwrite, so one per hit is the most
    // that helps); zero hits → no children. Single-charge children are unaffected.
    let chargesToSpawn = childType.max_charges;
    if (childType.max_charges > 1) {
      const execZone = childType.execution_zone_seconds ?? parentType.duration_seconds;
      const zoneStart = parent.effect_time + 2;
      const zoneEnd = parent.effect_time + execZone;
      const hitsInZone = timeline.boss_ability_instances.filter(
        (b) => b.effect_time >= zoneStart && b.effect_time <= zoneEnd,
      ).length;
      chargesToSpawn = Math.min(childType.max_charges, hitsInZone);
    }
    for (let i = 0; i < chargesToSpawn; i++) {
      children.push({
        id: crypto.randomUUID(),
        type_id: childType.id,
        player_slot_id: parent.player_slot_id,
        effect_time: positions[i],
        target_slot_ids: [],
        charge_row: i,
        coverage_overrides: [],
        parent_instance_id: parent.id,
      });
    }
  }
  return children;
}
