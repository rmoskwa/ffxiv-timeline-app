import { beforeEach, describe, expect, it } from "vitest";
import { phaseOrdinalFor } from "@/domain/phases";
import type { BossTimelineFile, Job, MitigationInstance, Roster } from "@/domain/types";
import {
  MAX_BOSS_ABILITY_INSTANCES,
  MAX_BOSS_ABILITY_TYPES,
  MAX_DESC_LEN,
  MAX_MITIGATION_INSTANCES,
  MAX_NAME_LEN,
  MAX_PHASES,
  TIMELINE_SCHEMA_VERSION,
} from "@/domain/types";
import { isDocumentBoundary, useHistoryStore } from "./history-store";
import {
  EmptyNameError,
  LimitExceededError,
  PhaseRejectedError,
  useTimelineStore,
} from "./timeline-store";

const RAMPART = "drk.rampart"; // cooldown 90s, duration 20s

function freshTimeline() {
  useTimelineStore.getState().newTimeline("test");
  useTimelineStore.getState().setSlotJob(0, "DRK");
}

function freshTimelineForJob(job: Job) {
  useTimelineStore.getState().newTimeline("test");
  useTimelineStore.getState().setSlotJob(0, job);
}

function rosterSlotId(idx: number): string {
  const roster = useTimelineStore.getState().timeline?.roster as Roster;
  return roster[idx].id;
}

function mitsOfType(typeId: string): MitigationInstance[] {
  return (useTimelineStore.getState().timeline?.mitigation_instances ?? []).filter(
    (m) => m.type_id === typeId,
  );
}

// Seed a raidwide boss hit at `time` (unique type per call to dodge the
// duplicate-name guard). Used to populate a parent's active zone so multi-charge
// overwriting children (SCH Consolation) auto-spawn one charge per hit.
function addBossHitAt(time: number): void {
  const typeId = useTimelineStore.getState().addBossAbilityType({
    name: `Hit@${time}`,
    base_damage: 1000,
    damage_type: "magical",
    target_pattern: "raidwide",
    boss_targetable: true,
  });
  useTimelineStore.getState().addBossAbilityInstance({
    type_id: typeId,
    effect_time: time,
    target_slot_ids: [],
  });
}

describe("timeline-store — setFightDuration cascade", () => {
  beforeEach(freshTimeline);

  it("keeps a mit whose footprint extends past the new end as long as effect_time fits", () => {
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 50,
      target_slot_ids: [],
    });
    // 50 + 90 = 140 footprint, but effect_time=50 is within 60.
    useTimelineStore.getState().setFightDuration(60);
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(1);
  });

  it("drops a mit whose effect_time falls past the new end", () => {
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 100,
      target_slot_ids: [],
    });
    useTimelineStore.getState().setFightDuration(60);
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(0);
  });
});

describe("timeline-store — selection mutex", () => {
  beforeEach(freshTimeline);

  it("selecting a mit clears a prior boss selection", () => {
    useTimelineStore.getState().selectBossInstance("boss-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "boss", id: "boss-a" });
    useTimelineStore.getState().selectMitInstance("mit-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "mit", id: "mit-a" });
  });

  it("removing the selected mit clears selection", () => {
    const slotId = rosterSlotId(0);
    const m = useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectMitInstance(m);
    useTimelineStore.getState().removeMitigationInstance(m);
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("deselectInstance clears the field", () => {
    useTimelineStore.getState().selectMitInstance("x");
    useTimelineStore.getState().deselectInstance();
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("selecting a boss instance clears a prior mit selection", () => {
    useTimelineStore.getState().selectMitInstance("mit-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "mit", id: "mit-a" });
    useTimelineStore.getState().selectBossInstance("boss-a");
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "boss", id: "boss-a" });
  });

  it("deselectInstance on already-null selection is a no-op", () => {
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
    useTimelineStore.getState().deselectInstance();
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });
});

// ─── interaction storms ──────────────────────────────────────────────────
// Spam-add must mint unique IDs; the keyboard selection model must survive a
// no-selection Delete and an Esc with no selection.

describe("timeline-store — §7 spam add", () => {
  beforeEach(freshTimeline);

  it("mints unique IDs across rapid addBossAbilityInstance calls", () => {
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Spam Hit",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      ids.push(
        useTimelineStore.getState().addBossAbilityInstance({
          type_id: bossTypeId,
          effect_time: i,
          target_slot_ids: [],
        }),
      );
    }
    expect(new Set(ids).size).toBe(ids.length);
    // Survives in storage with the same uniqueness.
    const stored = useTimelineStore.getState().timeline?.boss_ability_instances ?? [];
    expect(new Set(stored.map((i) => i.id)).size).toBe(stored.length);
  });

  it("mints unique IDs across rapid addMitigationInstance calls", () => {
    const slotId = rosterSlotId(0);
    // RAMPART cooldown blocks legal placement at the same slot, but the store
    // trusts the caller (gating lives in MitSubLane.legalHoverSec). The point of
    // this test is the ID-mint guarantee, not the legality.
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(
        useTimelineStore.getState().addMitigationInstance({
          type_id: RAMPART,
          player_slot_id: slotId,
          effect_time: i * 100,
          target_slot_ids: [],
        }),
      );
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Gated-child behaviors ──────────────────────────────────────────────────
// Parent-placement auto-spawns gated children at the
// middle of each child's execution zone. Parent-delete cascades. Parent drag
// carries children by offset. The PCT pair has a special-case skip for
// pre-absorbed Tempera Coat.

describe("timeline-store — auto-spawn gated children", () => {
  it("Tempera Coat → spawns Grassa 2s after Coat's cast", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const grassa = mitsOfType("pct.tempera_grassa");
    expect(grassa).toHaveLength(1);
    // Single charge anchored 2s after the parent's cast.
    expect(grassa[0].effect_time).toBe(2);
    expect(grassa[0].parent_instance_id).toBe(mitsOfType("pct.tempera_coat")[0].id);
  });

  it("Summon Seraph → spawns Consolation #1 and #2 at +2 and +4 when 2 hits are in the zone", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    // Two hits inside the [2, 22] active zone → both charges spawn.
    addBossHitAt(5);
    addBossHitAt(15);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const consolations = mitsOfType("sch.consolation").sort(
      (a, b) => a.effect_time - b.effect_time,
    );
    expect(consolations).toHaveLength(2);
    // Anchored 2s after the cast, stepped by the 2s charge gap: 2 and 4.
    expect(consolations.map((c) => c.effect_time)).toEqual([2, 4]);
    expect(consolations.map((c) => c.charge_row)).toEqual([0, 1]);
  });

  it("Summon Seraph → spawns only one Consolation when a single hit is in the zone", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    addBossHitAt(10);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const consolations = mitsOfType("sch.consolation");
    expect(consolations).toHaveLength(1);
    expect(consolations[0].effect_time).toBe(2);
    expect(consolations[0].charge_row).toBe(0);
  });

  it("Summon Seraph → spawns no Consolations when no hit is in the zone", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    // Hits outside [2, 22]: one before the zone, one after.
    addBossHitAt(1);
    addBossHitAt(30);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    expect(mitsOfType("sch.consolation")).toHaveLength(0);
  });

  it("Neutral Sect → spawns Sun Sign 2s after the cast", () => {
    freshTimelineForJob("AST");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "ast.neutral_sect",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const sunSign = mitsOfType("ast.sun_sign");
    expect(sunSign).toHaveLength(1);
    // Single charge anchored 2s after the cast.
    expect(sunSign[0].effect_time).toBe(2);
  });

  it("Temperance → spawns Divine Caress 2s after the cast", () => {
    freshTimelineForJob("WHM");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "whm.temperance",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const dc = mitsOfType("whm.divine_caress");
    expect(dc).toHaveLength(1);
    // Single charge anchored 2s after the cast.
    expect(dc[0].effect_time).toBe(2);
  });

  it("PCT special case: Coat absorbed before default Grassa position skips auto-spawn", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    // Boss hit big enough to fully drain Coat's 20% max-HP barrier (20k @ default
    // PLAYER_MAX_HP=100k). Raidwide so the caster is targeted.
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Big Hit",
      base_damage: 50_000,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    useTimelineStore.getState().addBossAbilityInstance({
      type_id: bossTypeId,
      effect_time: 1, // absorbs Coat at t=1, before default Grassa at t=2
      target_slot_ids: [],
    });
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(0);
  });
});

// The Simple view's gated-child re-anchor/remove drives this: a precomputed
// batch of effect_times (restackGatedChildren) applied WITHOUT the parent→child
// glue, optionally deleting the moved-out child.
describe("timeline-store — applyGatedRestack", () => {
  function seedSeraph() {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    addBossHitAt(5);
    addBossHitAt(15);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
  }

  it("applies the batch without dragging unlisted children (no parent cascade)", () => {
    seedSeraph();
    const parent = mitsOfType("sch.summon_seraph")[0];
    const child = mitsOfType("sch.consolation")[0];
    const childTime = child.effect_time;
    // Move only the parent. updateMitigationInstance would offset-glue the child;
    // applyGatedRestack must leave it where it is.
    useTimelineStore.getState().applyGatedRestack([{ id: parent.id, effectTime: 10 }]);
    expect(mitsOfType("sch.summon_seraph")[0].effect_time).toBe(10);
    expect(mitsOfType("sch.consolation").find((c) => c.id === child.id)?.effect_time).toBe(
      childTime,
    );
  });

  it("removeId deletes the moved-out child and clears its selection", () => {
    seedSeraph();
    const parent = mitsOfType("sch.summon_seraph")[0];
    const [c1, c2] = mitsOfType("sch.consolation").sort((a, b) => a.effect_time - b.effect_time);
    useTimelineStore.getState().selectMitInstance(c1.id);
    useTimelineStore.getState().applyGatedRestack(
      [
        { id: parent.id, effectTime: 2 },
        { id: c2.id, effectTime: 4 },
      ],
      c1.id,
    );
    expect(mitsOfType("sch.consolation").map((c) => c.id)).toEqual([c2.id]);
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
    expect(mitsOfType("sch.summon_seraph")[0].effect_time).toBe(2);
    expect(mitsOfType("sch.consolation")[0].effect_time).toBe(4);
  });
});

describe("timeline-store — cascade delete of gated children", () => {
  it("removing Tempera Coat removes the auto-spawned Grassa", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const coatId = mitsOfType("pct.tempera_coat")[0].id;
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(1);
    useTimelineStore.getState().removeMitigationInstance(coatId);
    expect(mitsOfType("pct.tempera_coat")).toHaveLength(0);
    expect(mitsOfType("pct.tempera_grassa")).toHaveLength(0);
  });

  it("removing Summon Seraph cascade-removes both Consolations", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    addBossHitAt(5);
    addBossHitAt(15);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    expect(mitsOfType("sch.consolation")).toHaveLength(2);
    const seraphId = mitsOfType("sch.summon_seraph")[0].id;
    useTimelineStore.getState().removeMitigationInstance(seraphId);
    expect(mitsOfType("sch.consolation")).toHaveLength(0);
  });
});

describe("timeline-store — replaceBossTimeline", () => {
  function importPayload(overrides: Partial<BossTimelineFile> = {}): BossTimelineFile {
    return {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "Lindwurm",
      fight_duration_sec: 600,
      boss_ability_types: [
        {
          id: "imp-type-1",
          name: "Imported Sentence",
          base_damage: 100_000,
          damage_type: "magical",
          target_pattern: "raidwide",
          boss_targetable: true,
        },
      ],
      boss_ability_instances: [
        {
          id: "imp-inst-1",
          type_id: "imp-type-1",
          effect_time: 30,
          target_slot_ids: [],
          no_full_heal_slot_ids: [],
          observed_damage: [],
        },
        {
          id: "imp-inst-2",
          type_id: "imp-type-1",
          effect_time: 90,
          target_slot_ids: [],
          no_full_heal_slot_ids: [],
          observed_damage: [],
        },
      ],
      phases: [],
      ...overrides,
    };
  }

  it("replaces boss types and instances", () => {
    freshTimeline();
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Old Hit",
      base_damage: 50_000,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    useTimelineStore
      .getState()
      .addBossAbilityInstance({ type_id: bossTypeId, effect_time: 10, target_slot_ids: [] });
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    const tl = useTimelineStore.getState().timeline;
    expect(tl?.boss_ability_types.map((t) => t.id)).toEqual(["imp-type-1"]);
    expect(tl?.boss_ability_instances.map((i) => i.id).sort()).toEqual([
      "imp-inst-1",
      "imp-inst-2",
    ]);
  });

  it("wipes mitigation instances", () => {
    freshTimeline();
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 5,
      target_slot_ids: [],
    });
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(1);
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toEqual([]);
  });

  it("extends fight_duration_sec upward, never shrinks", () => {
    freshTimeline();
    // Default fight length is 600s; the importPayload max effect_time is 90s,
    // so duration should stay at 600.
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.metadata.fight_duration_sec).toBe(600);

    // Now an import that exceeds the current duration → extends.
    useTimelineStore.getState().setFightDuration(60);
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().timeline?.metadata.fight_duration_sec).toBe(90);
  });

  it("clears selectedInstance", () => {
    freshTimeline();
    const slotId = rosterSlotId(0);
    const mitId = useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectMitInstance(mitId);
    expect(useTimelineStore.getState().selectedInstance).not.toBeNull();
    useTimelineStore.getState().replaceBossTimeline(importPayload());
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });

  it("updates metadata.boss_name from the import", () => {
    freshTimeline();
    useTimelineStore.getState().setBossName("OriginalBoss");
    useTimelineStore.getState().replaceBossTimeline(importPayload({ boss_name: "NewBoss" }));
    expect(useTimelineStore.getState().timeline?.metadata.boss_name).toBe("NewBoss");
  });

  it("caps fight_duration_sec at MAX_FIGHT_DURATION_SEC and drops out-of-bounds instances", () => {
    freshTimeline();
    useTimelineStore.getState().replaceBossTimeline(
      importPayload({
        fight_duration_sec: 99_999,
        boss_ability_instances: [
          {
            id: "in-range",
            type_id: "imp-type-1",
            effect_time: 1000,
            target_slot_ids: [],
            no_full_heal_slot_ids: [],
            observed_damage: [],
          },
          {
            id: "at-cap",
            type_id: "imp-type-1",
            effect_time: 1800,
            target_slot_ids: [],
            no_full_heal_slot_ids: [],
            observed_damage: [],
          },
          {
            id: "past-cap",
            type_id: "imp-type-1",
            effect_time: 5000,
            target_slot_ids: [],
            no_full_heal_slot_ids: [],
            observed_damage: [],
          },
        ],
      }),
    );
    const tl = useTimelineStore.getState().timeline;
    expect(tl?.metadata.fight_duration_sec).toBe(1800);
    expect(tl?.boss_ability_instances.map((i) => i.id).sort()).toEqual(["at-cap", "in-range"]);
  });

  it("collapses imported phases to [] when culling leaves fewer than 2 inside the cap", () => {
    freshTimeline();
    useTimelineStore.getState().replaceBossTimeline(
      importPayload({
        fight_duration_sec: 99_999,
        boss_ability_instances: [],
        phases: [
          { id: "p1", start_time: 0, name: "Imported 1" },
          { id: "p2", start_time: 5000, name: "Past cap" },
        ],
      }),
    );
    expect(useTimelineStore.getState().timeline?.phases).toEqual([]);
  });
});

describe("timeline-store — offset-glued parent drag", () => {
  it("dragging Coat by +10s shifts the attached Grassa by +10s", () => {
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 10,
      target_slot_ids: [],
    });
    const coatId = mitsOfType("pct.tempera_coat")[0].id;
    expect(mitsOfType("pct.tempera_grassa")[0].effect_time).toBe(12); // 10 + 2
    useTimelineStore.getState().updateMitigationInstance(coatId, { effect_time: 20 });
    expect(mitsOfType("pct.tempera_coat")[0].effect_time).toBe(20);
    expect(mitsOfType("pct.tempera_grassa")[0].effect_time).toBe(22); // shifted +10
  });

  it("non-effect_time patches do not cascade to children", () => {
    freshTimelineForJob("SCH");
    const slotId = rosterSlotId(0);
    addBossHitAt(5);
    addBossHitAt(15);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "sch.summon_seraph",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const seraphId = mitsOfType("sch.summon_seraph")[0].id;
    const before = mitsOfType("sch.consolation").map((c) => c.effect_time);
    useTimelineStore.getState().updateMitigationInstance(seraphId, { target_slot_ids: [slotId] });
    const after = mitsOfType("sch.consolation").map((c) => c.effect_time);
    expect(after).toEqual(before);
  });
});

// ─── Phases ─────────────────────────────────────────────────────────────────
// docs/phases.md §5 / §8.

function phases() {
  return useTimelineStore.getState().timeline?.phases ?? [];
}

describe("timeline-store — phases", () => {
  beforeEach(() => {
    useTimelineStore.getState().newTimeline("phases-test");
  });

  it("starts with no phases (UI hidden)", () => {
    expect(phases()).toEqual([]);
  });

  it("first addPhase materializes implicit Phase 1 at 0", () => {
    useTimelineStore.getState().addPhase({ start_time: 105, name: "Adds" });
    const got = phases();
    expect(got).toHaveLength(2);
    expect(got[0].start_time).toBe(0);
    expect(got[0].name).toBe("Phase 1");
    expect(got[1].start_time).toBe(105);
    expect(got[1].name).toBe("Adds");
  });

  it("addPhase rejects start_time at the boundary or outside the fight", () => {
    expect(() => useTimelineStore.getState().addPhase({ start_time: 0, name: "x" })).toThrow(
      PhaseRejectedError,
    );
    const duration = useTimelineStore.getState().timeline?.metadata.fight_duration_sec ?? 0;
    expect(() => useTimelineStore.getState().addPhase({ start_time: duration, name: "x" })).toThrow(
      PhaseRejectedError,
    );
  });

  it("addPhase rejects a duplicate boundary", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    expect(() => useTimelineStore.getState().addPhase({ start_time: 100, name: "B" })).toThrow(
      PhaseRejectedError,
    );
  });

  it("addPhase keeps the phases sorted by start_time", () => {
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 300, name: "C" });
    expect(phases().map((p) => p.start_time)).toEqual([0, 100, 200, 300]);
  });

  it("renamePhase updates only the name", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "Adds" });
    const id = phases()[1].id;
    useTimelineStore.getState().renamePhase(id, "Heat 2");
    expect(phases()[1].name).toBe("Heat 2");
    expect(phases()[1].start_time).toBe(100);
  });

  it("setPhaseStartTime accepts a value strictly between neighbors", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    const aId = phases()[1].id;
    useTimelineStore.getState().setPhaseStartTime(aId, 150);
    expect(phases()[1].start_time).toBe(150);
  });

  it("setPhaseStartTime rejects values that meet or cross a neighbor", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    const aId = phases()[1].id;
    expect(() => useTimelineStore.getState().setPhaseStartTime(aId, 0)).toThrow(PhaseRejectedError);
    expect(() => useTimelineStore.getState().setPhaseStartTime(aId, 200)).toThrow(
      PhaseRejectedError,
    );
  });

  it("setPhaseStartTime refuses to move the first phase off 0", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    const firstId = phases()[0].id;
    expect(() => useTimelineStore.getState().setPhaseStartTime(firstId, 30)).toThrow(
      PhaseRejectedError,
    );
  });

  it("deletePhase on the first phase is a no-op", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    const before = phases();
    useTimelineStore.getState().deletePhase(before[0].id);
    expect(phases()).toEqual(before);
  });

  it("deletePhase removes a middle phase and merges its range into the previous", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    const middleId = phases()[1].id;
    useTimelineStore.getState().deletePhase(middleId);
    expect(phases().map((p) => p.start_time)).toEqual([0, 200]);
  });

  it("deletePhase from 2 → 1 collapses back to empty (phase UI hides)", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    expect(phases()).toHaveLength(2);
    useTimelineStore.getState().deletePhase(phases()[1].id);
    expect(phases()).toEqual([]);
  });

  it("setFightDuration drops phases past the new end and collapses survivors", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    useTimelineStore.getState().addPhase({ start_time: 200, name: "B" });
    useTimelineStore.getState().addPhase({ start_time: 300, name: "C" });
    useTimelineStore.getState().setFightDuration(250);
    expect(phases().map((p) => p.start_time)).toEqual([0, 100, 200]);
  });

  it("setFightDuration that leaves only the implicit Phase 1 clears phases entirely", () => {
    useTimelineStore.getState().addPhase({ start_time: 200, name: "A" });
    useTimelineStore.getState().setFightDuration(100);
    expect(phases()).toEqual([]);
  });

  it("replaceBossTimeline replaces phases with imported list", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "Existing" });
    const imported: BossTimelineFile = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "New",
      fight_duration_sec: 400,
      boss_ability_types: [],
      boss_ability_instances: [],
      phases: [
        { id: "p1", start_time: 0, name: "Imported 1" },
        { id: "p2", start_time: 220, name: "Imported 2" },
      ],
    };
    useTimelineStore.getState().replaceBossTimeline(imported);
    expect(phases().map((p) => p.name)).toEqual(["Imported 1", "Imported 2"]);
  });

  it("replaceBossTimeline with empty phases clears the recipient's phases", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "A" });
    const imported: BossTimelineFile = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "New",
      fight_duration_sec: 400,
      boss_ability_types: [],
      boss_ability_instances: [],
      phases: [],
    };
    useTimelineStore.getState().replaceBossTimeline(imported);
    expect(phases()).toEqual([]);
  });
});

describe("timeline-store — setName length cap", () => {
  beforeEach(freshTimeline);

  it("truncates a pasted name to MAX_NAME_LEN", () => {
    const huge = "x".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().setName(huge);
    expect(useTimelineStore.getState().timeline?.metadata.name.length).toBe(MAX_NAME_LEN);
  });

  it("leaves a name at exactly MAX_NAME_LEN untouched", () => {
    const exact = "y".repeat(MAX_NAME_LEN);
    useTimelineStore.getState().setName(exact);
    expect(useTimelineStore.getState().timeline?.metadata.name).toBe(exact);
  });

  it("truncates a pasted boss_name to MAX_NAME_LEN", () => {
    const huge = "b".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().setBossName(huge);
    expect(useTimelineStore.getState().timeline?.metadata.boss_name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates addBossAbilityType name to MAX_NAME_LEN", () => {
    const huge = "a".repeat(MAX_NAME_LEN + 500);
    const id = useTimelineStore.getState().addBossAbilityType({
      name: huge,
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const type = useTimelineStore.getState().timeline?.boss_ability_types.find((t) => t.id === id);
    expect(type?.name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates updateBossAbilityType name to MAX_NAME_LEN", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "short",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const huge = "c".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().updateBossAbilityType(id, { name: huge });
    const type = useTimelineStore.getState().timeline?.boss_ability_types.find((t) => t.id === id);
    expect(type?.name.length).toBe(MAX_NAME_LEN);
  });

  it("detects duplicate type names after truncation collapses them", () => {
    const baseName = "Death".padEnd(MAX_NAME_LEN, "x"); // exactly MAX_NAME_LEN chars
    useTimelineStore.getState().addBossAbilityType({
      name: baseName,
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    // Different input, same truncated form → must collide
    const longer = `${baseName}yyyyy`;
    expect(() =>
      useTimelineStore.getState().addBossAbilityType({
        name: longer,
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      }),
    ).toThrowError(/Death/);
  });

  it("truncates type description to MAX_DESC_LEN on add", () => {
    const huge = "d".repeat(MAX_DESC_LEN + 500);
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "with-desc",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
      description: huge,
    });
    const type = useTimelineStore.getState().timeline?.boss_ability_types.find((t) => t.id === id);
    expect(type?.description?.length).toBe(MAX_DESC_LEN);
  });

  it("truncates type description to MAX_DESC_LEN on update", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "edit-desc",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const huge = "e".repeat(MAX_DESC_LEN + 500);
    useTimelineStore.getState().updateBossAbilityType(id, { description: huge });
    const type = useTimelineStore.getState().timeline?.boss_ability_types.find((t) => t.id === id);
    expect(type?.description?.length).toBe(MAX_DESC_LEN);
  });

  it("truncates addPhase name to MAX_NAME_LEN", () => {
    const huge = "p".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().addPhase({ start_time: 100, name: huge });
    const phases = useTimelineStore.getState().timeline?.phases ?? [];
    const added = phases.find((p) => p.start_time === 100);
    expect(added?.name.length).toBe(MAX_NAME_LEN);
  });

  it("truncates setSlotLabel to MAX_NAME_LEN", () => {
    const huge = "s".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().setSlotLabel(0, huge);
    const slot = useTimelineStore.getState().timeline?.roster[0];
    expect(slot?.name_label?.length).toBe(MAX_NAME_LEN);
  });

  it("truncates renamePhase name to MAX_NAME_LEN", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "short" });
    const phaseId = useTimelineStore
      .getState()
      .timeline?.phases.find((p) => p.start_time === 100)?.id;
    const huge = "r".repeat(MAX_NAME_LEN + 500);
    useTimelineStore.getState().renamePhase(phaseId ?? "", huge);
    const phase = useTimelineStore.getState().timeline?.phases.find((p) => p.id === phaseId);
    expect(phase?.name.length).toBe(MAX_NAME_LEN);
  });

  it("addBossAbilityType rejects a whitespace-only name", () => {
    expect(() =>
      useTimelineStore.getState().addBossAbilityType({
        name: "   \t  ",
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      }),
    ).toThrowError(EmptyNameError);
  });

  it("updateBossAbilityType rejects a whitespace-only name", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "real",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    expect(() =>
      useTimelineStore.getState().updateBossAbilityType(id, { name: "   " }),
    ).toThrowError(EmptyNameError);
  });

  it("renamePhase falls back to 'Phase N' when given whitespace", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "Initial" });
    const phaseId = useTimelineStore
      .getState()
      .timeline?.phases.find((p) => p.start_time === 100)?.id;
    useTimelineStore.getState().renamePhase(phaseId ?? "", "   ");
    const phase = useTimelineStore.getState().timeline?.phases.find((p) => p.id === phaseId);
    expect(phase?.name).toMatch(/^Phase \d+$/);
  });

  it("addPhase falls back to 'Phase N' when given whitespace", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "   " });
    const phase = useTimelineStore.getState().timeline?.phases.find((p) => p.start_time === 100);
    expect(phase?.name).toMatch(/^Phase \d+$/);
  });

  it("setSlotLabel clears the label when given whitespace", () => {
    useTimelineStore.getState().setSlotLabel(0, "Real Label");
    expect(useTimelineStore.getState().timeline?.roster[0].name_label).toBe("Real Label");
    useTimelineStore.getState().setSlotLabel(0, "   ");
    expect(useTimelineStore.getState().timeline?.roster[0].name_label).toBeUndefined();
  });

  it("preserves newlines inside a description (only the length is capped)", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "multiline",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
      description: "line 1\nline 2\nline 3",
    });
    const type = useTimelineStore.getState().timeline?.boss_ability_types.find((t) => t.id === id);
    expect(type?.description).toBe("line 1\nline 2\nline 3");
  });
});

describe("timeline-store — dangerous unicode sanitization", () => {
  beforeEach(freshTimeline);

  it("strips an RLO inside a pasted boss_name", () => {
    // U+202E RLO would flip rendering direction; must not survive into storage.
    useTimelineStore.getState().setBossName("Boss‮Name");
    expect(useTimelineStore.getState().timeline?.metadata.boss_name).toBe("BossName");
  });

  it("strips a BOM and zero-width space inside a fight name", () => {
    useTimelineStore.getState().setName("﻿My​Fight");
    expect(useTimelineStore.getState().timeline?.metadata.name).toBe("MyFight");
  });

  it("converts NBSP inside a type name to a regular space", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "Death Sentence",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const t = useTimelineStore.getState().timeline?.boss_ability_types.find((x) => x.id === id);
    expect(t?.name).toBe("Death Sentence");
  });

  it("rejects an NBSP-padded duplicate of an existing type name", () => {
    useTimelineStore.getState().addBossAbilityType({
      name: "Death Sentence",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    // "Death Sentence" must collide with "Death Sentence"
    expect(() =>
      useTimelineStore.getState().addBossAbilityType({
        name: "Death Sentence",
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      }),
    ).toThrowError(/already exists/i);
  });

  it("rejects a ZWJ-padded duplicate of an existing type name", () => {
    useTimelineStore.getState().addBossAbilityType({
      name: "DeathSentence",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    expect(() =>
      useTimelineStore.getState().addBossAbilityType({
        name: "Death‍Sentence",
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      }),
    ).toThrowError(/already exists/i);
  });

  it("strips C0 controls from a type name on add", () => {
    const id = useTimelineStore.getState().addBossAbilityType({
      name: "BossName",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const t = useTimelineStore.getState().timeline?.boss_ability_types.find((x) => x.id === id);
    expect(t?.name).toBe("BossName");
  });

  it("preserves a ZWJ inside an emoji family in a phase name", () => {
    // Family emoji: 👨‍👩‍👧‍👦 — must survive intact
    const family = "Phase \u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
    useTimelineStore.getState().addPhase({ start_time: 100, name: family });
    const phase = useTimelineStore.getState().timeline?.phases.find((p) => p.start_time === 100);
    expect(phase?.name).toBe(family);
  });
});

describe("timeline-store — quantity caps", () => {
  beforeEach(freshTimeline);

  it("rejects addBossAbilityType past MAX_BOSS_ABILITY_TYPES", () => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) throw new Error("no timeline");
    // Seed the array up to the cap directly to keep the test cheap.
    useTimelineStore.setState({
      timeline: {
        ...tl,
        boss_ability_types: Array.from({ length: MAX_BOSS_ABILITY_TYPES }, (_, i) => ({
          id: `t${i}`,
          name: `T${i}`,
          base_damage: 0,
          damage_type: "magical",
          target_pattern: "raidwide",
          boss_targetable: true,
        })),
      },
    });
    expect(() =>
      useTimelineStore.getState().addBossAbilityType({
        name: "One Too Many",
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      }),
    ).toThrow(LimitExceededError);
  });

  it("rejects addBossAbilityInstance past MAX_BOSS_ABILITY_INSTANCES", () => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) throw new Error("no timeline");
    useTimelineStore.setState({
      timeline: {
        ...tl,
        boss_ability_types: [
          {
            id: "t0",
            name: "T0",
            base_damage: 0,
            damage_type: "magical",
            target_pattern: "raidwide",
            boss_targetable: true,
          },
        ],
        boss_ability_instances: Array.from({ length: MAX_BOSS_ABILITY_INSTANCES }, (_, i) => ({
          id: `i${i}`,
          type_id: "t0",
          effect_time: i,
          target_slot_ids: [],
          no_full_heal_slot_ids: [],
          observed_damage: [],
        })),
      },
    });
    expect(() =>
      useTimelineStore.getState().addBossAbilityInstance({
        type_id: "t0",
        effect_time: 0,
        target_slot_ids: [],
      }),
    ).toThrow(LimitExceededError);
  });

  it("rejects addMitigationInstance past MAX_MITIGATION_INSTANCES", () => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) throw new Error("no timeline");
    const slotId = rosterSlotId(0);
    useTimelineStore.setState({
      timeline: {
        ...tl,
        mitigation_instances: Array.from({ length: MAX_MITIGATION_INSTANCES }, (_, i) => ({
          id: `m${i}`,
          type_id: RAMPART,
          player_slot_id: slotId,
          effect_time: i,
          target_slot_ids: [],
          coverage_overrides: [],
        })),
      },
    });
    expect(() =>
      useTimelineStore.getState().addMitigationInstance({
        type_id: RAMPART,
        player_slot_id: slotId,
        effect_time: 0,
        target_slot_ids: [],
      }),
    ).toThrow(LimitExceededError);
  });

  it("rejects addPhase past MAX_PHASES", () => {
    // First addPhase seeds an implicit Phase 1, so MAX_PHASES - 1 adds reach
    // the cap and the next throws.
    const store = useTimelineStore.getState();
    for (let i = 1; i < MAX_PHASES; i++) {
      store.addPhase({ start_time: i, name: `Phase ${i + 1}` });
    }
    expect(useTimelineStore.getState().timeline?.phases).toHaveLength(MAX_PHASES);
    expect(() => store.addPhase({ start_time: MAX_PHASES + 1, name: "overflow" })).toThrow(
      LimitExceededError,
    );
  });

  it("replaceBossTimeline rejects payloads past any cap", () => {
    const oversizedTypes: BossTimelineFile = {
      schema_version: TIMELINE_SCHEMA_VERSION,
      kind: "boss_timeline",
      boss_name: "B",
      fight_duration_sec: 600,
      boss_ability_types: Array.from({ length: MAX_BOSS_ABILITY_TYPES + 1 }, (_, i) => ({
        id: `t${i}`,
        name: `T${i}`,
        base_damage: 0,
        damage_type: "magical",
        target_pattern: "raidwide",
        boss_targetable: true,
      })),
      boss_ability_instances: [],
      phases: [],
    };
    expect(() => useTimelineStore.getState().replaceBossTimeline(oversizedTypes)).toThrow(
      LimitExceededError,
    );
  });
});

// ─── State-coupling cascades (stress-test plan §5) ──────────────────────────
// Per CONTEXT.md the boss timeline anchors mits — re-import wipes them; trimming
// fight_duration_sec culls instances past the cut; deleting a type cascades to
// its instances; offset-glued children follow parent drags. These tests pin the
// invariants when many records sit on either side of the boundary.

describe("timeline-store — §5.1 trim fight_duration with many records", () => {
  beforeEach(freshTimeline);

  it("drops every boss instance past the cut and keeps every one at or before", () => {
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Pulse",
      base_damage: 10_000,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    // 500 instances spread 0..499s; 1300 above the cut at the cap is impractical
    // so we sit comfortably under MAX_BOSS_ABILITY_INSTANCES (1000).
    for (let t = 0; t < 500; t++) {
      useTimelineStore.getState().addBossAbilityInstance({
        type_id: bossTypeId,
        effect_time: t,
        target_slot_ids: [],
      });
    }
    useTimelineStore.getState().setFightDuration(60);
    const survivors = useTimelineStore.getState().timeline?.boss_ability_instances ?? [];
    expect(survivors).toHaveLength(61); // 0..60 inclusive
    expect(survivors.every((i) => i.effect_time <= 60)).toBe(true);
    expect(survivors.some((i) => i.effect_time === 60)).toBe(true);
  });

  it("drops mits whose effect_time is past the cut, regardless of footprint", () => {
    const slotId = rosterSlotId(0);
    // 50 mits, every 5s up to 245s. With Rampart's 90s cooldown, the last
    // surviving placement at 60 has a footprint reaching to 150 — well past
    // the new end. setFightDuration must keep it (footprint may overflow,
    // effect_time may not).
    for (let t = 0; t <= 245; t += 5) {
      useTimelineStore.setState((s) => {
        if (!s.timeline) return s;
        return {
          timeline: {
            ...s.timeline,
            mitigation_instances: [
              ...s.timeline.mitigation_instances,
              {
                id: `m-${t}`,
                type_id: RAMPART,
                player_slot_id: slotId,
                effect_time: t,
                target_slot_ids: [],
                coverage_overrides: [],
              },
            ],
          },
        };
      });
    }
    expect(useTimelineStore.getState().timeline?.mitigation_instances).toHaveLength(50);
    useTimelineStore.getState().setFightDuration(60);
    const survivors = useTimelineStore.getState().timeline?.mitigation_instances ?? [];
    // 0,5,10,15,20,25,30,35,40,45,50,55,60 = 13 placements at effect_time <= 60
    expect(survivors).toHaveLength(13);
    expect(survivors.every((m) => m.effect_time <= 60)).toBe(true);
  });

  it("clears a stale selection when the trimmed cut removes the selected instance", () => {
    const bossTypeId = useTimelineStore.getState().addBossAbilityType({
      name: "Pulse",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const instId = useTimelineStore.getState().addBossAbilityInstance({
      type_id: bossTypeId,
      effect_time: 120,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectBossInstance(instId);
    useTimelineStore.getState().setFightDuration(60);
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });
});

describe("timeline-store — §5.2 delete type cascades but preserves mits", () => {
  beforeEach(freshTimeline);

  it("removing a type drops every instance referencing it; mits untouched", () => {
    const slotId = rosterSlotId(0);
    const doomedType = useTimelineStore.getState().addBossAbilityType({
      name: "Doomed",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const survivorType = useTimelineStore.getState().addBossAbilityType({
      name: "Survivor",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    for (let t = 0; t < 200; t++) {
      useTimelineStore.getState().addBossAbilityInstance({
        type_id: doomedType,
        effect_time: t,
        target_slot_ids: [],
      });
    }
    useTimelineStore.getState().addBossAbilityInstance({
      type_id: survivorType,
      effect_time: 500,
      target_slot_ids: [],
    });
    // Mit placed independently of any boss type — must survive the cascade.
    useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: slotId,
      effect_time: 30,
      target_slot_ids: [],
    });
    useTimelineStore.getState().removeBossAbilityType(doomedType);
    const tl = useTimelineStore.getState().timeline;
    expect(tl?.boss_ability_types.map((t) => t.id)).toEqual([survivorType]);
    expect(tl?.boss_ability_instances).toHaveLength(1);
    expect(tl?.boss_ability_instances[0].type_id).toBe(survivorType);
    // Mits are not tied to boss types, so the count is unchanged.
    expect(tl?.mitigation_instances).toHaveLength(1);
  });

  it("clears a selection that pointed at one of the cascaded instances", () => {
    const doomedType = useTimelineStore.getState().addBossAbilityType({
      name: "Doomed",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const instId = useTimelineStore.getState().addBossAbilityInstance({
      type_id: doomedType,
      effect_time: 10,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectBossInstance(instId);
    useTimelineStore.getState().removeBossAbilityType(doomedType);
    expect(useTimelineStore.getState().selectedInstance).toBeNull();
  });
});

describe("timeline-store — §5.3 phase boundary collision (next phase claims it)", () => {
  // The domain rule in phaseOrdinalFor (`effect_time < phases[i].start_time`)
  // is unit-tested in phases.test.ts. This test confirms the same rule holds
  // when a boss instance lands on the exact start_time of a user-added phase.
  beforeEach(freshTimeline);

  it("a boss instance at effect_time === phase.start_time lives in the new phase", () => {
    useTimelineStore.getState().addPhase({ start_time: 100, name: "Adds" });
    const typeId = useTimelineStore.getState().addBossAbilityType({
      name: "Tower",
      base_damage: 0,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    useTimelineStore.getState().addBossAbilityInstance({
      type_id: typeId,
      effect_time: 100,
      target_slot_ids: [],
    });
    const tl = useTimelineStore.getState().timeline;
    expect(tl?.boss_ability_instances).toHaveLength(1);
    // Phase ordinal lookup: t=100 sits in the second phase (the Adds phase),
    // not the implicit Phase 1.
    expect(phaseOrdinalFor(100, tl?.phases ?? [])).toBe(2);
    expect(phaseOrdinalFor(99, tl?.phases ?? [])).toBe(1);
  });
});

describe("timeline-store — §5.7 offset-glue preserves child zone membership", () => {
  it("dragging Sun Sign's parent to t=0 keeps the child inside the new exec zone", () => {
    freshTimelineForJob("AST");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "ast.neutral_sect",
      player_slot_id: slotId,
      effect_time: 200,
      target_slot_ids: [],
    });
    const parentId = mitsOfType("ast.neutral_sect")[0].id;
    // Default Sun Sign auto-spawn position: parent + 2.
    const before = mitsOfType("ast.sun_sign")[0];
    expect(before.effect_time).toBe(202);
    // Drag the parent all the way to 0. The child must move by the same delta.
    useTimelineStore.getState().updateMitigationInstance(parentId, { effect_time: 0 });
    const after = mitsOfType("ast.sun_sign")[0];
    expect(after.effect_time).toBe(2);
    // Zone membership preserved: child sits at parent+2 inside parent..parent+30.
    const parentNow = mitsOfType("ast.neutral_sect")[0];
    expect(after.effect_time).toBeGreaterThan(parentNow.effect_time);
    expect(after.effect_time).toBeLessThan(parentNow.effect_time + 30);
  });

  it("dragging the parent past fight_duration is not a store concern (UI clamps)", () => {
    // The store accepts whatever UI MitBar.tsx delivers; offset-glue is pure.
    // Pinned here so a future refactor doesn't accidentally start clamping in
    // the store — UI is the right place because clamp inputs (px/sec, lane
    // width, neighbor footprints) are view-layer concerns.
    freshTimelineForJob("PCT");
    const slotId = rosterSlotId(0);
    useTimelineStore.getState().addMitigationInstance({
      type_id: "pct.tempera_coat",
      player_slot_id: slotId,
      effect_time: 0,
      target_slot_ids: [],
    });
    const coatId = mitsOfType("pct.tempera_coat")[0].id;
    // Set parent to 10_000 — silly value, but the store should not silently
    // discard it: clamping is the UI's job at the drag boundary.
    useTimelineStore.getState().updateMitigationInstance(coatId, { effect_time: 10_000 });
    const grassa = mitsOfType("pct.tempera_grassa")[0];
    // Child rides the same delta (10_000); the rendering layer is what would
    // hide it past the lane edge.
    expect(grassa.effect_time).toBe(10_002);
  });
});

describe("timeline-store — Full heal flag (toggleChipNoFullHeal)", () => {
  beforeEach(freshTimeline);

  // Raidwide hit at `time`; unique type per call to dodge the duplicate-name guard.
  function addRaidwideAt(time: number): string {
    const typeId = useTimelineStore.getState().addBossAbilityType({
      name: `RW@${time}-${Math.random()}`,
      base_damage: 50_000,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    return useTimelineStore.getState().addBossAbilityInstance({
      type_id: typeId,
      effect_time: time,
      target_slot_ids: [],
    });
  }

  function flagsOf(instId: string): string[] {
    return (
      useTimelineStore.getState().timeline?.boss_ability_instances.find((i) => i.id === instId)
        ?.no_full_heal_slot_ids ?? []
    );
  }

  it("toggle marks then clears the slot on the hitting raidwide instance", () => {
    const s0 = rosterSlotId(0);
    const instId = addRaidwideAt(10);
    useTimelineStore.getState().toggleChipNoFullHeal(10, s0);
    expect(flagsOf(instId)).toEqual([s0]);
    useTimelineStore.getState().toggleChipNoFullHeal(10, s0);
    expect(flagsOf(instId)).toEqual([]);
  });

  it("a targeted hit only accepts the toggle on a slot it actually hits", () => {
    const s0 = rosterSlotId(0);
    const s2 = rosterSlotId(2);
    const typeId = useTimelineStore.getState().addBossAbilityType({
      name: "TB",
      base_damage: 80_000,
      damage_type: "physical",
      target_pattern: "targeted",
      boss_targetable: true,
    });
    const instId = useTimelineStore.getState().addBossAbilityInstance({
      type_id: typeId,
      effect_time: 20,
      target_slot_ids: [s0],
    });
    // s2 isn't hit → no-op.
    useTimelineStore.getState().toggleChipNoFullHeal(20, s2);
    expect(flagsOf(instId)).toEqual([]);
    // s0 is hit → flagged.
    useTimelineStore.getState().toggleChipNoFullHeal(20, s0);
    expect(flagsOf(instId)).toEqual([s0]);
  });

  it("writes the flag to every instance in a simultaneous bucket (OR-merge consistency)", () => {
    const s0 = rosterSlotId(0);
    const a = addRaidwideAt(30);
    const b = addRaidwideAt(30);
    useTimelineStore.getState().toggleChipNoFullHeal(30, s0);
    expect(flagsOf(a)).toEqual([s0]);
    expect(flagsOf(b)).toEqual([s0]);
    // Toggling again clears both.
    useTimelineStore.getState().toggleChipNoFullHeal(30, s0);
    expect(flagsOf(a)).toEqual([]);
    expect(flagsOf(b)).toEqual([]);
  });

  it("toggling a (time, slot) with no hitting instance is a no-op", () => {
    const s0 = rosterSlotId(0);
    const instId = addRaidwideAt(10);
    const before = useTimelineStore.getState().timeline;
    useTimelineStore.getState().toggleChipNoFullHeal(999, s0);
    expect(useTimelineStore.getState().timeline).toBe(before);
    expect(flagsOf(instId)).toEqual([]);
  });
});

// ─── Slot reorder ──────────────────────────────
describe("timeline-store — reorderSlot", () => {
  beforeEach(freshTimeline);

  // Mirrors use-history-recorder.ts so undo/redo can be exercised in this unit
  // test (see history-store.test.ts startRecorder).
  function startRecorder(): () => void {
    return useTimelineStore.subscribe((state, prevState) => {
      const prev = prevState.timeline;
      const next = state.timeline;
      if (next === prev) return;
      const { record, reset } = useHistoryStore.getState();
      if (isDocumentBoundary(prev, next)) reset();
      else if (prev !== null) record(prev);
    });
  }

  function slotIds(): string[] {
    return (useTimelineStore.getState().timeline?.roster ?? []).map((s) => s.id);
  }

  it("permutes the roster for an adjacent move", () => {
    const ids = slotIds();
    useTimelineStore.getState().reorderSlot(0, 1);
    expect(slotIds()).toEqual([ids[1], ids[0], ids[2], ids[3], ids[4], ids[5], ids[6], ids[7]]);
  });

  it("permutes the roster for a far move (last → first)", () => {
    const ids = slotIds();
    useTimelineStore.getState().reorderSlot(7, 0);
    expect(slotIds()).toEqual([ids[7], ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], ids[6]]);
  });

  it("permutes damage_per_player in lockstep with the roster", () => {
    const tl = useTimelineStore.getState().timeline;
    if (!tl) throw new Error("no timeline");
    const typeId = useTimelineStore.getState().addBossAbilityType({
      name: "RW",
      base_damage: 1000,
      damage_type: "magical",
      target_pattern: "raidwide",
      boss_targetable: true,
    });
    const instId = useTimelineStore.getState().addBossAbilityInstance({
      type_id: typeId,
      effect_time: 10,
      target_slot_ids: [],
    });
    // Seed a position-keyed observed_damage entry directly (no public action yet).
    const seeded = useTimelineStore.getState().timeline;
    if (!seeded) throw new Error("no timeline");
    useTimelineStore.setState({
      timeline: {
        ...seeded,
        boss_ability_instances: seeded.boss_ability_instances.map((i) =>
          i.id === instId
            ? {
                ...i,
                observed_damage: [
                  {
                    source_label: "Sample",
                    imported_at: "2026-01-01T00:00:00.000Z",
                    damage_per_player: [0, 1, 2, 3, 4, 5, 6, 7],
                  },
                ],
              }
            : i,
        ),
      },
    });

    useTimelineStore.getState().reorderSlot(0, 2);

    const inst = useTimelineStore
      .getState()
      .timeline?.boss_ability_instances.find((i) => i.id === instId);
    // move([0..7], 0 → 2): drop index 0, reinsert at 2.
    expect(inst?.observed_damage[0].damage_per_player).toEqual([1, 2, 0, 3, 4, 5, 6, 7]);
  });

  it("leaves mits, selection, and HP/labels untouched", () => {
    const s0 = rosterSlotId(0);
    useTimelineStore.getState().setSlotHp(0, 180_000);
    useTimelineStore.getState().setSlotLabel(0, "MT");
    const mitId = useTimelineStore.getState().addMitigationInstance({
      type_id: RAMPART,
      player_slot_id: s0,
      effect_time: 10,
      target_slot_ids: [],
    });
    useTimelineStore.getState().selectMitInstance(mitId);
    const mitsBefore = useTimelineStore.getState().timeline?.mitigation_instances;

    useTimelineStore.getState().reorderSlot(0, 3);

    const tl = useTimelineStore.getState().timeline;
    // Mit array is identical (binds by slot ID, not position).
    expect(tl?.mitigation_instances).toBe(mitsBefore);
    expect(useTimelineStore.getState().selectedInstance).toEqual({ kind: "mit", id: mitId });
    // The slot's HP/label travels with it to index 3.
    const moved = tl?.roster.find((sl) => sl.id === s0);
    expect(moved?.hp).toBe(180_000);
    expect(moved?.name_label).toBe("MT");
    expect(tl?.roster[3].id).toBe(s0);
  });

  it("is a no-op for from === to and out-of-range indices", () => {
    const before = useTimelineStore.getState().timeline;
    useTimelineStore.getState().reorderSlot(2, 2);
    expect(useTimelineStore.getState().timeline).toBe(before);
    useTimelineStore.getState().reorderSlot(-1, 3);
    expect(useTimelineStore.getState().timeline).toBe(before);
    useTimelineStore.getState().reorderSlot(0, 8);
    expect(useTimelineStore.getState().timeline).toBe(before);
  });

  it("undo restores the prior order in one step; redo re-applies", () => {
    const stop = startRecorder();
    try {
      const ids = slotIds();
      useTimelineStore.getState().reorderSlot(0, 1);
      expect(slotIds()).toEqual([ids[1], ids[0], ...ids.slice(2)]);
      expect(useHistoryStore.getState().past).toHaveLength(1);

      useHistoryStore.getState().undo();
      expect(slotIds()).toEqual(ids);

      useHistoryStore.getState().redo();
      expect(slotIds()).toEqual([ids[1], ids[0], ...ids.slice(2)]);
    } finally {
      stop();
    }
  });
});
